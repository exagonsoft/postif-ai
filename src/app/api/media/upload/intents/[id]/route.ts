import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { completeMediaUploadIntent, cancelMediaUploadIntent } from "@/lib/media-upload-intents";
import { MediaStorageError } from "@/lib/media-storage";
import { WorkflowError } from "@/lib/post-policy";
export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };
async function handle(ctx: Context, cancel: boolean) {
  try {
    const { id } = await ctx.params;
    const auth = await getAuthContext();
    const result = cancel ? await cancelMediaUploadIntent(auth, id) : { asset: await completeMediaUploadIntent(auth, id) };
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaStorageError || error instanceof WorkflowError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Media upload could not be completed. Retry before the upload expires." }, { status: 503 });
  }
}
export async function POST(_req: Request, ctx: Context) { return handle(ctx, false); }
export async function DELETE(_req: Request, ctx: Context) { return handle(ctx, true); }
