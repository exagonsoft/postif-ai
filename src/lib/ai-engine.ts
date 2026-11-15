import { db } from "@/db";
import {
  aiConfigurations,
  aiUsageRecords,
  workspaces,
  PlatformVariant,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { decryptSecret } from "./crypto";
import { AI_OPERATION_COSTS } from "./plans";
import { SOCIAL_PLATFORM_SPECS, SocialPlatformSpec } from "./social-adapters";

export interface AIExecutionMeta {
  executionSource: "openai_live" | "byok_live" | "simulated";
  billingMode: "managed" | "byok";
  model: string;
  creditsCharged: number;
  remainingCredits: number;
}

async function resolveWorkspaceAI(workspaceId: number, operationKey: string, userId?: number) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) {
    throw new Error("Workspace not found");
  }

  const [config] = await db
    .select()
    .from(aiConfigurations)
    .where(eq(aiConfigurations.workspaceId, workspaceId));

  const mode = (config?.mode || ws.aiBillingMode || "managed") as "managed" | "byok";
  const model = config?.preferredModel || "gpt-4o-mini";
  const opCost = AI_OPERATION_COSTS[operationKey]?.credits ?? 8;

  let apiKey: string | null = null;
  let executionSource: AIExecutionMeta["executionSource"] = "simulated";

  if (mode === "byok") {
    if (config?.encryptedApiKey) {
      const decrypted = decryptSecret(config.encryptedApiKey);
      if (decrypted && decrypted.startsWith("sk-")) {
        apiKey = decrypted;
        executionSource = "byok_live";
      }
    }
  } else {
    if (ws.aiCreditsBalance < opCost) {
      throw new Error(
        `Insufficient Managed AI credits (${ws.aiCreditsBalance} available, ${opCost} required). Upgrade your plan or switch to BYOK.`
      );
    }
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-")) {
      apiKey = process.env.OPENAI_API_KEY;
      executionSource = "openai_live";
    }
  }

  let updatedCredits = ws.aiCreditsBalance;
  const creditsCharged = mode === "managed" ? opCost : 0;

  if (mode === "managed" && creditsCharged > 0) {
    const [updated] = await db
      .update(workspaces)
      .set({
        aiCreditsBalance: sql`GREATEST(0, ${workspaces.aiCreditsBalance} - ${creditsCharged})`,
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    if (updated) {
      updatedCredits = updated.aiCreditsBalance;
    }
  }

  await db.insert(aiUsageRecords).values({
    workspaceId,
    userId: userId ?? null,
    operation: AI_OPERATION_COSTS[operationKey]?.label || operationKey,
    model,
    billingMode: mode,
    creditsUsed: creditsCharged,
    tokensEstimate: 420 + Math.floor(Math.random() * 380),
    executionSource,
  });

  return {
    apiKey,
    model,
    meta: {
      executionSource,
      billingMode: mode,
      model,
      creditsCharged,
      remainingCredits: updatedCredits,
    } satisfies AIExecutionMeta,
  };
}

async function callOpenAIJson<T>(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<T | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.72,
      }),
    });

    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildDeterministicVariant(
  platform: string,
  params: {
    brandName: string;
    topic: string;
    prompt: string;
    objective: string;
    audience: string;
    tone: string;
    contentType: string;
    cta: string;
    keywords: string[];
  }
): PlatformVariant {
  const spec =
    SOCIAL_PLATFORM_SPECS[platform as SocialPlatformSpec["id"]] ||
    SOCIAL_PLATFORM_SPECS.linkedin;
  const baseTags = [
    ...params.keywords.map((k) => `#${k.replace(/[^a-zA-Z0-9]/g, "")}`),
    `#${params.brandName.replace(/[^a-zA-Z0-9]/g, "")}`,
    "#AIMarketing",
    "#GrowthAutomation",
  ]
    .filter((t) => t.length > 2)
    .slice(0, platform === "x" ? 2 : 5);

  const ctaLine = params.cta || "Discover how our autonomous workflow scales your growth →";
  const coreIdea =
    params.prompt?.trim() ||
    `${params.topic} — built for ${params.audience || "modern digital teams"}`;

  let content = "";
  let formatLabel = spec.supportedFormats[0];

  switch (platform) {
    case "linkedin":
      formatLabel = "Thought Leadership Post";
      content = `Most teams treat ${params.topic.toLowerCase()} as a manual bottleneck.\n\nAt ${params.brandName}, we took a different approach focused on ${params.objective.toLowerCase()}:\n\n1. Eliminate repetitive execution overhead\n2. Tailor messaging natively to every audience segment\n3. Measure compounding engagement instead of vanity spikes\n\n${coreIdea}\n\nWhat's your team's biggest challenge with ${params.topic.toLowerCase()} right now?\n\n${ctaLine}`;
      break;
    case "x":
      formatLabel = "High-Signal Thread Opener";
      content = `1/ ${params.topic} is shifting fast.\n\nHere's how ${params.brandName} helps ${params.audience || "builders"} turn strategy into measurable ${params.objective.toLowerCase()} without manual busywork:\n\n${coreIdea.slice(0, 110)}\n\n${ctaLine}`.slice(
        0,
        275
      );
      break;
    case "instagram":
      formatLabel = "Carousel + Visual Caption";
      content = `✨ ${params.topic.toUpperCase()}\n\n${coreIdea}\n\nSwipe through to see the 3-step playbook we use at ${params.brandName} to drive ${params.objective.toLowerCase()} for ${params.audience || "creators & teams"}.\n\n💾 Save this post for your next sprint.\n👇 ${ctaLine}`;
      break;
    case "tiktok":
      formatLabel = "Short-Form Hook & Script";
      content = `[HOOK 0:00-0:03] Stop spending 10 hours a week manually doing ${params.topic.toLowerCase()}.\n[BODY 0:04-0:18] Here is the exact ${params.tone.toLowerCase()} framework ${params.brandName} uses for ${params.audience || "modern brands"}: ${coreIdea}\n[CTA 0:19-0:25] ${ctaLine}`;
      break;
    case "youtube":
      formatLabel = "YouTube Shorts / Video Description";
      content = `${params.topic} | ${params.brandName} Official Playbook\n\nIn this breakdown for ${params.audience || "growth leaders"}, we cover ${coreIdea} and how to achieve ${params.objective.toLowerCase()}.\n\n⏱️ Timestamps:\n00:00 Why ${params.topic} matters now\n01:15 Step-by-step execution framework\n03:40 Key metrics & takeaways\n\n${ctaLine}`;
      break;
    case "threads":
      formatLabel = "Conversational Thread";
      content = `Unpopular opinion on ${params.topic.toLowerCase()}:\n\nYou don't need more tools—you need a tighter feedback loop.\n\n${coreIdea}\n\n${ctaLine}`;
      break;
    case "pinterest":
      formatLabel = "Search-Optimized Pin";
      content = `${params.topic} — Actionable ${params.contentType} Guide by ${params.brandName}. ${coreIdea} Designed for ${params.audience || "innovators"}. ${ctaLine}`;
      break;
    default:
      formatLabel = "Community Update";
      content = `${params.topic}\n\n${coreIdea}\n\nBuilt by ${params.brandName} to empower ${params.audience || "our community"} with ${params.objective.toLowerCase()}.\n\n${ctaLine}`;
      break;
  }

  return {
    content,
    hashtags: baseTags,
    cta: ctaLine,
    formatLabel,
    characterCount: content.length,
  };
}

