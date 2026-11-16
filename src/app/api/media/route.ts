import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets, posts } from "@/db/schema";
import { and, eq, arrayContains } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { deleteMedia, MediaStorageError } from "@/lib/media-storage";
import { WorkflowError } from "@/lib/post-policy";
export async function GET() {
    const ctx = await getAuthContext();
    if (!ctx?.workspace)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const assets = await db.find(mediaAssets, eq("workspaceId", ctx.workspace.id), {});
    return NextResponse.json({ assets: assets.filter(asset => asset.storageKey || asset.generationStatus !== "ready").map(asset => ({ id: asset.id, title: asset.title, assetType: asset.assetType, url: `/api/media/${asset.id}/content`, generationStatus: asset.generationStatus, generationError: asset.generationError })) });
}
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx || !ctx.workspace || !ctx.user || !ctx.activeBrand) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await req.json();
        if (ctx.memberRole === "viewer")
            return NextResponse.json({ error: "Media editing permission required." }, { status: 403 });
        const action = body.action as string;
        if (action === "update") {
            const id = Number(body.assetId);
            const [attached] = await db.find(posts, and(eq("workspaceId", ctx.workspace.id), arrayContains("mediaIds", [id])), { projection: { id: 1 }, limit: 1 });
            if (attached)
                return NextResponse.json({ error: "This media is attached to a post. Remove it from the post before changing or deleting it." }, { status: 409 });
            const [asset] = await db.find(mediaAssets, and(eq("id", id), eq("workspaceId", ctx.workspace.id)), {});
            if (!asset) return NextResponse.json({ error: "Media not found." }, { status: 404 });
            if (["queued", "processing", "deleting"].includes(asset.generationStatus))
                return NextResponse.json({ error: "Wait for generation to finish before changing this asset." }, { status: 409 });
        }
        if (action === "create") {
            return NextResponse.json({ error: "Placeholder assets are not supported. Upload media or use media generation." }, { status: 410 });
        }
        if (action === "update") {
            const assetId = Number(body.assetId);
            const [updated] = await db.update(mediaAssets, and(eq("id", assetId), eq("workspaceId", ctx.workspace.id)), {
                aspectRatio: body.aspectRatio ? String(body.aspectRatio) : undefined,
                brandPreset: body.brandPreset ? String(body.brandPreset) : undefined,
                altText: body.altText !== undefined ? String(body.altText) : undefined,
            });
            return NextResponse.json({ ok: true, asset: updated });
        }
        if (action === "delete") {
            const assetId = Number(body.assetId);
            if (!Number.isSafeInteger(assetId) || assetId < 1) throw new WorkflowError("Invalid media ID.");
            const workspaceId = ctx.workspace.id;
            const asset = await db.transaction(async tx => {
                const [asset] = await tx.find(mediaAssets, { id: assetId, workspaceId }, { lock: true });
                if (!asset) throw new WorkflowError("Media not found.", 404);
                if (["queued", "processing"].includes(asset.generationStatus)) throw new WorkflowError("Wait for generation to finish before deleting this asset.", 409);
                const [attached] = await tx.find(posts, and(eq("workspaceId", workspaceId), arrayContains("mediaIds", [assetId])), { limit: 1 });
                if (attached) throw new WorkflowError("This media is attached to a post. Remove it from the post before deleting it.", 409);
                await tx.update(mediaAssets, { id: assetId }, { generationStatus: "deleting" });
                return asset;
            });
            // External storage deletion must not run inside a retryable database transaction.
            if (asset.storageKey) await deleteMedia(asset);
            await db.remove(mediaAssets, { id: assetId, workspaceId, generationStatus: "deleting" });
            return NextResponse.json({ ok: true });
        }
        return NextResponse.json({ error: "Invalid media action" }, { status: 400 });
    }
    catch (err) {
        if (err instanceof WorkflowError || err instanceof MediaStorageError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error("Media API operation failed");
        return NextResponse.json({ error: "Media operation failed" }, { status: 500 });
    }
}
