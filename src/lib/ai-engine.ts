import { z } from "zod";
import { db } from "@/db";
import { aiConfigurations, aiUsageRecords, workspaces, type PlatformVariant } from "@/db/schema";
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
import { reserveCredits, restoreCredits } from "./ai-credit-wallet";

export interface AIExecutionMeta {
  executionSource: "openai_live" | "byok_live";
  billingMode: "managed" | "byok";
  model: string;
  creditsCharged: number;
  remainingCredits: number;
}

export class AIRequestError extends Error {
  constructor(
    message: string,
    public code: "AI_REQUEST_IN_PROGRESS" | "AI_REQUEST_FAILED" | "AI_REQUEST_UNCERTAIN",
    public status: number,
    public safeToRetry: boolean,
    public providerStatus?: number,
  ) { super(message); }
}

class AIProviderError extends Error {
  constructor(public providerStatus: number) {
    super(`OpenAI returned HTTP ${providerStatus}. Check the key, model access, and provider billing.`);
  }
}

type AIResponseStage = "provider_json" | "envelope" | "content_json" | "generated_schema";
function reportInvalidAIResponse(stage: AIResponseStage, error: z.ZodError | SyntaxError, finishReason: string | null, hasRefusal: boolean) {
  if (process.env.NODE_ENV !== "development") return;
  const fields = new Set(["choices", "message", "content", "usage", "total_tokens", "baseContent", "variants", "hashtags", "cta", "formatLabel",
    "transformedText", "industry", "description", "productsServices", "targetAudience", "brandVoice", "tone", "contentPillars",
    "suggestedHashtags", "initialStrategy", "name", "audience", "strategySummary", "contentThemes", "weeklyCadence", "samplePosts",
    "title", "platform", "dayOffset", "weeklyPlan", "day", "pillar", "concept", "status", ...Object.keys(SOCIAL_PLATFORM_SPECS)]);
  const issues = error instanceof z.ZodError ? error.issues.slice(0, 10).map(issue => ({
    path: issue.path.map(part => typeof part === "number" ? "*" : typeof part === "string" && fields.has(part) ? part : "other"),
    code: ["invalid_type", "too_small", "too_big", "invalid_value", "invalid_format", "custom"].includes(issue.code) ? issue.code : "other",
  })) : [];
  console.warn("[AI generation diagnostic]", JSON.stringify({ stage, reason: error instanceof SyntaxError ? "invalid_json" : "schema_mismatch", finishReason, hasRefusal, issues }));
}

function existingRequestError(request: AIRequest): AIRequestError {
  if (request.status === "refunded" && request.refundedAt) {
    const match = /^OpenAI returned HTTP (4\d\d)\. Check the key, model access, and provider billing\.$/.exec(request.error || "");
    const message = match ? request.error! : "The previous AI request failed before a confirmed provider response. It was not sent again.";
    return new AIRequestError(message, "AI_REQUEST_FAILED", 409, true, match ? Number(match[1]) : undefined);
  }
  if (request.status === "uncertain" || request.status === "succeeded" || request.status === "refunded") {
    const match = /^OpenAI returned HTTP (3\d\d|408|5\d\d)\. Check the key, model access, and provider billing\.$/.exec(request.error || "");
    const prefix = match ? `OpenAI returned HTTP ${match[1]}. ` :
      request.error === "OpenAI returned an invalid response; provider usage must be verified before requesting new content." ? "OpenAI returned an invalid response. " : "";
    return new AIRequestError(`${prefix}The previous AI request needs verification. Check provider usage before requesting new content; it will not be sent again.`, "AI_REQUEST_UNCERTAIN", 409, false, match ? Number(match[1]) : undefined);
  }
  return new AIRequestError("The AI request is in progress or awaiting recovery. It will not be sent again.", "AI_REQUEST_IN_PROGRESS", 409, false);
}

