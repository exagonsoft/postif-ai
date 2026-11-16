import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { savePost } from "@/lib/post-workflow";
import { WorkflowError } from "@/lib/post-policy";
import { cancelQueuedMedia } from "@/lib/media-generation";
import { releasePublishingReservation, retainPublishedUsage } from "@/lib/entitlements";
export async function GET() {
    const ctx = await getAuthContext();
    if (!ctx?.workspace)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ ok: true, posts: await db.find(posts, eq("workspaceId", ctx.workspace.id), { sort: { createdAt: -1 } }) });
}
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx?.workspace || !ctx.activeBrand)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const context = { workspaceId: ctx.workspace.id, userId: ctx.user.id, email: ctx.user.email, role: ctx.memberRole, brandId: ctx.activeBrand.id };
        const body = await req.json();
        if (body.action === "create" || body.action === "update") {
            if (body.action === "update" && !Number.isSafeInteger(body.postId))
                throw new WorkflowError("Invalid post ID.");
            return NextResponse.json({ ok: true, post: await savePost(context, body, body.action === "update" ? body.postId : undefined) });
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
        console.error("Post operation failed", error);
        return NextResponse.json({ error: "Could not save the post." }, { status: 500 });
    }
}
