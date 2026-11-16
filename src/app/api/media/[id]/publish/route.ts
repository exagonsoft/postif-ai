import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { readMedia, mediaDownloadUrl } from "@/lib/media-storage";
import { verifyPublishingMedia } from "@/lib/publishing-media";
import { imageToJpeg } from "@/lib/gif-generation";

export const runtime = "nodejs";
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "original";
  if (!verifyPublishingMedia(Number(id), Number(url.searchParams.get("expires")), url.searchParams.get("signature") || "", format)) return new Response("Not found", { status: 404 });
  const [asset] = await db.find(mediaAssets, { id: Number(id), generationStatus: "ready" });
  if (!asset?.storageKey || !asset.mimeType) return new Response("Not found", { status: 404 });
  try {
    if (format === "jpeg" && asset.assetType !== "image") return new Response("Invalid media format", { status: 400 });
    if (format === "original" || asset.mimeType === "image/jpeg") {
      const downloadUrl = await mediaDownloadUrl(asset);
      if (downloadUrl) return new Response(null, { status: 307, headers: { Location: downloadUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    }
    let bytes = await readMedia(asset);
    if (format === "jpeg" && asset.mimeType !== "image/jpeg") bytes = await imageToJpeg(bytes);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": format === "jpeg" ? "image/jpeg" : asset.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("Publishing media read failed", { assetId: asset.id, code: error instanceof Error && "code" in error ? error.code : "read_failed" });
    return new Response("Media unavailable", { status: 503 });
  }
}
