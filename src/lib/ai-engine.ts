import { z } from "zod";
import { db } from "@/db";
import { aiConfigurations, aiUsageRecords, workspaces, type PlatformVariant } from "@/db/schema";
import { increment } from "@/db/filters";
import { decryptSecret } from "./crypto";
import { AI_OPERATION_COSTS } from "./plans";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatformSpec } from "./social-adapters";
import { randomUUID } from "node:crypto";
import { aiRequests, type AIRequest } from "@/db/worker-schema";
import { encryptSecret } from "./crypto";
import { credentialVersion, requestFingerprint, validCreditBalance, validReservationCredits } from "./ai-request-policy";
import { deadlineSignal, hasTime, type WorkerOptions } from "./worker-budget";
import { getWorkspaceEntitlements } from "./entitlements";
import { WorkflowError } from "./post-policy";
import { getCreditEpoch } from "./subscriptions";

export interface AIExecutionMeta {
  executionSource: "openai_live" | "byok_live";
  billingMode: "managed" | "byok";
  model: string;
  creditsCharged: number;
  remainingCredits: number;
}

async function refundRequest(request: AIRequest, uncertain: boolean, message: string) {
  await db.transaction(async tx => {
    const [current] = await tx.find(aiRequests, { id: request.id, token: request.token }, { lock: true });
    if (!current || current.status === "succeeded" || current.refundedAt) return;
    validReservationCredits(current.credits, current.billingMode);
    const [usage] = await tx.find(aiUsageRecords, { id: current.usageRecordId, workspaceId: current.workspaceId }, { lock: true });
    if (!usage || usage.creditsUsed !== current.credits || usage.billingMode !== current.billingMode) throw new Error("AI usage reservation requires administrator reconciliation.");
    const [workspace] = await tx.find(workspaces, { id: current.workspaceId }, { lock: true });
    if (!workspace) return;
    validCreditBalance(workspace.aiCreditsBalance);
    const restored = current.creditEpoch === await getCreditEpoch(current.workspaceId, tx) ? current.credits : 0;
    if (!Number.isSafeInteger(workspace.aiCreditsBalance + restored)) throw new Error("AI credit balance overflow.");
    if (current.credits) {
      if (restored) await tx.update(workspaces, { id: current.workspaceId }, { aiCreditsBalance: increment(restored) });
      await tx.insert(aiUsageRecords, { workspaceId: current.workspaceId, userId: current.userId, operation: `${restored ? "Refund" : "Expired reservation closed (no carryover)"}: ${current.operation}`, model: current.model, billingMode: current.billingMode, creditsUsed: -restored, tokensEstimate: 0, executionSource: !restored ? "expired_refund" : uncertain ? "uncertain_refund" : "failed_refund" });
    }
    await tx.update(aiUsageRecords, { id: current.usageRecordId }, { executionSource: uncertain ? "uncertain" : "failed" });
    await tx.update(aiRequests, { id: current.id, token: current.token }, { status: uncertain ? "uncertain" : "refunded", refundedAt: new Date(), refundedCredits: restored, error: message, updatedAt: new Date() });
  });
}

export async function reconcileAIRequests({ deadline, limit = 10 }: WorkerOptions = {}) {
  const stale = await db.find(aiRequests, { status: { $in: ["reserved", "sending", "uncertain"] }, refundedAt: null, updatedAt: { $lte: new Date(Date.now() - 120000) } }, { limit, sort: { updatedAt: 1 } });
  let processed = 0;
  let failed = false;
  for (const request of stale) {
    if (!hasTime(deadline)) break;
    try {
      await refundRequest(request, request.status !== "reserved", "Interrupted generation reconciled. This request will not be sent again; verify provider usage before requesting new content.");
      processed++;
    } catch {
      failed = true;
      await db.update(aiRequests, { id: request.id, refundedAt: null }, { status: "uncertain", updatedAt: new Date(), error: "Reservation accounting requires administrator reconciliation. No automatic provider retry is permitted." });
    }
  }
  if (failed) throw new Error("Some AI reservations require administrator reconciliation.");
  return processed;
}

