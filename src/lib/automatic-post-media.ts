import { db } from "@/db";
import { posts, mediaAssets, publishingJobs } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { queueWorkspaceNotification } from "./notification-service";
import { getWorkspacePublishing } from "./workspace-publishing";
import { hasTime, type WorkerOptions } from "./worker-budget";
// Reconcile independently of provider polling so a restart cannot lose a completed attachment.
export async function reconcileAutomaticPostMedia({ deadline, limit = 20 }: WorkerOptions = {}) {
    const candidates = await db.find(posts, eq("status", "waiting_media"), { projection: { id: 1 }, limit });
    let completed = 0;
    for (const candidate of candidates) {
        if (!hasTime(deadline)) break;
        await db.transaction(async (tx) => {
            const [post] = await tx.find(posts, and(eq("id", candidate.id), eq("status", "waiting_media")), { lock: true });
            if (!post?.automaticMediaId)
                return;
            const [asset] = await tx.find(mediaAssets, and(eq("id", post.automaticMediaId), eq("workspaceId", post.workspaceId)), {});
            if (asset && ["queued", "processing"].includes(asset.generationStatus))
                return;
            const expired = !post.scheduledAt || post.scheduledAt <= new Date();
            if (!asset || asset.generationStatus !== "ready" || !asset.storageKey || expired) {
                const message = expired && asset?.generationStatus === "ready"
                    ? "Media is ready, but the publishing time has passed. Choose a new time before scheduling."
                    : asset?.generationError || "Automatic media generation failed. Review the media settings and retry.";
                await tx.update(posts, eq("id", post.id), { status: "media_failed", approvalNote: message, approvedAt: null, approvedBy: null, updatedAt: new Date() });
                if (post.notifyOnPublish)
                    await queueWorkspaceNotification(tx, `media-failed:${post.id}:${post.automaticMediaId}`, post.workspaceId, "publish_failed", "Scheduled post needs attention", `${post.title}: ${message}`, "/app/posts");
                return;
            }
            const status = post.requiresApproval ? "pending_approval" : "scheduled";
            await tx.update(posts, eq("id", post.id), { status, mediaIds: [...new Set([...post.mediaIds, asset.id])], approvedAt: null, approvedBy: null, approvalNote: null, updatedAt: new Date() });
            if (post.requiresApproval) {
                const { isTeamWorkspace } = await getWorkspacePublishing(post.workspaceId, tx);
                await queueWorkspaceNotification(tx, `media-ready:${post.id}:${asset.id}`, post.workspaceId, "approval_requested", isTeamWorkspace ? "Post and generated media ready for team approval" : "Your post and media are ready to review", `“${post.title}” is ready. Review the text and generated ${asset.assetType} before publishing.`, "/app/posts", true);
            }
            else {
                for (const platform of post.platforms)
                    await tx.insert(publishingJobs, { workspaceId: post.workspaceId, postId: post.id, platform, scheduledFor: post.scheduledAt!, idempotencyKey: `auto-media-${post.id}-${asset.id}-${platform}` }, { ignoreDuplicates: true });
            }
            completed++;
        });
    }
    return completed;
}
