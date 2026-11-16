import { db } from "@/db";
import { aiConfigurations, mediaAssets, workspaces, aiUsageRecords, type MediaAssetsDocument } from "@/db/schema";
import { and, eq, inArray, increment } from "@/db/filters";
import { decryptSecret } from "./crypto";
import { WorkflowError } from "./post-policy";
import { storeMedia, deleteMedia, readLimitedResponse } from "./media-storage";
import { videoToGif, verifyGifEncoder } from "./gif-generation";
async function imageKey(workspaceId: number) {
    const [config] = await db.find(aiConfigurations, eq("workspaceId", workspaceId), {});
    if (config?.mode === "byok")
        return { key: config.encryptedApiKey ? decryptSecret(config.encryptedApiKey) : null, byok: true };
    return { key: process.env.OPENAI_API_KEY || null, byok: false };
}
function runwayHeaders() { return { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`, "X-Runway-Version": "2024-11-06", "Content-Type": "application/json" }; }
async function saveGeneratedMedia(asset: MediaAssetsDocument, bytes: Buffer) {
    const stored = await storeMedia(bytes, asset.workspaceId);
    try {
        const [updated] = await db.update(mediaAssets, { id: asset.id, workspaceId: asset.workspaceId, generationStatus: "processing" }, { ...stored, generationStatus: "ready" });
        if (!updated) throw new Error("Generated media is no longer available for completion.");
    } catch (error) {
        try { await deleteMedia({ workspaceId: asset.workspaceId, ...stored }); }
        catch { console.error("Generated media rollback cleanup failed", { assetId: asset.id, workspaceId: asset.workspaceId }); }
        throw error;
    }
}
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function cancelQueuedMedia(tx: Transaction, id: number, workspaceId: number) {
    const [asset] = await tx.find(mediaAssets, and(eq("id", id), eq("workspaceId", workspaceId)), { lock: true });
    if (asset?.generationStatus !== "queued")
        return;
    await tx.update(mediaAssets, eq("id", id), { generationStatus: "cancelled", generationCredits: 0 });
    if (asset.generationCredits) {
        await tx.update(workspaces, eq("id", workspaceId), { aiCreditsBalance: increment(asset.generationCredits) });
        await tx.insert(aiUsageRecords, { workspaceId, operation: "Cancelled media generation refund", creditsUsed: -asset.generationCredits, model: asset.assetType, executionSource: "cancelled", tokensEstimate: 0 });
    }
}
export async function queueMedia(workspaceId: number, brandId: number, userId: number, input: {
    prompt: string;
    kind: "image" | "video" | "gif";
    aspectRatio: string;
}, transaction?: Transaction) {
    const credentials = input.kind === "image" ? await imageKey(workspaceId) : { key: process.env.RUNWAY_API_KEY, byok: false };
    if (!credentials.key)
        throw new WorkflowError(input.kind === "image" ? "Configure an OpenAI key in Billing before generating images." : "Video generation requires the administrator to configure Runway.", 409);
    if (input.kind === "gif") {
        try {
            await verifyGifEncoder();
        }
        catch (error) {
            throw new WorkflowError(error instanceof Error ? error.message : "GIF encoder is unavailable.", 409);
        }
    }
    const credits = credentials.byok ? 0 : input.kind === "image" ? 40 : 120;
    const enqueue = async (tx: Transaction) => {
        const [workspace] = await tx.find(workspaces, eq("id", workspaceId), { lock: true });
        if (!workspace || workspace.aiCreditsBalance < credits)
            throw new WorkflowError(`This generation requires ${credits} managed credits.`, 409);
        if (credits)
            await tx.update(workspaces, eq("id", workspaceId), { aiCreditsBalance: increment(-credits) });
        const [asset] = await tx.insert(mediaAssets, { workspaceId, brandId, title: input.prompt.slice(0, 100), prompt: input.prompt, assetType: input.kind, aspectRatio: input.aspectRatio, url: "", generationStatus: "queued", generationCredits: credits, altText: input.prompt.slice(0, 500), isSampleData: false });
        await tx.insert(aiUsageRecords, { workspaceId, userId, operation: `Queued ${input.kind} generation`, billingMode: credentials.byok ? "byok" : "managed", creditsUsed: credits, model: input.kind === "image" ? (process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5") : "gen4.5", executionSource: "queued", tokensEstimate: 0 });
        return asset;
    };
    return transaction ? enqueue(transaction) : db.transaction(enqueue);
}
// Called by the server worker, so generation survives closing the browser.
export async function refreshPendingMedia() {
    return db.withLease("media-generation", async () => {
    const assets = await db.find(mediaAssets, inArray("generationStatus", ["queued", "processing"]), { projection: { id: 1 }, limit: 1, sort: { id: 1 } });
    let processed = 0;
    for (const { id } of assets) {
        // Commit the claim before any paid provider request. An interrupted submission
        // is never automatically re-submitted because its delivery is uncertain.
        const [claimed] = await db.update(mediaAssets, and(eq("id", id), eq("generationStatus", "queued")), { generationStatus: "processing", generationStartedAt: new Date() });
        await (async () => {
            const tx = db;
            const [asset] = await tx.find(mediaAssets, and(eq("id", id), inArray("generationStatus", ["queued", "processing"])), { limit: 1 });
            if (!asset)
                return;
            try {
                if (!claimed && !asset.providerJobId) {
                    if (asset.generationStartedAt && Date.now() - asset.generationStartedAt.getTime() < 10 * 60000)
                        return;
                    throw new Error("Generation was interrupted. Credits returned; check the provider before generating again.");
                }
                if (asset.providerJobId && asset.generationStartedAt && Date.now() - asset.generationStartedAt.getTime() > 24 * 3600000)
                    throw new Error("Video generation did not finish within 24 hours.");
                if (asset.assetType === "image") {
                    const { key } = await imageKey(asset.workspaceId);
                    if (!key)
                        throw new Error("Image provider is not configured.");
                    const response = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5", prompt: asset.prompt, n: 1, size: asset.aspectRatio === "1:1" ? "1024x1024" : asset.aspectRatio === "9:16" ? "1024x1536" : "1536x1024", output_format: "png" }), signal: AbortSignal.timeout(120000) });
                    if (!response.ok)
                        throw new Error(`Image provider returned HTTP ${response.status}.`);
                    const data = await response.json();
                    if (!data.data?.[0]?.b64_json)
                        throw new Error("Image provider returned no image.");
                    await saveGeneratedMedia(asset, Buffer.from(data.data[0].b64_json, "base64"));
                }
                else if (!asset.providerJobId) {
                    if (!process.env.RUNWAY_API_KEY)
                        throw new Error("Video provider is not configured.");
                    const response = await fetch("https://api.dev.runwayml.com/v1/text_to_video", { method: "POST", headers: runwayHeaders(), body: JSON.stringify({ model: "gen4.5", promptText: asset.prompt, ratio: asset.aspectRatio === "9:16" ? "720:1280" : "1280:720", duration: 5 }), signal: AbortSignal.timeout(30000) });
                    if (!response.ok)
                        throw new Error(`Video provider returned HTTP ${response.status}.`);
                    const data = await response.json();
                    if (typeof data.id !== "string")
                        throw new Error("Video provider returned no task ID.");
                    await tx.update(mediaAssets, eq("id", id), { generationStatus: "processing", providerJobId: data.id });
                }
                else {
                    const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(asset.providerJobId)}`, { headers: runwayHeaders(), signal: AbortSignal.timeout(15000) });
                    if (response.status === 429 || response.status >= 500)
                        return; // Poll again, don't resubmit a paid generation.
                    if (!response.ok)
                        throw new Error(`Video status returned HTTP ${response.status}.`);
                    const data = await response.json();
                    if (["FAILED", "CANCELLED"].includes(data.status))
                        throw new Error("Video generation failed. Try a different prompt.");
                    if (data.status !== "SUCCEEDED")
                        return;
                    const url = new URL(data.output?.[0]);
                    if (url.protocol !== "https:")
                        throw new Error("Invalid generated video URL.");
                    const download = await fetch(url, { signal: AbortSignal.timeout(60000) });
                    const video = await readLimitedResponse(download);
                    await saveGeneratedMedia(asset, asset.assetType === "gif" ? await videoToGif(video) : video);
                }
                processed++;
            }
            catch (error) {
                // Keep the provider ID for manual investigation; never silently regenerate and charge again.
                await db.transaction(async tx => {
                await tx.update(mediaAssets, eq("id", id), { generationStatus: "failed", generationError: error instanceof Error ? error.message : "Generation failed.", generationCredits: 0 });
                if (asset.generationCredits)
                    await tx.update(workspaces, eq("id", asset.workspaceId), { aiCreditsBalance: increment(asset.generationCredits) });
                if (asset.generationCredits)
                    await tx.insert(aiUsageRecords, { workspaceId: asset.workspaceId, operation: "Media generation credit refund", creditsUsed: -asset.generationCredits, model: asset.assetType === "image" ? "image" : "video", executionSource: "failed", tokensEstimate: 0 });
                });
            }
        })();
    }
    return processed;
    }, 0);
}