async function execute<T>(workspaceId: number, userId: number | undefined, operation: string, prompt: string, input: object & { requestKey?: string; deadline?: number }, validator: z.ZodType<T>) {
  const key = `${workspaceId}:${input.requestKey || randomUUID()}`;
  if (key.length > 240) throw new Error("AI request key is too long.");
  const fingerprint = requestFingerprint(operation, prompt, input);
  const token = randomUUID();
  const resolved = await db.transaction(async tx => {
    const [existing] = await tx.find(aiRequests, { key }, { lock: true });
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("AI request key was already used for different content.");
      return { request: existing, apiKey: null };
    }
    const [workspace] = await tx.find(workspaces, { id: workspaceId }, { lock: true });
    if (!workspace) throw new Error("Workspace not found.");
    validCreditBalance(workspace.aiCreditsBalance);
    const { plan } = await getWorkspaceEntitlements(workspaceId, tx);
    if (operation === "agent_strategy" && !plan.autopilotEnabled) throw new WorkflowError("Planning requires a current Pro or Agency subscription.", 403);
    if (operation === "campaign_blueprint" && !plan.campaignsEnabled) throw new WorkflowError("Campaigns are not included in your current plan.", 403);
    const [configuration] = await tx.find(aiConfigurations, { workspaceId });
    const mode = plan.allowsConfigurableAiMode ? configuration?.mode ?? workspace.aiBillingMode : plan.defaultAiMode;
    if (!["byok", "managed"].includes(mode)) throw new Error("Invalid AI billing mode.");
    const apiKey = mode === "byok"
      ? configuration?.encryptedApiKey && decryptSecret(configuration.encryptedApiKey)
      : process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error(mode === "byok" ? "Configure a valid OpenAI key in workspace settings." : "Managed OpenAI is not configured. Use your own API key.");
    const cost = mode === "byok" ? 0 : AI_OPERATION_COSTS[operation]?.credits ?? 8;
    if (workspace.aiCreditsBalance < cost) throw new Error("Insufficient AI credits.");
    if (cost) await tx.update(workspaces, { id: workspaceId }, { aiCreditsBalance: increment(-cost) });
    const model = configuration?.preferredModel || "gpt-4o-mini";
    const [usage] = await tx.insert(aiUsageRecords, { workspaceId, userId: userId ?? null, operation: AI_OPERATION_COSTS[operation]?.label || operation, model, billingMode: mode, creditsUsed: cost, tokensEstimate: 0, executionSource: "reserved" });
    const [request] = await tx.insert(aiRequests, {
      key, workspaceId, userId: userId ?? null, fingerprint, operation, billingMode: mode as "managed" | "byok",
      model, credentialVersion: credentialVersion(mode, mode === "byok" ? configuration!.encryptedApiKey! : apiKey, model),
      credits: cost, balance: workspace.aiCreditsBalance - cost, token, usageRecordId: usage.id, creditEpoch: await getCreditEpoch(workspaceId, tx),
    });
    return { apiKey, request };
  });
  const request = resolved.request;
  validReservationCredits(request.credits, request.billingMode);
  const executionSource = request.billingMode === "byok" ? "byok_live" : "openai_live";
  const meta = { executionSource, billingMode: request.billingMode, model: request.model, creditsCharged: request.credits, remainingCredits: request.balance } satisfies AIExecutionMeta;
  if (request.status === "succeeded" && request.encryptedResult) {
    const cached = decryptSecret(request.encryptedResult);
    if (!cached) throw new Error("Saved AI result cannot be decrypted; it will not be regenerated automatically.");
    return { result: validator.parse(JSON.parse(cached)), meta };
  }
  if (request.token !== token || request.status !== "reserved" || !resolved.apiKey) throw new Error("AI request is already in progress, failed, or needs verification. It will not be sent again.");
  let sent = false;
  let settled = false;
  try {
    if (!hasTime(input.deadline, 1500)) throw new Error("Not enough request time remains for AI generation.");
    const [claimed] = await db.update(aiRequests, { id: request.id, token, status: "reserved", refundedAt: null }, { status: "sending", updatedAt: new Date() });
    if (!claimed) throw new Error("AI request claim was lost.");
    sent = true;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${resolved.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: request.model, response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(Object.fromEntries(Object.entries(input).filter(([key]) => !["requestKey", "deadline"].includes(key)))) }] }),
      signal: deadlineSignal(input.deadline, 18000),
    });
    if (!response.ok) {
      sent = response.status >= 500 || response.status === 408;
      throw new Error(`OpenAI returned HTTP ${response.status}. Check the key, model access, and provider billing.`);
    }
    const envelope = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1), usage: z.object({ total_tokens: z.number().int().nonnegative() }) }).parse(await response.json());
    const result = validator.parse(JSON.parse(envelope.choices[0].message.content));
    const encryptedResult = encryptSecret(JSON.stringify(result));
    await db.transaction(async tx => {
      const [current] = await tx.find(aiRequests, { id: request.id, token }, { lock: true });
      if (!current || current.status !== "sending" || current.refundedAt) throw new Error("AI settlement requires manual reconciliation.");
      await tx.update(aiUsageRecords, { id: request.usageRecordId }, { tokensEstimate: envelope.usage.total_tokens, executionSource });
      await tx.update(aiRequests, { id: request.id, token }, { status: "succeeded", tokens: envelope.usage.total_tokens, encryptedResult, updatedAt: new Date() });
    });
    settled = true;
    return { result, meta };
  } catch (error) {
    if (!settled) await refundRequest(request, sent, "Generation failed or was interrupted. This request will not be resubmitted automatically.");
    if (error instanceof z.ZodError || error instanceof SyntaxError) throw new Error("OpenAI returned an invalid response. No generated content was saved.");
    throw error;
  }
}

