import { z } from "zod";
import { db } from "@/db";
import { aiConfigurations, aiUsageRecords, workspaces, type PlatformVariant } from "@/db/schema";
import { increment } from "@/db/filters";
import { decryptSecret } from "./crypto";
import { AI_OPERATION_COSTS } from "./plans";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatformSpec } from "./social-adapters";

export interface AIExecutionMeta {
  executionSource: "openai_live" | "byok_live";
  billingMode: "managed" | "byok";
  model: string;
  creditsCharged: number;
  remainingCredits: number;
}

async function execute<T>(workspaceId: number, userId: number | undefined, operation: string, prompt: string, input: object, validator: z.ZodType<T>) {
  const resolved = await db.transaction(async tx => {
    const [workspace] = await tx.find(workspaces, { id: workspaceId }, { lock: true });
    if (!workspace) throw new Error("Workspace not found.");
    const [configuration] = await tx.find(aiConfigurations, { workspaceId });
    const mode = configuration?.mode ?? workspace.aiBillingMode;
    const apiKey = mode === "byok"
      ? configuration?.encryptedApiKey && decryptSecret(configuration.encryptedApiKey)
      : process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error(mode === "byok" ? "Configure a valid OpenAI key in workspace settings." : "Managed OpenAI is not configured. Use your own API key.");
    const cost = mode === "byok" ? 0 : AI_OPERATION_COSTS[operation]?.credits ?? 8;
    if (workspace.aiCreditsBalance < cost) throw new Error("Insufficient AI credits.");
    if (cost) await tx.update(workspaces, { id: workspaceId }, { aiCreditsBalance: increment(-cost) });
    return { apiKey, model: configuration?.preferredModel || "gpt-4o-mini", cost, mode, balance: workspace.aiCreditsBalance - cost };
  });
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${resolved.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: resolved.model, response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(input) }] }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}. Check the key, model access, and provider billing.`);
    const envelope = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1), usage: z.object({ total_tokens: z.number().int().nonnegative() }) }).parse(await response.json());
    const result = validator.parse(JSON.parse(envelope.choices[0].message.content));
    const executionSource = resolved.mode === "byok" ? "byok_live" : "openai_live";
    await db.insert(aiUsageRecords, { workspaceId, userId: userId ?? null, operation: AI_OPERATION_COSTS[operation]?.label || operation, model: resolved.model, billingMode: resolved.mode, creditsUsed: resolved.cost, tokensEstimate: envelope.usage.total_tokens, executionSource });
    return { result, meta: { executionSource, billingMode: resolved.mode === "byok" ? "byok" : "managed", model: resolved.model, creditsCharged: resolved.cost, remainingCredits: resolved.balance } satisfies AIExecutionMeta };
  } catch (error) {
    if (resolved.cost) await db.update(workspaces, { id: workspaceId }, { aiCreditsBalance: increment(resolved.cost) });
    if (error instanceof z.ZodError || error instanceof SyntaxError) throw new Error("OpenAI returned an invalid response. No generated content was saved.");
    throw error;
  }
}

const generatedVariant = z.object({ content: z.string().trim().min(1), hashtags: z.array(z.string()), cta: z.string(), formatLabel: z.string() });
export async function generateMultiPlatformPosts(params: {
  workspaceId: number; userId?: number; brandName: string; topic: string; prompt: string;
  objective: string; audience: string; platforms: string[]; tone: string; language: string;
  contentType: string; length: string; keywords: string[]; cta: string;
}) {
  if (!params.platforms.length || params.platforms.some(platform => !SOCIAL_PLATFORM_SPECS[platform as SocialPlatformSpec["id"]])) throw new Error("Select supported platforms.");
  const validator = z.object({ baseContent: z.string().trim().min(1), variants: z.record(z.string(), generatedVariant) }).superRefine((value, ctx) => {
    for (const platform of params.platforms) {
      const variant = value.variants[platform];
      if (!variant || variant.content.length > SOCIAL_PLATFORM_SPECS[platform as SocialPlatformSpec["id"]].maxChars) ctx.addIssue({ code: "custom", message: `Missing or oversized ${platform} variant.` });
    }
  });
  const { result, meta } = await execute(params.workspaceId, params.userId, "generate_posts", "Write platform-native social copy. Return JSON: baseContent (string), variants keyed by every requested platform with content, hashtags (string[]), cta, formatLabel. Respect character limits. Do not invent brand facts, statistics, or testimonials.", params, validator);
  const variants: Record<string, PlatformVariant> = Object.fromEntries(params.platforms.map(platform => [platform, { ...result.variants[platform], characterCount: result.variants[platform].content.length }]));
  return { baseContent: result.baseContent, variants, meta };
}

export async function transformPostText(params: {
  workspaceId: number; userId?: number; text: string;
  action: "rewrite" | "improve" | "shorten" | "expand" | "translate" | "tone" | "hashtags" | "cta";
  targetTone?: string; targetLanguage?: string; platform?: string;
}) {
  const { result, meta } = await execute(params.workspaceId, params.userId, "transform_post", "Edit the supplied text according to the requested action. Return JSON: transformedText (string), hashtags (string[]), cta (string). Preserve factual claims; do not fabricate translations or results.", params, z.object({ transformedText: z.string().trim().min(1), hashtags: z.array(z.string()).default([]), cta: z.string().default("") }));
  return { ...result, meta };
}

export async function runBrandDiscovery(params: { workspaceId: number; userId?: number; brandName: string; websiteUrl: string; notes?: string }) {
  const { result, meta } = await execute(params.workspaceId, params.userId, "brand_discovery", "Propose a brand profile from the supplied information only. You have not fetched the website; do not claim you have. Leave unknown facts empty. Return JSON: industry, description, productsServices, targetAudience, brandVoice, tone, initialStrategy (strings), contentPillars and suggestedHashtags (string arrays).", params, z.object({ industry: z.string(), description: z.string(), productsServices: z.string(), targetAudience: z.string(), brandVoice: z.string(), tone: z.string(), contentPillars: z.array(z.string()), suggestedHashtags: z.array(z.string()), initialStrategy: z.string() }));
  return { discovery: result, meta };
}

export async function generateCampaignBlueprint(params: { workspaceId: number; userId?: number; brandName: string; prompt: string; objective: string; platforms: string[] }) {
  const { result, meta } = await execute(params.workspaceId, params.userId, "campaign_blueprint", "Design a campaign using the supplied brand brief. Do not invent results or customers. Return JSON: name, description, audience, strategySummary (strings), contentThemes (string[]), weeklyCadence (integer 1-30), samplePosts (array of title, platform, content, dayOffset). samplePosts are new draft suggestions, not published content.", params, z.object({ name: z.string().min(1), description: z.string(), audience: z.string(), strategySummary: z.string(), contentThemes: z.array(z.string()), weeklyCadence: z.number().int().min(1).max(30), samplePosts: z.array(z.object({ title: z.string(), platform: z.string(), content: z.string(), dayOffset: z.number().int().nonnegative() })).max(30) }));
  return { blueprint: result, meta };
}

export async function generateWeeklyPlan(params: {
  workspaceId: number; userId?: number; brandName: string; description: string; audience: string;
  contentPillars: string[]; objectives: string[]; platforms: string[]; maxPostsPerWeek: number;
}) {
  if (!params.platforms.length || params.platforms.some(platform => !Object.hasOwn(SOCIAL_PLATFORM_SPECS, platform))) throw new Error("Configure supported agent platforms before generating a plan.");
  if (!Number.isInteger(params.maxPostsPerWeek) || params.maxPostsPerWeek < 1 || params.maxPostsPerWeek > 28) throw new Error("Configure a weekly post limit between 1 and 28.");
  const validator = z.object({ weeklyPlan: z.array(z.object({
    day: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
    platform: z.string().refine(platform => params.platforms.includes(platform)),
    pillar: z.string(), concept: z.string().trim().min(1), status: z.literal("planned"),
  })).min(1).max(params.maxPostsPerWeek) });
  const { result, meta } = await execute(params.workspaceId, params.userId, "agent_strategy", "Create a weekly content plan from the supplied brand brief and objectives. Return JSON: weeklyPlan (array of day, platform, pillar, concept, status). Use only requested platforms, English weekday names, and status planned. Respect maxPostsPerWeek. Do not invent brand results, benchmarks, approvals, historical performance, or customer testimonials. No posts have been drafted or approved.", params, validator);
  return { ...result, meta };
}