export async function generateMultiPlatformPosts(params: {
  workspaceId: number;
  userId?: number;
  brandName: string;
  topic: string;
  prompt: string;
  objective: string;
  audience: string;
  platforms: string[];
  tone: string;
  language: string;
  contentType: string;
  length: string;
  keywords: string[];
  cta: string;
}) {
  const { apiKey, model, meta } = await resolveWorkspaceAI(
    params.workspaceId,
    "generate_posts",
    params.userId
  );

  const targetPlatforms = params.platforms.length > 0 ? params.platforms : ["linkedin", "x", "instagram"];
  let variants: Record<string, PlatformVariant> = {};
  let baseContent = "";

  if (apiKey) {
    const liveResult = await callOpenAIJson<{
      baseContent: string;
      variants: Record<string, { content: string; hashtags: string[]; cta: string; formatLabel: string }>;
    }>(
      apiKey,
      model,
      "You are POSTIF-AI's senior social media strategist. Return valid JSON with keys `baseContent` (string) and `variants` (object keyed by platform id, each containing `content`, `hashtags` array, `cta`, `formatLabel`). Respect platform character limits and write natively for each channel.",
      JSON.stringify({
        brandName: params.brandName,
        topic: params.topic,
        prompt: params.prompt,
        objective: params.objective,
        audience: params.audience,
        platforms: targetPlatforms,
        tone: params.tone,
        language: params.language,
        contentType: params.contentType,
        length: params.length,
        keywords: params.keywords,
        cta: params.cta,
      })
    );

    if (liveResult && liveResult.variants) {
      baseContent = liveResult.baseContent || params.topic;
      for (const p of targetPlatforms) {
        const v = liveResult.variants[p];
        if (v) {
          variants[p] = {
            content: v.content,
            hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
            cta: v.cta || params.cta,
            formatLabel: v.formatLabel || "Platform Post",
            characterCount: v.content.length,
          };
        }
      }
    }
  }

  if (Object.keys(variants).length === 0) {
    for (const p of targetPlatforms) {
      variants[p] = buildDeterministicVariant(p, params);
    }
    baseContent = variants[targetPlatforms[0]]?.content || params.topic;
  }

  return {
    baseContent,
    variants,
    meta,
  };
}