const generatedVariant = z.object({ content: z.string().trim().min(1), hashtags: z.array(z.string()), cta: z.string(), formatLabel: z.string() });
export async function generateMultiPlatformPosts(params: {
  requestKey?: string; deadline?: number;
  operation?: "generate_posts" | "repurpose_content";
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
  const { result, meta } = await execute(params.workspaceId, params.userId, params.operation === "repurpose_content" ? "repurpose_content" : "generate_posts", "Write platform-native social copy. Return JSON: baseContent (string), variants keyed by every requested platform with content, hashtags (string[]), cta, formatLabel. Respect character limits. Do not invent brand facts, statistics, or testimonials.", params, validator);
  const variants: Record<string, PlatformVariant> = Object.fromEntries(params.platforms.map(platform => [platform, { ...result.variants[platform], characterCount: result.variants[platform].content.length }]));
  return { baseContent: result.baseContent, variants, meta };
}

export async function transformPostText(params: {
  requestKey?: string; deadline?: number;
  workspaceId: number; userId?: number; text: string;
  action: "rewrite" | "improve" | "shorten" | "expand" | "translate" | "tone" | "hashtags" | "cta";
  targetTone?: string; targetLanguage?: string; platform?: string;
}) {
  const { result, meta } = await execute(params.workspaceId, params.userId, "transform_post", "Edit the supplied text according to the requested action. Return JSON: transformedText (string), hashtags (string[]), cta (string). Preserve factual claims; do not fabricate translations or results.", params, z.object({ transformedText: z.string().trim().min(1), hashtags: z.array(z.string()).default([]), cta: z.string().default("") }));
  return { ...result, meta };
}

export async function runBrandDiscovery(params: { requestKey?: string; deadline?: number; workspaceId: number; userId?: number; brandName: string; websiteUrl: string; notes?: string }) {
  const { result, meta } = await execute(params.workspaceId, params.userId, "brand_discovery", "Propose a brand profile from the supplied information only. You have not fetched the website; do not claim you have. Leave unknown facts empty. Return JSON: industry, description, productsServices, targetAudience, brandVoice, tone, initialStrategy (strings), contentPillars and suggestedHashtags (string arrays).", params, z.object({ industry: z.string(), description: z.string(), productsServices: z.string(), targetAudience: z.string(), brandVoice: z.string(), tone: z.string(), contentPillars: z.array(z.string()), suggestedHashtags: z.array(z.string()), initialStrategy: z.string() }));
  return { discovery: result, meta };
}

export async function generateCampaignBlueprint(params: { requestKey?: string; deadline?: number; workspaceId: number; userId?: number; brandName: string; prompt: string; objective: string; platforms: string[] }) {
  const { result, meta } = await execute(params.workspaceId, params.userId, "campaign_blueprint", "Design a campaign using the supplied brand brief. Do not invent results or customers. Return JSON: name, description, audience, strategySummary (strings), contentThemes (string[]), weeklyCadence (integer 1-30), samplePosts (array of title, platform, content, dayOffset). samplePosts are new draft suggestions, not published content.", params, z.object({ name: z.string().min(1), description: z.string(), audience: z.string(), strategySummary: z.string(), contentThemes: z.array(z.string()), weeklyCadence: z.number().int().min(1).max(30), samplePosts: z.array(z.object({ title: z.string(), platform: z.string(), content: z.string(), dayOffset: z.number().int().nonnegative() })).max(30) }));
  return { blueprint: result, meta };
}

export async function generateWeeklyPlan(params: {
  requestKey?: string; deadline?: number;
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
