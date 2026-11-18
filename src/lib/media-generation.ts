import { db } from "@/db";
import { aiConfigurations, mediaAssets, workspaces, aiUsageRecords, type MediaAssetsDocument } from "@/db/schema";
import { mediaReservations, type MediaReservation } from "@/db/worker-schema";
import { decryptSecret } from "./crypto";
import { WorkflowError } from "./post-policy";
import { storeMedia, deleteMedia, detectMedia, readLimitedResponse, checkMediaStorageCredentials, MediaStorageError } from "./media-storage";
import { assertBrandEntitlement, getWorkspaceEntitlements } from "./entitlements";
import { credentialVersion, validCreditBalance, validReservationCredits } from "./ai-request-policy";
import { deadlineSignal, hasTime, type WorkerOptions } from "./worker-budget";
import { getCreditEpoch } from "./subscriptions";
import { reserveCredits, restoreCredits } from "./ai-credit-wallet";
import { verifyGifEncoder, videoToGif } from "./gif-generation";
import { backgroundImageModelSupported, backgroundImageResult, pollBackgroundImage, submitBackgroundImage } from "./openai-background-images";
import { withWorkerDeadline } from "./worker-network";
import { mediaDiagnostic } from "./media-diagnostics";
import { getMediaStorageConfig } from "./media-storage-config";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
function assertMediaStorageConfigured() {
  try { return getMediaStorageConfig(); }
  catch { throw new WorkflowError("Media storage is not configured correctly. Contact an administrator before generating media.", 409); }
}
async function mediaPayer(tx: Transaction, workspaceId: number, kind: string) {
  const { plan } = await getWorkspaceEntitlements(workspaceId, tx);
  const [config] = await tx.find(aiConfigurations, { workspaceId });
  const [workspace] = await tx.find(workspaces, { id: workspaceId });
  const mode = plan.allowsConfigurableAiMode ? config?.mode ?? workspace?.aiBillingMode : plan.defaultAiMode;
  if (!["byok", "managed"].includes(mode)) throw new WorkflowError("Invalid AI billing mode.", 409);
  if (kind !== "image" && mode === "byok") throw new WorkflowError("BYOK video/GIF generation is not supported. No managed provider will be charged.", 409);
  const billingMode = mode as "byok" | "managed";
  const raw = kind === "image" ? billingMode === "byok" ? config?.encryptedApiKey : process.env.OPENAI_API_KEY : process.env.RUNWAY_API_KEY;
  const key = kind === "image" && billingMode === "byok" ? raw && decryptSecret(raw) : raw;
  if (!key || !raw) throw new WorkflowError(kind === "image" ? "Configure a valid OpenAI key before generating images." : "Managed video requires an administrator-configured Runway key.", 409);
  const model = kind === "image" ? process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5" : "gen4.5";
  const responseModel = kind === "image" && backgroundImageModelSupported(model) ? process.env.OPENAI_IMAGE_RESPONSE_MODEL || "gpt-5.2" : null;
  const transport = kind === "image" ? responseModel ? "openai_responses" as const : "openai_images" as const : "runway" as const;
  return { key, billingMode, model, responseModel, transport, credentialVersion: credentialVersion(billingMode, raw, model) };
}
function runwayHeaders(key: string) {
  return { Authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06", "Content-Type": "application/json" };
}
export function mediaGenerationReadiness() {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
  const asynchronous = backgroundImageModelSupported(model);
  return {
    image: { configured: !!process.env.OPENAI_API_KEY, byokSupported: true, asynchronous,
      model, responseModel: asynchronous ? process.env.OPENAI_IMAGE_RESPONSE_MODEL || "gpt-5.2" : null,
      providerAccessVerified: false, boundedSynchronous: !asynchronous },
    video: { configured: !!process.env.RUNWAY_API_KEY, asynchronous: true, byokSupported: false },
    gif: { supported: true, available: null, byokSupported: false,
      configuredPath: !!process.env.FFMPEG_PATH, bundledPackage: "ffmpeg-static",
      validation: "FFMPEG_PATH or the bundled FFmpeg executable is verified in the Next.js runtime before reserving credits; conversion has a hard remaining-deadline timeout." },
  };
}
export async function checkMediaGeneration(workspaceId: number, brandId: number, kind: "image" | "video" | "gif") {
  let step = "brand_entitlement";
  try {
    await assertBrandEntitlement(workspaceId, brandId);
    step = "storage_configuration";
    const storage = assertMediaStorageConfigured();
    step = "storage_credentials";
    try { await checkMediaStorageCredentials(storage); }
    catch (error) {
      if (error instanceof MediaStorageError) throw new WorkflowError(error.message, error.status);
      throw error;
    }
    step = "workspace";
    const [workspace] = await db.find(workspaces, { id: workspaceId });
    if (!workspace) throw new WorkflowError("Workspace not found.", 404);
    step = "credit_balance";
    if (!Number.isSafeInteger(workspace.aiCreditsBalance) || workspace.aiCreditsBalance < 0)
      throw new WorkflowError("AI credit balance requires administrator reconciliation.", 409);
    step = "provider_configuration";
    const payer = await mediaPayer(db, workspaceId, kind);
    if (kind === "gif") {
      step = "gif_encoder";
      try { await verifyGifEncoder({ deadline: Date.now() + 2500 }); }
      catch { throw new WorkflowError("FFmpeg is unavailable in this Next.js runtime.", 409); }
    }
    step = "credit_allowance";
    const credits = payer.billingMode === "byok" ? 0 : kind === "image" ? 40 : 120;
    if (workspace.aiCreditsBalance < credits) throw new WorkflowError(`This generation requires ${credits} managed credits.`, 409);
    mediaDiagnostic("gate", { kind, provider: kind === "image" ? "openai" : "runway", billingMode: payer.billingMode, result: "allowed" });
    return { kind, provider: kind === "image" ? "openai" : "runway", billingMode: payer.billingMode, credits };
  } catch (error) {
    mediaDiagnostic("gate", { kind, provider: kind === "image" ? "openai" : "runway", result: "rejected", step, category: error instanceof WorkflowError ? "expected" : "unexpected" });
    throw error;
  }
}
async function saveGeneratedMedia(asset: MediaAssetsDocument, reservation: MediaReservation, bytes: Buffer, tokens = 0) {
  if (detectMedia(bytes)?.assetType !== asset.assetType) {
    mediaDiagnostic("storage", { kind: asset.assetType, result: "invalid_format" });
    throw new Error("The generated media format was invalid. Verify provider usage before requesting another generation.");
  }
  let stored: Awaited<ReturnType<typeof storeMedia>>;
  try { stored = await storeMedia(bytes, asset.workspaceId); }
  catch {
    mediaDiagnostic("storage", { kind: asset.assetType, result: "failed" });
    throw new Error("Generated media could not be stored. Verify storage settings and provider usage before requesting another generation.");
  }
  try {
    await db.transaction(async tx => {
      const [current] = await tx.find(mediaReservations, { id: reservation.id, status: "reserved" }, { lock: true });
      if (!current) throw new Error("Generation reservation is no longer active.");
      const [updated] = await tx.update(mediaAssets, { id: asset.id, workspaceId: asset.workspaceId, generationStatus: "processing" }, { ...stored, generationStatus: "ready", generationError: null });
      if (!updated) throw new Error("Generated media is no longer available.");
      await tx.update(mediaReservations, { id: current.id }, { status: "succeeded" });
      if (current.usageRecordId) await tx.update(aiUsageRecords, { id: current.usageRecordId, workspaceId: asset.workspaceId }, {
        executionSource: asset.assetType === "image" ? current.billingMode === "byok" ? "byok_live" : "openai_live" : "runway_live", tokensEstimate: tokens,
      });
    });
    mediaDiagnostic("storage", { kind: asset.assetType, result: "ready" });
  } catch (error) {
    mediaDiagnostic("storage", { kind: asset.assetType, result: "failed" });
    // A lost commit acknowledgement must not delete an object already attached by a committed transaction.
    const [persisted] = await db.find(mediaAssets, { id: asset.id, workspaceId: asset.workspaceId });
    if (persisted?.generationStatus === "ready" && persisted.storageKey === stored.storageKey) return;
    try { await deleteMedia({ workspaceId: asset.workspaceId, ...stored }); }
    catch { console.error("Generated media rollback cleanup failed", { assetId: asset.id }); }
    throw error;
  }
}
async function refundAsset(tx: Transaction, asset: MediaAssetsDocument, message: string, cancelled = false) {
  const [current] = await tx.find(mediaAssets, { id: asset.id, workspaceId: asset.workspaceId, generationStatus: { $in: cancelled ? ["queued"] : ["queued", "processing"] } }, { lock: true });
  if (!current) return;
  const [reservation] = await tx.find(mediaReservations, { assetId: asset.id }, { lock: true });
  if (reservation && reservation.status !== "reserved") return;
  const credits = reservation?.credits ?? current.generationCredits;
  validReservationCredits(credits, reservation?.billingMode || "managed");
  if (!Number.isSafeInteger(credits) || credits < 0 || credits !== current.generationCredits) throw new Error("Media credits require administrator reconciliation.");
  const [workspace] = await tx.find(workspaces, { id: current.workspaceId }, { lock: true });
  if (!workspace) return;
  validCreditBalance(workspace.aiCreditsBalance);
  const restored = reservation ? await restoreCredits(tx, workspace, credits, reservation.permanentAllocations, reservation.creditEpoch, await getCreditEpoch(current.workspaceId, tx)) : 0;
  const reason = !restored && credits ? `${message.replace(/Credits returned;?/g, "Reservation closed;")} Expired or unversioned credits are not carried into the current allowance.` : message;
  await tx.update(mediaAssets, { id: current.id, generationStatus: current.generationStatus }, { generationStatus: cancelled ? "cancelled" : "failed", generationError: reason, generationCredits: 0 });
  if (reservation) await tx.update(mediaReservations, { id: reservation.id }, { status: "refunded", refundedCredits: restored });
  if (reservation?.usageRecordId) await tx.update(aiUsageRecords, { id: reservation.usageRecordId, workspaceId: current.workspaceId }, { executionSource: cancelled ? "cancelled" : "failed" });
  if (credits) {
    await tx.insert(aiUsageRecords, { workspaceId: current.workspaceId, operation: restored ? "Media generation credit refund" : "Expired media reservation closed (no carryover)", billingMode: reservation?.billingMode || "managed", creditsUsed: -restored, model: reservation?.model || current.assetType, executionSource: !restored ? "expired_refund" : cancelled ? "cancelled" : "failed_refund", tokensEstimate: 0 });
  }
}
export async function cancelQueuedMedia(tx: Transaction, id: number, workspaceId: number) {
  const [asset] = await tx.find(mediaAssets, { id, workspaceId }, { lock: true });
  if (asset?.generationStatus === "queued") await refundAsset(tx, asset, "Generation cancelled.", true);
}
export async function queueMedia(workspaceId: number, brandId: number, userId: number, input: {
  prompt: string; kind: "image" | "video" | "gif"; aspectRatio: string;
}, transaction?: Transaction) {
  const enqueue = async (tx: Transaction) => {
    const [workspace] = await tx.find(workspaces, { id: workspaceId }, { lock: true });
    if (!workspace) throw new WorkflowError("Workspace not found.", 404);
    await assertBrandEntitlement(workspaceId, brandId, tx);
    assertMediaStorageConfigured();
    validCreditBalance(workspace.aiCreditsBalance);
    const payer = await mediaPayer(tx, workspaceId, input.kind);
    if (input.kind === "gif") {
      try { await verifyGifEncoder({ deadline: Date.now() + 2500 }); }
      catch (error) { throw new WorkflowError(error instanceof Error ? error.message : "FFmpeg is unavailable in this Next.js runtime.", 409); }
    }
    const credits = payer.billingMode === "byok" ? 0 : input.kind === "image" ? 40 : 120;
    if (workspace.aiCreditsBalance < credits) throw new WorkflowError(`This generation requires ${credits} managed credits.`, 409);
    const permanentAllocations = await reserveCredits(tx, workspace, credits);
    const [asset] = await tx.insert(mediaAssets, { workspaceId, brandId, title: input.prompt.slice(0, 100), prompt: input.prompt, assetType: input.kind, aspectRatio: input.aspectRatio, url: "", generationStatus: "queued", generationCredits: credits, altText: input.prompt.slice(0, 500), isSampleData: false });
    const [usage] = await tx.insert(aiUsageRecords, { workspaceId, userId, operation: `Queued ${input.kind} generation`, billingMode: payer.billingMode, creditsUsed: credits, model: payer.model, executionSource: "queued", tokensEstimate: 0 });
    await tx.insert(mediaReservations, { workspaceId, assetId: asset.id, credits, billingMode: payer.billingMode, model: payer.model,
      transport: payer.transport, responseModel: payer.responseModel, usageRecordId: usage.id,
      credentialVersion: payer.credentialVersion, creditEpoch: await getCreditEpoch(workspaceId, tx), permanentAllocations });
    return asset;
  };
  return transaction ? enqueue(transaction) : db.transaction(enqueue);
}

export async function refreshPendingMedia({ deadline = Date.now() + 20000, limit = 3, target }: WorkerOptions & { target?: { workspaceId: number; assetId: number } } = {}) {
  return withWorkerDeadline(deadline, () => db.withLease("media-generation", async () => {
    // Legacy jobs have no immutable payer. Never charge the currently selected provider for them.
    const legacy = target ? [] : await db.find(mediaAssets, { generationStatus: { $in: ["queued", "processing"] } }, { limit: 10, sort: { id: 1 } });
    for (const asset of legacy) {
      if (!hasTime(deadline)) break;
      const [reservation] = await db.find(mediaReservations, { assetId: asset.id });
      if (!reservation) await db.transaction(tx => refundAsset(tx, asset, "Legacy generation has no immutable payer reservation. Credits returned; verify any provider task before retrying."));
    }
    const reservations = await db.find(mediaReservations, { status: "reserved", nextCheckAt: { $lte: new Date() }, ...(target ? { workspaceId: target.workspaceId, assetId: target.assetId } : {}) }, { limit, sort: { lastCheckedAt: 1, id: 1 } });
    let processed = 0;
    for (const reservation of reservations) {
      if (!hasTime(deadline, 2000)) break;
      await db.update(mediaReservations, { id: reservation.id, status: "reserved" }, { lastCheckedAt: new Date(), nextCheckAt: new Date(Date.now() + (target ? 5000 : 30000)) });
      const [asset] = await db.find(mediaAssets, { id: reservation.assetId, generationStatus: { $in: ["queued", "processing"] } });
      if (!asset) continue;
      const [claimed] = await db.update(mediaAssets, { id: asset.id, generationStatus: "queued" }, { generationStatus: "processing", generationStartedAt: new Date() });
      if (claimed) mediaDiagnostic("generation", { kind: asset.assetType, provider: asset.assetType === "image" ? "openai" : "runway", result: "started" });
      let providerJobId = asset.providerJobId;
      try {
        if (!claimed && !asset.providerJobId) {
          if (asset.generationStartedAt && Date.now() - asset.generationStartedAt.getTime() < 120000) continue;
          throw new Error("Provider submission was interrupted. Credits returned; verify the provider before creating a new generation. This job will not be resubmitted.");
        }
        if (asset.generationStartedAt && Date.now() - asset.generationStartedAt.getTime() > 86400000) throw new Error("Provider generation exceeded 24 hours. Verify the provider before retrying.");
        const payer = await mediaPayer(db, asset.workspaceId, asset.assetType);
        if (payer.billingMode !== reservation.billingMode || payer.model !== reservation.model || payer.credentialVersion !== reservation.credentialVersion ||
          payer.transport !== reservation.transport || payer.responseModel !== reservation.responseModel) throw new Error("Generation payer, model, or credential version changed. Credits returned; submit a new request with your current configuration.");
        if (asset.assetType === "image" && reservation.transport === "openai_responses") {
          const response = providerJobId
            ? await pollBackgroundImage(payer.key, providerJobId, deadline)
            : await submitBackgroundImage({ key: payer.key, model: reservation.model, responseModel: reservation.responseModel!,
              prompt: asset.prompt, aspectRatio: asset.aspectRatio, workspaceId: asset.workspaceId, assetId: asset.id, deadline });
          if (!response) continue;
          if (!providerJobId) {
            const [checkpoint] = await db.update(mediaAssets, { id: asset.id, generationStatus: "processing", providerJobId: null }, { providerJobId: response.id });
            if (!checkpoint) throw new Error("Background image checkpoint could not be saved. Verify provider usage before requesting another image.");
            providerJobId = response.id;
          }
          const result = backgroundImageResult(response);
          if (!result || !hasTime(deadline, 2000)) continue;
          await saveGeneratedMedia(asset, reservation, result.bytes, result.tokens);
        } else if (asset.assetType === "image") {
          const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST", headers: { Authorization: `Bearer ${payer.key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: reservation.model, prompt: asset.prompt, n: 1, size: asset.aspectRatio === "1:1" ? "1024x1024" : asset.aspectRatio === "9:16" ? "1024x1536" : "1536x1024", output_format: "png" }),
            signal: deadlineSignal(deadline - 3000, 12000),
          });
          if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status}.`);
          const data = await response.json();
          if (!data.data?.[0]?.b64_json) throw new Error("Image provider returned no image.");
          if (!hasTime(deadline, 1500)) throw new Error("Image exceeded the bounded hosting budget. Provider usage may have occurred; verify before requesting another image.");
          await saveGeneratedMedia(asset, reservation, Buffer.from(data.data[0].b64_json, "base64"));
        } else if (!asset.providerJobId) {
          const response = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
            method: "POST", headers: runwayHeaders(payer.key),
            body: JSON.stringify({ model: reservation.model, promptText: asset.prompt, ratio: asset.aspectRatio === "9:16" ? "720:1280" : "1280:720", duration: 5 }),
            signal: deadlineSignal(deadline - 1500, 6000),
          });
          if (!response.ok) throw new Error(`Video provider returned HTTP ${response.status}.`);
          const data = await response.json();
          if (typeof data.id !== "string") throw new Error("Video provider returned no task ID. Verify provider usage before requesting another generation.");
          const [checkpoint] = await db.update(mediaAssets, { id: asset.id, generationStatus: "processing", providerJobId: null }, { providerJobId: data.id });
          if (!checkpoint) throw new Error("The video task could not be checkpointed. Verify provider usage before requesting another generation.");
        } else {
          const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(asset.providerJobId)}`, { headers: runwayHeaders(payer.key), signal: deadlineSignal(deadline - 1500, 4000) });
          if (response.status === 429 || response.status >= 500) continue;
          if (!response.ok) throw new Error(`Video status returned HTTP ${response.status}.`);
          const data = await response.json();
          if (["FAILED", "CANCELLED"].includes(data.status)) throw new Error("Video provider reported a failed generation.");
          if (data.status !== "SUCCEEDED" || !hasTime(deadline, 5000)) continue;
          const url = new URL(data.output?.[0]);
          if (url.protocol !== "https:") throw new Error("Invalid generated video URL.");
          const download = await fetch(url, { signal: deadlineSignal(deadline - 2000, 6000) });
          const video = await readLimitedResponse(download);
          if (asset.assetType === "gif") await verifyGifEncoder({ deadline });
          const output = asset.assetType === "gif" ? await videoToGif(video, { deadline: deadline - 1500 }) : video;
          await saveGeneratedMedia(asset, reservation, output);
        }
        processed++;
      } catch (error) {
        mediaDiagnostic("generation", { kind: asset.assetType, provider: asset.assetType === "image" ? "openai" : "runway", result: "error", httpStatus: error instanceof Error ? Number(error.message.match(/HTTP (\d{3})/)?.[1] || 0) : 0 });
        // Poll/download timeouts are recoverable with the same task ID; never resubmit a paid task.
        if (providerJobId && error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
          await db.update(mediaAssets, { id: asset.id, generationStatus: "processing" }, { generationError: "Generation output retrieval or conversion reached the request deadline. The same saved provider task will be retried; no new generation is submitted." });
          continue;
        }
        const message = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
          ? "Provider submission timed out within the hosting budget. Credits returned; provider usage is uncertain. Verify the provider before retrying."
          : error instanceof Error ? error.message : "Generation failed.";
        await db.transaction(tx => refundAsset(tx, asset, message));
      }
    }
    return processed;
  }, 0));
}