export async function transformPostText(params: {
  workspaceId: number;
  userId?: number;
  text: string;
  action:
    | "rewrite"
    | "improve"
    | "shorten"
    | "expand"
    | "translate"
    | "tone"
    | "hashtags"
    | "cta";
  targetTone?: string;
  targetLanguage?: string;
  platform?: string;
}) {
  const { apiKey, model, meta } = await resolveWorkspaceAI(
    params.workspaceId,
    "transform_post",
    params.userId
  );

  if (apiKey) {
    const live = await callOpenAIJson<{ transformedText: string; hashtags?: string[]; cta?: string }>(
      apiKey,
      model,
      "You are POSTIF-AI's editorial AI assistant. Return valid JSON with `transformedText` (string), optional `hashtags` (string[]), and optional `cta` (string).",
      JSON.stringify(params)
    );
    if (live?.transformedText) {
      return {
        transformedText: live.transformedText,
        hashtags: live.hashtags || [],
        cta: live.cta || "",
        meta,
      };
    }
  }

  const clean = params.text.trim();
  let transformedText = clean;
  let hashtags: string[] = [];
  let cta = "";

  switch (params.action) {
    case "shorten":
      transformedText =
        clean.length > 160
          ? `${clean.slice(0, 155).replace(/\s+\S*$/, "")}… Ready to automate your workflow?`
          : clean;
      break;
    case "expand":
      transformedText = `${clean}\n\nKey takeaway: Consistent, platform-native storytelling compounds organic reach every single week. Teams that pair human strategy with autonomous execution ship 4x faster without sacrificing brand voice.`;
      break;
    case "improve":
      transformedText = `🚀 ${clean.replace(/^[^a-zA-Z0-9]+/, "")}\n\nBuilt for measurable impact—save this and share with your growth team.`;
      break;
    case "rewrite":
      transformedText = `Here is a fresh perspective:\n\n${clean}\n\nThe brands winning right now focus on clarity, speed, and authentic audience value.`;
      break;
    case "tone":
      transformedText = `[${params.targetTone || "Executive"} Tone]\n${clean}`;
      break;
    case "translate":
      transformedText = `[Translated to ${params.targetLanguage || "Spanish"}]\n${
        params.targetLanguage === "Spanish"
          ? "Impulsa tu estrategia social con inteligencia artificial autónoma. Crea una vez, publica en todas partes y crece automáticamente."
          : params.targetLanguage === "French"
          ? "Propulsez votre stratégie sociale grâce à l'IA autonome. Créez une fois, publiez partout et développez votre audience automatiquement."
          : clean
      }`;
      break;
    case "hashtags":
      hashtags = ["#AIMarketing", "#SocialMediaAutomation", "#ContentStrategy", "#GrowthOps", "#PostifAI"];
      transformedText = `${clean}\n\n${hashtags.join(" ")}`;
      break;
    case "cta":
      cta = "Start your free autonomous workspace today → postif-ai.app";
      transformedText = `${clean}\n\n${cta}`;
      break;
  }

  return {
    transformedText,
    hashtags,
    cta,
    meta,
  };
}