async function refundRequest(request: AIRequest, uncertain: boolean, message: string) {
  return db.transaction(async tx => {
    const [current] = await tx.find(aiRequests, { id: request.id, token: request.token }, { lock: true });
    if (!current || current.status === "succeeded") return false;
    if (current.refundedAt) return current.status === "refunded";
    validReservationCredits(current.credits, current.billingMode);
    const [usage] = await tx.find(aiUsageRecords, { id: current.usageRecordId, workspaceId: current.workspaceId }, { lock: true });
    if (!usage || usage.creditsUsed !== current.credits || usage.billingMode !== current.billingMode) throw new Error("AI usage reservation requires administrator reconciliation.");
    const [workspace] = await tx.find(workspaces, { id: current.workspaceId }, { lock: true });
    if (!workspace) return false;
    validCreditBalance(workspace.aiCreditsBalance);
    const restored = await restoreCredits(tx, workspace, current.credits, current.permanentAllocations, current.creditEpoch, await getCreditEpoch(current.workspaceId, tx));
    if (current.credits) {
      await tx.insert(aiUsageRecords, { workspaceId: current.workspaceId, userId: current.userId, operation: `${restored ? "Refund" : "Expired reservation closed (no carryover)"}: ${current.operation}`, model: current.model, billingMode: current.billingMode, creditsUsed: -restored, tokensEstimate: 0, executionSource: !restored ? "expired_refund" : uncertain ? "uncertain_refund" : "failed_refund" });
    }
    await tx.update(aiUsageRecords, { id: current.usageRecordId }, { executionSource: uncertain ? "uncertain" : "failed" });
    const [updated] = await tx.update(aiRequests, { id: current.id, token: current.token }, { status: uncertain ? "uncertain" : "refunded", refundedAt: new Date(), refundedCredits: restored, error: message, updatedAt: new Date() });
    return updated?.status === "refunded";
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

async function execute<T>(workspaceId: number, userId: number | undefined, operation: string, prompt: string, input: object & { requestKey?: string; deadline?: number }, validator: z.ZodType<T>, outputSchema?: object) {
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
    const permanentAllocations = await reserveCredits(tx, workspace, cost);
    const model = configuration?.preferredModel || "gpt-4o-mini";
    const [usage] = await tx.insert(aiUsageRecords, { workspaceId, userId: userId ?? null, operation: AI_OPERATION_COSTS[operation]?.label || operation, model, billingMode: mode, creditsUsed: cost, tokensEstimate: 0, executionSource: "reserved" });
    const [request] = await tx.insert(aiRequests, {
      key, workspaceId, userId: userId ?? null, fingerprint, operation, billingMode: mode as "managed" | "byok",
      model, credentialVersion: credentialVersion(mode, mode === "byok" ? configuration!.encryptedApiKey! : apiKey, model),
      credits: cost, balance: workspace.aiCreditsBalance - cost, token, usageRecordId: usage.id, creditEpoch: await getCreditEpoch(workspaceId, tx), permanentAllocations,
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
  if (request.token !== token || request.status !== "reserved" || !resolved.apiKey) throw existingRequestError(request);
  let sent = false;
  let settled = false;
  let responseStage: AIResponseStage = "provider_json";
  let finishReason: string | null = null;
  let hasRefusal = false;
  try {
    if (!hasTime(input.deadline, 1500)) throw new Error("Not enough request time remains for AI generation.");
    const [claimed] = await db.update(aiRequests, { id: request.id, token, status: "reserved", refundedAt: null }, { status: "sending", updatedAt: new Date() });
    if (!claimed) throw new Error("AI request claim was lost.");
    sent = true;
    const structuredModels = ["gpt-4o-mini", "gpt-4o-mini-2024-07-18", "gpt-4o", "gpt-4o-2024-08-06", "gpt-4o-2024-11-20"];
    const responseFormat = outputSchema && structuredModels.includes(request.model)
      ? { type: "json_schema", json_schema: { name: "social_post_variants", strict: true, schema: outputSchema } }
      : { type: "json_object" };
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${resolved.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: request.model, response_format: responseFormat, messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(Object.fromEntries(Object.entries(input).filter(([key]) => !["requestKey", "deadline"].includes(key)))) }] }),
      signal: deadlineSignal(input.deadline, 18000),
    });
    if (!response.ok) {
      sent = response.status < 400 || response.status >= 500 || response.status === 408;
      throw new AIProviderError(response.status);
    }
    const raw: unknown = await response.json();
    responseStage = "envelope";
    if (process.env.NODE_ENV === "development") {
      const hints = z.object({ choices: z.array(z.object({ finish_reason: z.string().nullish(), message: z.object({ refusal: z.string().nullish() }).nullish() })).optional() }).safeParse(raw);
      const reason = hints.success ? hints.data.choices?.[0]?.finish_reason : null;
      finishReason = reason && ["stop", "length", "content_filter", "tool_calls"].includes(reason) ? reason : reason ? "other" : null;
      hasRefusal = !!(hints.success && hints.data.choices?.[0]?.message?.refusal);
    }
    const envelope = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1), usage: z.object({ total_tokens: z.number().int().nonnegative() }) }).parse(raw);
    responseStage = "content_json";
    const content: unknown = JSON.parse(envelope.choices[0].message.content);
    responseStage = "generated_schema";
    const result = validator.parse(content);
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
    if (error instanceof z.ZodError || error instanceof SyntaxError) reportInvalidAIResponse(responseStage, error, finishReason, hasRefusal);
    const message = error instanceof AIProviderError ? error.message :
      sent && (error instanceof z.ZodError || error instanceof SyntaxError) ? "OpenAI returned an invalid response; provider usage must be verified before requesting new content." :
      sent ? "The provider outcome is uncertain. Check provider usage before requesting new content." :
      "The AI request failed before it was sent to the provider.";
    if (!settled) {
      try {
        const definitivelyFailed = await refundRequest(request, sent, message);
        if (!sent && !definitivelyFailed) throw new Error("AI reservation state could not be confirmed.");
      }
      catch {
        console.error("AI reservation reconciliation failed", { operation });
        throw new AIRequestError("AI accounting requires administrator reconciliation. Do not retry until provider usage is verified.", "AI_REQUEST_UNCERTAIN", 409, false);
      }
    }
    if (sent) {
      const details = error instanceof AIProviderError ? `${error.message} Provider usage must be verified before requesting new content.` : message;
      throw new AIRequestError(details, "AI_REQUEST_UNCERTAIN", 409, false, error instanceof AIProviderError ? error.providerStatus : undefined);
    }
    throw new AIRequestError(message, "AI_REQUEST_FAILED", 502, true, error instanceof AIProviderError ? error.providerStatus : undefined);
  }
}

