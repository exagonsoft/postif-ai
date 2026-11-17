import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts, publishingJobs } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { savePost, studioMediaKey } from "@/lib/post-workflow";
import { WorkflowError } from "@/lib/post-policy";
import { cancelQueuedMedia, refreshPendingMedia } from "@/lib/media-generation";
import { assertBrandEntitlement, releasePublishingReservation, retainPublishedUsage } from "@/lib/entitlements";
import { reconcileAutomaticPostMedia } from "@/lib/automatic-post-media";
import { processImmediatePost } from "@/lib/publishing-worker";
import { z } from "zod";
import { mediaDiagnostic } from "@/lib/media-diagnostics";
import { mediaReservations } from "@/db/worker-schema";
export const maxDuration = 30;
export async function GET(req: Request) {
    const ctx = await getAuthContext();
    if (!ctx?.workspace)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id");
    if (id !== null) {
        const postId = Number(id);
        if (!Number.isSafeInteger(postId) || postId < 1) return NextResponse.json({ error: "Invalid post ID." }, { status: 400 });
        const [post] = await db.find(posts, { id: postId, workspaceId: ctx.workspace.id });
        return post ? NextResponse.json({ ok: true, post }) : NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, posts: await db.find(posts, eq("workspaceId", ctx.workspace.id), { sort: { createdAt: -1 } }) });
}
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx?.workspace || !ctx.activeBrand)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const context = { workspaceId: ctx.workspace.id, userId: ctx.user.id, email: ctx.user.email, role: ctx.memberRole, brandId: ctx.activeBrand.id };
        const body = await req.json();
        if (body.action === "advance_media_draft") {
            if (!["owner", "admin", "editor", "approver"].includes(ctx.memberRole))
                throw new WorkflowError("Generation permission required.", 403);
            if (!Number.isSafeInteger(body.postId) || body.postId < 1)
                throw new WorkflowError("Invalid post ID.");
            const [post] = await db.find(posts, { id: body.postId, workspaceId: ctx.workspace.id });
            if (!post) throw new WorkflowError("Post not found.", 404);
            const [reservation] = await db.find(mediaReservations, { workspaceId: ctx.workspace.id, studioPostId: post.id });
            if (!reservation) throw new WorkflowError("Media draft reservation not found.", 404);
            await assertBrandEntitlement(ctx.workspace.id, post.brandId);
            if (post.mediaDraft && post.status === "waiting_media" && post.automaticMediaId === reservation.assetId) {
                const deadline = Date.now() + 20000;
                await refreshPendingMedia({ deadline, limit: 1, target: { workspaceId: ctx.workspace.id, assetId: reservation.assetId } });
                await reconcileAutomaticPostMedia({ deadline, limit: 1, target: { workspaceId: ctx.workspace.id, postId: post.id } });
            }
            const [current] = await db.find(posts, { id: post.id, workspaceId: ctx.workspace.id });
            if (!current) throw new WorkflowError("Post not found.", 404);
            return NextResponse.json({ ok: true, post: current, mediaAssetId: reservation.assetId });
        }
        if (body.action === "create_media_draft") {
            const key = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/).safeParse(req.headers.get("Idempotency-Key"));
            if (!key.success) throw new WorkflowError("A valid idempotency key is required.");
            const post = await savePost(context, { ...body, status: "draft" }, undefined, key.data);
            const [reservation] = await db.find(mediaReservations, { workspaceId: ctx.workspace.id, studioKey: studioMediaKey(ctx.workspace.id, ctx.user.id, key.data) });
            if (!reservation) throw new Error("Media draft reservation not found.");
            mediaDiagnostic("draft", { kind: post.automaticMedia?.kind || "completed", result: post.status });
            return NextResponse.json({ ok: true, post, mediaAssetId: reservation.assetId });
        }
        if (body.action === "create" || body.action === "update") {
            if (body.action === "update" && !Number.isSafeInteger(body.postId))
                throw new WorkflowError("Invalid post ID.");
            let post = await savePost(context, body, body.action === "update" ? body.postId : undefined);
            if (body.status === "published" && post.status === "publishing") {
                try {
                    await processImmediatePost(ctx.workspace.id, post.id);
                } catch {
                    console.error("Immediate publishing interrupted", { postId: post.id });
                    return NextResponse.json({ error: "Post saved, but publishing could not be confirmed. Check the calendar and the platform before trying again." }, { status: 500 });
                }
                [post] = await db.find(posts, { id: post.id, workspaceId: ctx.workspace.id });
                const jobs = await db.find(publishingJobs, { postId: post.id, workspaceId: ctx.workspace.id, deliveryMode: "immediate", status: { $ne: "cancelled" } });
                return NextResponse.json({ ok: true, post, publishing: jobs.map(({ id, platform, status, errorMessage }) => ({ id, platform, status, errorMessage })) });
            }
            return NextResponse.json({ ok: true, post });
        }
        if (ctx.memberRole === "viewer")
            throw new WorkflowError("Your role cannot modify posts.", 403);
        const [post] = await db.find(posts, and(eq("id", Number(body.postId)), eq("workspaceId", ctx.workspace.id)), {});
        if (!post)
            throw new WorkflowError("Post not found.", 404);
        if (body.action === "duplicate")
            return NextResponse.json({ ok: true, post: await savePost(context, {
                    title: `${post.title} (Copy)`, brandId: post.brandId, topic: post.topic, baseContent: post.baseContent,
                    contentType: post.contentType, tone: post.tone, platforms: post.platforms, variants: post.variants,
                    mediaIds: post.automaticMedia ? post.mediaIds.filter(id => id !== post.automaticMediaId) : post.mediaIds,
                    automaticMedia: post.automaticMedia, notifyOnPublish: post.notifyOnPublish, status: "draft",
                }) });
        if (body.action === "delete") {
            await db.transaction(async (tx) => {
                const [locked] = await tx.find(posts, eq("id", post.id), { lock: true });
                if (locked?.status === "publishing")
                    throw new WorkflowError("Publishing is in progress. Try again later.", 409);
                if (locked?.automaticMediaId)
                    await cancelQueuedMedia(tx, locked.automaticMediaId, ctx.workspace!.id);
                if (locked) await retainPublishedUsage(locked, tx);
                await releasePublishingReservation(ctx.workspace!.id, post.id, tx);
                await tx.remove(posts, eq("id", post.id));
            });
            return NextResponse.json({ ok: true });
        }
        throw new WorkflowError("Invalid post action.");
    }
    catch (error) {
        if (error instanceof WorkflowError)
            return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Post operation failed");
        return NextResponse.json({ error: "Could not save the post." }, { status: 500 });
    }
}
