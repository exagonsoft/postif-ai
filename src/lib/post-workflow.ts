import { db } from "@/db";
import { posts, brands, mediaAssets, publishingJobs, auditLogs, workspaces } from "@/db/schema";
import { and, eq, inArray } from "@/db/filters";
import { canApprove, resolvePostState, WorkflowError } from "./post-policy";
import { SOCIAL_PLATFORM_SPECS } from "./social-adapters";
import { notifyWorkspace } from "./notification-service";
import { z } from "zod";
import { assertBrandEntitlement, getPublishingUsage, getWorkspaceEntitlements, releasePublishingReservation, usagePeriod } from "./entitlements";
import { publishingReservations } from "@/db/entitlement-schema";
import { queueMedia, cancelQueuedMedia } from "./media-generation";
import { buildBrandMediaBrief } from "./brand-media-brief";
import { getWorkspacePublishing } from "./workspace-publishing";
import { createHash } from "node:crypto";
import { mediaReservations } from "@/db/worker-schema";
import { isScheduleSlot, SCHEDULE_SLOTS } from "./schedule-slots";
type Context = {
    workspaceId: number;
    userId: number;
    email: string;
    role: string;
    brandId: number;
};
const variant = z.object({ content: z.string().max(20000), hashtags: z.array(z.string()).max(30), cta: z.string(), formatLabel: z.string(), characterCount: z.number() });
const fields = z.object({
    title: z.string().trim().min(1).max(300).optional(), topic: z.string().max(2000).optional(),
    baseContent: z.string().max(30000).optional(), contentType: z.string().max(100).optional(), tone: z.string().max(100).optional(),
    brandId: z.number().int().positive().optional(),
    platforms: z.array(z.enum(Object.keys(SOCIAL_PLATFORM_SPECS) as [
        string,
        ...string[]
    ])).min(1).max(8).optional(),
    variants: z.record(z.string(), variant).optional(), mediaIds: z.array(z.number().int().positive()).max(10).optional(),
    status: z.string().optional(), scheduledAt: z.string().nullable().optional(), timezone: z.string().max(100).optional(),
    requiresApproval: z.boolean().optional(), notifyOnPublish: z.boolean().optional(), approvalNote: z.string().max(2000).nullable().optional(),
    automaticMedia: z.object({ kind: z.enum(["image", "video", "gif"]) }).nullable().optional(),
    retryMedia: z.boolean().optional(),
});
export function studioMediaKey(workspaceId: number, userId: number, key: string) {
    return createHash("sha256").update(`${workspaceId}:${userId}:${key}`).digest("hex");
}
export async function savePost(ctx: Context, raw: unknown, postId?: number, studioDraftKey?: string) {
    if (!["owner", "admin", "editor", "approver"].includes(ctx.role))
        throw new WorkflowError("Your role cannot modify posts.", 403);
    const parsed = fields.safeParse(raw);
    if (!parsed.success)
        throw new WorkflowError(parsed.error.issues[0]?.message || "Invalid post.");
    const body = parsed.data;
    if (studioDraftKey && (postId || body.status !== "draft" || !body.automaticMedia))
        throw new WorkflowError("A generated media draft requires a media type and draft status.");
    const studioKey = studioDraftKey ? studioMediaKey(ctx.workspaceId, ctx.userId, studioDraftKey) : null;
    const studioFingerprint = studioKey ? createHash("sha256").update(JSON.stringify(body)).digest("hex") : null;
    return db.transaction(async (tx) => {
        if (studioKey) {
            await tx.find(workspaces, eq("id", ctx.workspaceId), { lock: true });
            const [reservation] = await tx.find(mediaReservations, { workspaceId: ctx.workspaceId, studioKey });
            if (reservation) {
                if (reservation.studioFingerprint !== studioFingerprint) throw new WorkflowError("This generation request was already used for different content.", 409);
                const [previous] = await tx.find(posts, { id: reservation.studioPostId, workspaceId: ctx.workspaceId });
                if (!previous) throw new WorkflowError("The generated draft was removed. Verify the media operation before starting another.", 409);
                return previous;
            }
        }
        const publishing = await getWorkspacePublishing(ctx.workspaceId, tx);
        const role = !publishing.isTeamWorkspace && publishing.ownerId === ctx.userId ? "owner" : ctx.role;
        const [existing] = postId ? await tx.find(posts, and(eq("id", postId), eq("workspaceId", ctx.workspaceId)), { lock: true }) : [];
        if (postId && !existing)
            throw new WorkflowError("Post not found.", 404);
        if (existing?.mediaDraft && existing.status === "waiting_media" && body.status !== "cancelled")
            throw new WorkflowError("Wait for media generation to finish before changing the draft.", 409);
        if (existing?.mediaDraft && body.retryMedia)
            throw new WorkflowError("Verify the provider before creating another media generation.", 409);
        const brandId = body.brandId ?? existing?.brandId ?? ctx.brandId;
        const [brand] = await tx.find(brands, and(eq("id", brandId), eq("workspaceId", ctx.workspaceId)), {});
        if (!brand)
            throw new WorkflowError("Brand does not belong to this workspace.", 403);
        await assertBrandEntitlement(ctx.workspaceId, brandId, tx);
        const mediaIds = [...new Set(body.mediaIds ?? existing?.mediaIds ?? [])];
        const media = mediaIds.length ? await tx.find(mediaAssets, and(eq("workspaceId", ctx.workspaceId), inArray("id", mediaIds)), { lock: true }) : [];
        if (media.length !== mediaIds.length || media.some(m => m.generationStatus !== "ready" || !m.storageKey))
            throw new WorkflowError("Attach only completed image or video uploads/generations from this workspace.");
        const platforms = [...new Set(body.platforms ?? existing?.platforms ?? ["linkedin"])];
        const baseContent = body.baseContent ?? existing?.baseContent ?? "";
        const variants = body.variants ?? existing?.variants ?? {};
        const title = body.title ?? existing?.title ?? body.topic ?? "Untitled Post";
        const selectedMedia = body.automaticMedia !== undefined ? body.automaticMedia : existing?.automaticMedia ?? null;
        const automaticMedia = selectedMedia ? { kind: selectedMedia.kind } : null;
        const topic = body.topic ?? existing?.topic ?? "";
        const mediaSettingsChanged = automaticMedia?.kind !== existing?.automaticMedia?.kind || !!(existing && automaticMedia && (topic !== existing.topic || title !== existing.title || baseContent !== existing.baseContent || brandId !== existing.brandId || JSON.stringify(platforms) !== JSON.stringify(existing.platforms)));
        let automaticMediaId = mediaSettingsChanged ? null : existing?.automaticMediaId ?? null;
        if (mediaSettingsChanged && existing?.automaticMediaId) {
            const oldIndex = mediaIds.indexOf(existing.automaticMediaId);
            if (oldIndex >= 0)
                mediaIds.splice(oldIndex, 1);
        }
        const requiresApproval = body.status === "pending_approval" ? true : body.requiresApproval ?? existing?.requiresApproval ?? publishing.isTeamWorkspace;
        if (!requiresApproval && !canApprove(role))
            throw new WorkflowError("Your team role requires an approver to sign off before publishing.", 403);
        const contentChanged = !!existing && (mediaSettingsChanged || !!body.retryMedia || title !== existing.title || baseContent !== existing.baseContent || brandId !== existing.brandId ||
            JSON.stringify(platforms) !== JSON.stringify(existing.platforms) || JSON.stringify(variants) !== JSON.stringify(existing.variants) ||
            JSON.stringify(mediaIds) !== JSON.stringify(existing.mediaIds) || requiresApproval !== existing.requiresApproval);
        const now = new Date();
        const state = resolvePostState({
            requested: body.status ?? (["waiting_media", "media_failed"].includes(existing?.status || "") ? (requiresApproval ? "pending_approval" : "scheduled") : contentChanged && existing?.approvedAt ? "pending_approval" : existing?.status) ?? "draft", previous: existing?.status,
            requiresApproval, approved: !!existing?.approvedAt, contentChanged, role,
            scheduledAt: body.scheduledAt !== undefined ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : existing?.scheduledAt ?? null, now,
        });
        if (body.status !== "published" && state.scheduledAt && ["scheduled", "pending_approval", "approved"].includes(state.status)) {
            const timezone = body.timezone ?? existing?.timezone ?? "UTC";
            const unchanged = !!existing?.scheduledAt && existing.scheduledAt.getTime() === state.scheduledAt.getTime() &&
                existing.timezone === timezone && ["scheduled", "pending_approval", "approved", "waiting_media", "media_failed"].includes(existing.status);
            if (!unchanged) {
                let valid: boolean;
                try { valid = isScheduleSlot(state.scheduledAt, timezone); }
                catch { throw new WorkflowError("Choose a valid timezone for scheduling."); }
                if (!valid) throw new WorkflowError(`Choose a publishing time from: ${SCHEDULE_SLOTS.join(", ")} in the selected timezone.`);
            }
        }
        if (platforms.includes("facebook") && (state.status === "scheduled" || (state.status === "pending_approval" && !!state.scheduledAt)) &&
            (media.some(asset => asset.assetType !== "image") || (automaticMedia && automaticMedia.kind !== "image")))
            throw new WorkflowError("Facebook publishing currently supports text and a single image, not video or GIF. Choose an image or another platform.", 400);
        if (existing?.automaticMediaId && (state.status === "cancelled" || mediaSettingsChanged)) {
            await cancelQueuedMedia(tx, existing.automaticMediaId, ctx.workspaceId);
            if (state.status === "cancelled")
                automaticMediaId = null;
        }
        if (automaticMedia && (!["draft", "cancelled"].includes(state.status) || !!studioKey)) {
            if (body.status === "approved" && ["waiting_media", "media_failed"].includes(existing?.status || ""))
                throw new WorkflowError("Wait for the generated media before approving the post.", 409);
            if (!studioKey && (!state.scheduledAt || state.scheduledAt <= now))
                throw new WorkflowError("Choose a future publishing time for automatic media generation.");
            if (!automaticMediaId || body.retryMedia) {
                if (mediaIds.length >= 10)
                    throw new WorkflowError("Leave one attachment slot for automatically generated media.");
                if (body.retryMedia && automaticMediaId) {
                    const [prior] = await tx.find(mediaAssets, eq("id", automaticMediaId), {});
                    if (prior && ["queued", "processing"].includes(prior.generationStatus))
                        throw new WorkflowError("Media generation is already in progress.", 409);
                }
                const [workspace] = await tx.find(workspaces, eq("id", ctx.workspaceId), {});
                const brief = buildBrandMediaBrief({ kind: automaticMedia.kind, topic, title, text: baseContent, platforms, workspaceName: workspace.name, brand });
                const asset = await queueMedia(ctx.workspaceId, brandId, ctx.userId, brief, tx);
                await tx.update(mediaAssets, eq("id", asset.id), { title: `${brand.name} — ${title}`.slice(0, 300), altText: `${title} — ${brand.name}`.slice(0, 500) });
                automaticMediaId = asset.id;
            }
            const [asset] = await tx.find(mediaAssets, eq("id", automaticMediaId), {});
            if (asset.generationStatus !== "ready") {
                state.status = asset.generationStatus === "failed" ? "media_failed" : "waiting_media";
                state.approved = false;
            }
            else if (!mediaIds.includes(asset.id)) {
                mediaIds.push(asset.id);
                state.approved = false;
                if (requiresApproval)
                    state.status = "pending_approval";
            }
        }
        if (!["draft", "cancelled"].includes(state.status) && !baseContent.trim())
            throw new WorkflowError("Generate or write the post before submitting it.");
        if (state.status === "scheduled") {
            const { plan } = await getWorkspaceEntitlements(ctx.workspaceId, tx);
            const usage = await getPublishingUsage(ctx.workspaceId, tx);
            const [reserved] = existing ? await tx.find(publishingReservations, { workspaceId: ctx.workspaceId, postId: existing.id, status: { $in: ["reserved", "consumed"] } }) : [];
            if (usagePeriod(state.scheduledAt ?? now) === usage.period && usage.used >= plan.maxPostsPerMonth && !reserved)
                throw new WorkflowError("Monthly publishing limit reached.", 403);
        }
        const values = {
            brandId, title, baseContent, platforms, variants, mediaIds, requiresApproval, automaticMedia, automaticMediaId,
            topic: body.topic ?? existing?.topic ?? "", contentType: body.contentType ?? existing?.contentType ?? "Educational Post",
            tone: body.tone ?? existing?.tone ?? "Professional",
            status: state.status === "scheduled" && body.status === "published" ? "publishing" : state.status,
            deliveryMode: state.status === "scheduled" && body.status === "published" ? "immediate" as const : "scheduled" as const,
            mediaDraft: studioKey ? true : existing?.mediaDraft && body.automaticMedia !== null ? true : false,
            scheduledAt: state.scheduledAt,
            timezone: body.timezone ?? existing?.timezone ?? "UTC", notifyOnPublish: body.notifyOnPublish ?? existing?.notifyOnPublish ?? true,
            approvedAt: state.approved ? existing?.approvedAt ?? now : null,
            approvedBy: state.approved ? existing?.approvedBy ?? ctx.userId : null,
            approvalNote: body.approvalNote ?? existing?.approvalNote ?? null, updatedAt: now,
        };
        const [post] = existing
            ? await tx.update(posts, eq("id", existing.id), values)
            : await tx.insert(posts, { ...values, workspaceId: ctx.workspaceId });
        if (studioKey && automaticMediaId) {
            await tx.update(mediaReservations, { workspaceId: ctx.workspaceId, assetId: automaticMediaId }, {
                studioKey, studioFingerprint: studioFingerprint!, studioPostId: post.id,
            });
        }
        await tx.update(publishingJobs, and(eq("postId", post.id), inArray("status", ["queued", "blocked", "retrying", "failed"])), { status: "cancelled" });
        if (post.status === "cancelled") await releasePublishingReservation(ctx.workspaceId, post.id, tx);
        if (["scheduled", "publishing"].includes(post.status) && post.scheduledAt) {
            for (const platform of platforms)
                await tx.insert(publishingJobs, {
                    workspaceId: ctx.workspaceId,
                    postId: post.id,
                    platform,
                    scheduledFor: post.scheduledAt,
                    deliveryMode: body.status === "published" ? "immediate" : "scheduled",
                    idempotencyKey: `post-${post.id}-${platform}-${crypto.randomUUID()}`,
                });
        }
        if (post.status === "pending_approval" && (existing?.status !== "pending_approval" || contentChanged)) {
            await notifyWorkspace(tx, ctx.workspaceId, "approval_requested", publishing.isTeamWorkspace ? "Post ready for approval" : "Your post is ready to review", `“${post.title}” is waiting for ${publishing.isTeamWorkspace ? "team approval" : "your review"}.`, "/app/posts", true);
        }
        await tx.insert(auditLogs, { workspaceId: ctx.workspaceId, actorEmail: ctx.email, action: `post.${post.status}`, resourceType: "post", resourceId: String(post.id), metadata: { requiresApproval, approvedBy: post.approvedBy } });
        return post;
    });
}
