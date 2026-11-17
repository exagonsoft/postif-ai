import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { z } from "zod";
import { assertBrandEntitlement, assertFeature } from "@/lib/entitlements";
import { WorkflowError } from "@/lib/post-policy";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import {
  generateMultiPlatformPosts,
  transformPostText,
  generateCampaignBlueprint,
  AIRequestError,
} from "@/lib/ai-engine";

const requestInput = z.object({
  mode: z.enum(["generate", "transform", "repurpose", "campaign"]),
  mediaType: z.enum(["none", "image", "video", "gif"]).optional(),
  automaticMedia: z.object({ kind: z.enum(["image", "video", "gif"]) }).nullable().optional(),
  topic: z.string().max(2000).optional(),
  prompt: z.string().max(10000).optional(),
  brandName: z.string().max(300).optional(),
  objective: z.string().max(2000).optional(),
  audience: z.string().max(2000).optional(),
  platforms: z.array(z.string().refine(value => Object.hasOwn(SOCIAL_PLATFORM_SPECS, value))).min(1).max(8).optional(),
  tone: z.string().max(100).optional(),
  language: z.string().max(100).optional(),
  contentType: z.string().max(100).optional(),
  length: z.string().max(100).optional(),
  keywords: z.union([z.array(z.string().max(100)).max(30), z.string().max(3000)]).optional(),
  cta: z.string().max(2000).optional(),
  text: z.string().max(30000).optional(),
  action: z.enum(["rewrite", "improve", "shorten", "expand", "translate", "tone", "hashtags", "cta"]).optional(),
  targetTone: z.string().max(100).optional(),
  targetLanguage: z.string().max(100).optional(),
  platform: z.string().max(30).optional(),
  sourceText: z.string().max(30000).optional(),
  sourceType: z.string().max(100).optional(),
  preserveMeaning: z.boolean().optional(),
  avoidRepetition: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace || !ctx.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["owner", "admin", "editor", "approver"].includes(ctx.memberRole)) throw new WorkflowError("AI generation permission required.", 403);
    if (ctx.activeBrand) await assertBrandEntitlement(ctx.workspace.id, ctx.activeBrand.id);

    const body = requestInput.parse(await req.json());
    const mode = body.mode;
    if ((body.mediaType && body.mediaType !== "none") || body.automaticMedia)
      throw new WorkflowError("Text generation does not create media. Use the Content Studio media draft workflow.");
    const requestKey = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/).optional().parse(req.headers.get("Idempotency-Key") ?? undefined);

    if (mode === "generate") {
      if (!String(body.topic || "").trim() && !String(body.prompt || "").trim()) return NextResponse.json({ error: "Enter a topic or idea before generating a post." }, { status: 400 });
      const result = await generateMultiPlatformPosts({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        requestKey,
        brandName: String(body.brandName || ctx.activeBrand?.name || ctx.workspace.name),
        topic: String(body.topic || "AI Social Media Automation"),
        prompt: String(body.prompt || ""),
        objective: String(body.objective || "Engagement & Authority"),
        audience: String(body.audience || ctx.activeBrand?.targetAudience || "Digital Leaders"),
        platforms: Array.isArray(body.platforms) ? body.platforms : ["linkedin", "x", "instagram"],
        tone: String(body.tone || ctx.activeBrand?.tone || "Professional"),
        language: String(body.language || "English"),
        contentType: String(body.contentType || "Educational Post"),
        length: String(body.length || "Medium"),
        keywords: Array.isArray(body.keywords)
          ? body.keywords
          : String(body.keywords || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
        cta: String(body.cta || ""),
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (mode === "transform") {
      const result = await transformPostText({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        requestKey,
        text: String(body.text || ""),
        action: body.action || "improve",
        targetTone: body.targetTone,
        targetLanguage: body.targetLanguage,
        platform: body.platform,
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (mode === "repurpose") {
      const sourceText = String(body.sourceText || "").trim();
      const sourceType = String(body.sourceType || "Blog Post");
      const platforms = Array.isArray(body.platforms)
        ? body.platforms
        : ["linkedin", "x", "instagram", "threads"];

      if (!sourceText) {
        return NextResponse.json(
          { error: "Source text is required for repurposing." },
          { status: 400 }
        );
      }

      const result = await generateMultiPlatformPosts({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        operation: "repurpose_content",
        requestKey,
        brandName: ctx.activeBrand?.name || ctx.workspace.name,
        topic: `Repurposed from ${sourceType}`,
        prompt: `${body.preserveMeaning !== false ? "Preserve the original meaning and core insights." : "Adapt the core subject creatively without inventing facts."} ${body.avoidRepetition !== false ? "Avoid repeated wording across platforms." : ""} Keep the brand voice while transforming this ${sourceType}: ${sourceText}`,
        objective: "Multi-Channel Content Amplification",
        audience: ctx.activeBrand?.targetAudience || "Target Customers",
        platforms,
        tone: String(body.tone || ctx.activeBrand?.tone || "Professional"),
        language: "English",
        contentType: `Repurposed ${sourceType}`,
        length: "Medium",
        keywords: ctx.activeBrand?.suggestedHashtags?.map((h) => h.replace("#", "")) || [],
        cta: String(body.cta || "Read the full breakdown →"),
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (mode === "campaign") {
      await assertFeature(ctx.workspace.id, "campaigns");
      const result = await generateCampaignBlueprint({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        requestKey,
        brandName: ctx.activeBrand?.name || ctx.workspace.name,
        prompt: String(body.prompt || "Four-week multi-channel growth campaign"),
        objective: String(body.objective || "Lead Generation & Brand Awareness"),
        platforms: Array.isArray(body.platforms) ? body.platforms : ["linkedin", "x", "instagram"],
      });

      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Unsupported AI mode" }, { status: 400 });
  } catch (err) {
    if (err instanceof AIRequestError) return NextResponse.json({ error: err.message, code: err.code, safeToRetry: err.safeToRetry,
      ...(err.providerStatus === undefined ? {} : { providerStatus: err.providerStatus }) }, { status: err.status });
    if (err instanceof WorkflowError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message || "Invalid AI request." }, { status: 400 });
    console.error("AI generation request failed", { type: err instanceof Error ? err.name : "unknown" });
    const safeErrors = new Set(["AI request key is too long.", "AI request key was already used for different content.",
      "Workspace not found.", "Invalid AI billing mode.", "Configure a valid OpenAI key in workspace settings.",
      "Managed OpenAI is not configured. Use your own API key.", "Insufficient AI credits.", "Select supported platforms.",
      "AI credit balance requires administrator reconciliation.", "AI reservation credits require administrator reconciliation.",
      "Saved AI result cannot be decrypted; it will not be regenerated automatically."]);
    const message = err instanceof Error && safeErrors.has(err.message) ? err.message : "AI operation failed. Check server diagnostics.";
    return NextResponse.json({ error: message }, { status: message === "AI operation failed. Check server diagnostics." ? 500 : 400 });
  }
}
