import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  generateMultiPlatformPosts,
  transformPostText,
  generateCampaignBlueprint,
} from "@/lib/ai-engine";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace || !ctx.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const mode = body.mode as string;

    if (mode === "generate") {
      if (!String(body.topic || "").trim() && !String(body.prompt || "").trim()) return NextResponse.json({ error: "Enter a topic or idea before generating a post." }, { status: 400 });
      const result = await generateMultiPlatformPosts({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
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
        brandName: ctx.activeBrand?.name || ctx.workspace.name,
        topic: `Repurposed from ${sourceType}`,
        prompt: `Preserve core insights and brand voice while transforming this ${sourceType}: ${sourceText.slice(
          0,
          1200
        )}`,
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
      const result = await generateCampaignBlueprint({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        brandName: ctx.activeBrand?.name || ctx.workspace.name,
        prompt: String(body.prompt || "Four-week multi-channel growth campaign"),
        objective: String(body.objective || "Lead Generation & Brand Awareness"),
        platforms: Array.isArray(body.platforms) ? body.platforms : ["linkedin", "x", "instagram"],
      });

      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Unsupported AI mode" }, { status: 400 });
  } catch (err) {
    console.error("AI generate API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI operation failed" },
      { status: 400 }
    );
  }
}