const generatedVariant = z.object({ content: z.string().trim().min(1), hashtags: z.array(z.string()), cta: z.string(), formatLabel: z.string() });
function socialPostOutputSchema(platforms: string[]) {
  const variant = { type: "object", properties: { content: { type: "string" }, hashtags: { type: "array", items: { type: "string" } },
    cta: { type: "string" }, formatLabel: { type: "string" } }, required: ["content", "hashtags", "cta", "formatLabel"], additionalProperties: false };
  const names = [...new Set(platforms)];
  return { type: "object", properties: { baseContent: { type: "string" },
    variants: { type: "object", properties: Object.fromEntries(names.map(name => [name, variant])), required: names, additionalProperties: false } },
  required: ["baseContent", "variants"], additionalProperties: false };
}
export async function generateMultiPlatformPosts(params: {
  requestKey?: string; deadline?: number;
  operation?: "generate_posts" | "repurpose_content";
  workspaceId: number; userId?: number; brandName: string; topic: string; prompt: string;
  objective: string; audience: string; platforms: string[]; tone: string; language: string;
  contentType: string; length: string; keywords: string[]; cta: string;
}) {
  if (!params.platforms.length || params.platforms.some(platform => !Object.hasOwn(SOCIAL_PLATFORM_SPECS, platform))) throw new Error("Select supported platforms.");
  const validator = z.object({ baseContent: z.string().trim().min(1), variants: z.record(z.string(), generatedVariant) }).superRefine((value, ctx) => {
    for (const platform of params.platforms) {
      const variant = value.variants[platform];
      if (!variant || variant.content.length > SOCIAL_PLATFORM_SPECS[platform as SocialPlatformSpec["id"]].maxChars) ctx.addIssue({ code: "custom", path: ["variants", platform], message: `Missing or oversized ${platform} variant.` });
    }
  });
  const { result, meta } = await execute(params.workspaceId, params.userId, params.operation === "repurpose_content" ? "repurpose_content" : "generate_posts", "Write platform-native social copy. Return JSON: baseContent (string), variants keyed by every requested platform with content, hashtags (string[]), cta, formatLabel. Respect character limits. Do not invent brand facts, statistics, or testimonials.", params, validator, socialPostOutputSchema(params.platforms));
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
