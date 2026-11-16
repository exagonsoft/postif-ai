import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { readMedia, mediaDownloadUrl, MediaStorageError } from "@/lib/media-storage";
export const runtime = "nodejs";
export async function GET(req: Request, context: {
    params: Promise<{
        id: string;
    }>;
}) {
    const ctx = await getAuthContext();
    if (!ctx?.workspace)
        return new Response("Unauthorized", { status: 401 });
    const { id } = await context.params;
    if (!/^\d+$/.test(id))
        return new Response("Not found", { status: 404 });
    const [asset] = await db.find(mediaAssets, and(eq("id", Number(id)), eq("workspaceId", ctx.workspace.id)), {});
    if (!asset?.storageKey || asset.generationStatus !== "ready")
        return new Response("Not found", { status: 404 });
    try {
        const downloadUrl = await mediaDownloadUrl(asset);
        if (downloadUrl) return new Response(null, { status: 307, headers: { Location: downloadUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
        const bytes = await readMedia(asset);
        const headers: Record<string, string> = { "Content-Type": asset.mimeType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" };
        const range = req.headers.get("range");
        if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (!match || (!match[1] && !match[2]))
                return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
            const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
            const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length)
                return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
            return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end - start + 1) } });
        }
        return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
    }
    catch (error) {
        console.error("Media retrieval failed", { assetId: asset.id, workspaceId: ctx.workspace.id, status: error instanceof MediaStorageError ? error.status : 503 });
        return new Response("Media file unavailable", { status: error instanceof MediaStorageError ? error.status : 503 });
    }
}