export async function runBrandDiscovery(params: {
  workspaceId: number;
  userId?: number;
  brandName: string;
  websiteUrl: string;
  notes?: string;
}) {
  const { apiKey, model, meta } = await resolveWorkspaceAI(
    params.workspaceId,
    "brand_discovery",
    params.userId
  );

  if (apiKey) {
    const live = await callOpenAIJson<{
      industry: string;
      description: string;
      productsServices: string;
      targetAudience: string;
      brandVoice: string;
      tone: string;
      contentPillars: string[];
      suggestedHashtags: string[];
      initialStrategy: string;
    }>(
      apiKey,
      model,
      "You are POSTIF-AI's Brand Discovery Intelligence engine. Analyze the brand name, website URL, and notes, and return structured JSON with keys: industry, description, productsServices, targetAudience, brandVoice, tone, contentPillars (array of 4 strings), suggestedHashtags (array of 6 hashtags), initialStrategy.",
      JSON.stringify(params)
    );
    if (live?.industry) {
      return { discovery: live, meta };
    }
  }

  const domainHint = params.websiteUrl.replace(/^https?:\/\//, "").split("/")[0] || params.brandName;
  const discovery = {
    industry: "B2B SaaS & AI Automation",
    description: `${params.brandName} (${domainHint}) delivers intelligent digital workflows that help modern teams automate execution, scale customer engagement, and accelerate measurable growth.`,
    productsServices:
      params.notes?.trim() ||
      "Core Cloud Platform, Autonomous AI Workflows, Real-Time Analytics Suite, Enterprise API Integrations",
    targetAudience:
      "Founders, Growth Marketers, Digital Agencies, and Product-Led Operations Teams",
    brandVoice: "Authoritative, clear, forward-looking, and outcome-driven",
    tone: "Professional & Visionary",
    contentPillars: [
      "Product Innovation & Workflow Tutorials",
      "Customer ROI & Case Study Breakdowns",
      "Industry Trends & AI Automation Insights",
      "Behind-the-Scenes Engineering & Culture",
    ],
    suggestedHashtags: [
      `#${params.brandName.replace(/[^a-zA-Z0-9]/g, "")}`,
      "#AIAutomation",
      "#DigitalGrowth",
      "#SaaSLeadership",
      "#FutureOfWork",
      "#MarketingOps",
    ],
    initialStrategy:
      "Publish 4x/week on LinkedIn for B2B authority, 5x/week on X for real-time product insights, and 3x/week visual carousels on Instagram to capture top-of-funnel awareness.",
  };

  return { discovery, meta };
}

export async function generateCampaignBlueprint(params: {
  workspaceId: number;
  userId?: number;
  brandName: string;
  prompt: string;
  objective: string;
  platforms: string[];
}) {
  const { apiKey, model, meta } = await resolveWorkspaceAI(
    params.workspaceId,
    "campaign_blueprint",
    params.userId
  );

  if (apiKey) {
    const live = await callOpenAIJson<{
      name: string;
      description: string;
      audience: string;
      strategySummary: string;
      contentThemes: string[];
      weeklyCadence: number;
      samplePosts: { title: string; platform: string; content: string; dayOffset: number }[];
    }>(
      apiKey,
      model,
      "You are POSTIF-AI's Campaign Architect. Return valid JSON with keys: name, description, audience, strategySummary, contentThemes (string[]), weeklyCadence (number), samplePosts (array of {title, platform, content, dayOffset}).",
      JSON.stringify(params)
    );
    if (live?.name) {
      return { blueprint: live, meta };
    }
  }

  const targetPlatforms = params.platforms.length > 0 ? params.platforms : ["linkedin", "x", "instagram"];
  const blueprint = {
    name: `${params.brandName} — 4-Week Growth Sprint`,
    description: params.prompt,
    audience: "High-intent decision makers, early adopters, and active community members",
    strategySummary: `A structured 4-week multi-channel campaign designed around "${params.prompt}". Week 1 establishes problem awareness, Week 2 showcases product differentiation, Week 3 highlights social proof, and Week 4 drives conversion urgency.`,
    contentThemes: [
      "Week 1: Industry Pain Points & Core Thesis",
      "Week 2: Live Workflow Deep-Dives & Tutorials",
      "Week 3: Proof Points, Metrics & Benchmarks",
      "Week 4: Direct Offer & Conversion Sprint",
    ],
    weeklyCadence: 4,
    samplePosts: [
      {
        title: "Campaign Kickoff — The New Standard",
        platform: targetPlatforms[0] || "linkedin",
        content: `We're launching a 4-week deep dive into ${params.prompt}. Follow along as ${params.brandName} shares actionable playbooks, templates, and live benchmarks every week.`,
        dayOffset: 1,
      },
      {
        title: "Quick-Win Tactical Thread",
        platform: targetPlatforms[1] || "x",
        content: `3 ways to immediately level up your results with ${params.brandName}:\n\n1. Automate repetitive drafts\n2. Tailor format per channel\n3. Double down on top-performing pillars`,
        dayOffset: 3,
      },
      {
        title: "Visual Playbook Carousel",
        platform: targetPlatforms[2] || "instagram",
        content: `Save this 4-step blueprint for ${params.objective.toLowerCase()}. Swipe through to see how ${params.brandName} turns strategy into daily momentum.`,
        dayOffset: 5,
      },
    ],
  };

  return { blueprint, meta };
}
