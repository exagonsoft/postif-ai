import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { queueMedia } from "@/lib/media-generation";
import { WorkflowError } from "@/lib/post-policy";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand || ctx.memberRole === "viewer") return NextResponse.json({ error: "Generation permission required." }, { status: 403 });
    const input = z.object({ prompt: z.string().trim().min(5).max(1000), kind: z.enum(["image", "video"]), aspectRatio: z.enum(["1:1", "16:9", "9:16"]) }).parse(await req.json());
    if (input.kind === "video" && input.aspectRatio === "1:1") throw new WorkflowError("Choose landscape or portrait for video.");
    const asset = await queueMedia(ctx.workspace.id, ctx.activeBrand.id, ctx.user.id, input);
    return NextResponse.json({ ok: true, asset }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorkflowError ? error.message : "Could not queue generation. Check the prompt and provider settings." }, { status: error instanceof WorkflowError ? error.status : 400 });
  }
}
