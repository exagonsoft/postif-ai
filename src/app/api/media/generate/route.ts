import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { checkMediaGeneration, queueMedia } from "@/lib/media-generation";
import { WorkflowError } from "@/lib/post-policy";
import { mediaDiagnostic } from "@/lib/media-diagnostics";
import { z } from "zod";
export async function GET(req: Request) {
  let step = "authentication";
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand || !["owner", "admin", "editor", "approver"].includes(ctx.memberRole)) return NextResponse.json({ error: "Generation permission required." }, { status: 403 });
    step = "request_validation";
    const url = new URL(req.url);
    const kind = z.enum(["image", "video", "gif"]).parse(url.searchParams.get("kind"));
    const brandId = z.coerce.number().int().positive().parse(url.searchParams.get("brandId"));
    step = "media_readiness";
    return NextResponse.json({ ok: true, ...(await checkMediaGeneration(ctx.workspace.id, brandId, kind)) });
  } catch (error) {
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid media generation request." }, { status: 400 });
    mediaDiagnostic("preflight", { step, result: "unexpected" });
    console.error("Media generation readiness check failed");
    return NextResponse.json({ error: "Could not check media generation settings." }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand || ctx.memberRole === "viewer") return NextResponse.json({ error: "Generation permission required." }, { status: 403 });
    const input = z.object({ prompt: z.string().trim().min(5).max(1000), kind: z.enum(["image", "video", "gif"]), aspectRatio: z.enum(["1:1", "16:9", "9:16"]) }).parse(await req.json());
    if (input.kind !== "image" && input.aspectRatio === "1:1") throw new WorkflowError("Choose landscape or portrait for video or GIF.");
    const asset = await queueMedia(ctx.workspace.id, ctx.activeBrand.id, ctx.user.id, input);
    return NextResponse.json({ ok: true, asset }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorkflowError ? error.message : "Could not queue generation. Check the prompt and provider settings." }, { status: error instanceof WorkflowError ? error.status : 400 });
  }
}
