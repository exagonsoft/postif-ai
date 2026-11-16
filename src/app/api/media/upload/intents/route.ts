import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createMediaUploadIntent, getMediaUploadCapability } from "@/lib/media-upload-intents";
import { MediaStorageError } from "@/lib/media-storage";
import { WorkflowError } from "@/lib/post-policy";
export const runtime = "nodejs";
export const maxDuration = 30;
function failure(error: unknown) {
  if (error instanceof MediaStorageError || error instanceof WorkflowError)
    return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ error: "Media upload service is unavailable." }, { status: 503 });
}
export async function GET() {
  try { return NextResponse.json(await getMediaUploadCapability(await getAuthContext()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    await getMediaUploadCapability(auth);
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw new MediaStorageError("JSON upload metadata is required.", 415);
    // Intents are metadata only; never read an unbounded JSON request.
    const reader = req.body?.getReader();
    if (!reader) throw new MediaStorageError("Upload metadata is required.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) throw new MediaStorageError("Upload metadata is too large.", 413);
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new MediaStorageError("Invalid upload metadata.", 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new MediaStorageError("Invalid upload metadata.", 400);
    return NextResponse.json(await createMediaUploadIntent(auth, input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
