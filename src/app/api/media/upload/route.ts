import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { MAX_MEDIA_BYTES, storeMedia, deleteMedia, readLimitedResponse, MediaStorageError } from "@/lib/media-storage";
export const runtime = "nodejs";
export async function POST(req: Request) {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand || ctx.memberRole === "viewer")
        return NextResponse.json({ error: "Upload permission required." }, { status: 403 });
    try {
        // Raw upload is streamed with a byte limit; the declared MIME type is never trusted.
        if (Number(req.headers.get("content-length")) > MAX_MEDIA_BYTES)
            return NextResponse.json({ error: "File exceeds 50 MB." }, { status: 413 });
        const bytes = await readLimitedResponse(new Response(req.body));
        const title = decodeURIComponent(req.headers.get("x-file-name") || "Uploaded media").slice(0, 300);
        const stored = await storeMedia(bytes, ctx.workspace.id);
        try {
        const [asset] = await db.insert(mediaAssets, { workspaceId: ctx.workspace.id, brandId: ctx.activeBrand.id, title, ...stored, url: "", altText: title, isSampleData: false });
        return NextResponse.json({ ok: true, asset: { id: asset.id, title, assetType: asset.assetType, url: `/api/media/${asset.id}/content`, generationStatus: "ready" } });
        } catch (error) {
            try { await deleteMedia({ workspaceId: ctx.workspace.id, ...stored }); }
            catch { console.error("Media upload rollback cleanup failed", { workspaceId: ctx.workspace.id }); }
            throw error;
        }
    }
    catch (error) {
        if (error instanceof MediaStorageError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Media upload failed", { workspaceId: ctx.workspace.id });
        return NextResponse.json({ error: "Upload could not be saved." }, { status: 500 });
    }
}
