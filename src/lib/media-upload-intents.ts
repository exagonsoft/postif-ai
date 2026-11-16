import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { mediaUploadIntents, type MediaUploadIntent } from "@/db/media-upload-schema";
import { assertBrandEntitlement } from "@/lib/entitlements";
import {
  MediaStorageError, MEDIA_UPLOAD_TTL_SECONDS, prepareDirectMediaUpload, signDirectMediaUpload,
  inspectDirectMediaUpload, finalizeDirectMediaUpload, cleanupDirectMediaUpload, mediaUploadCapability,
} from "@/lib/media-storage";

type UploadContext = {
  workspace?: { id: number } | null;
  activeBrand?: { id: number } | null;
  memberRole?: string | null;
} | null;
async function authorize(ctx: UploadContext) {
  if (!ctx?.workspace || !ctx.activeBrand || !["owner", "admin", "editor", "approver"].includes(ctx.memberRole || ""))
    throw new MediaStorageError("Upload permission required.", 403);
  await assertBrandEntitlement(ctx.workspace.id, ctx.activeBrand.id);
  return { workspaceId: ctx.workspace.id, brandId: ctx.activeBrand.id };
}
const busy = () => { throw new MediaStorageError("Another media upload is being updated. Retry shortly.", 409); };
async function workspaceLease<T>(workspaceId: number, callback: () => Promise<T>) {
  const result = await db.withLease<{ value: T } | null>(`media-uploads:${workspaceId}`, async () => ({ value: await callback() }), null);
  if (!result) return busy();
  return result.value;
}
export async function getMediaUploadCapability(ctx: UploadContext) {
  await authorize(ctx);
  return mediaUploadCapability();
}
export async function createMediaUploadIntent(ctx: UploadContext, input: { filename?: unknown; mimeType?: unknown; byteSize?: unknown }) {
  const scope = await authorize(ctx);
  const stored = prepareDirectMediaUpload(scope.workspaceId, input.filename, input.mimeType, input.byteSize);
  return workspaceLease(scope.workspaceId, async () => {
    const now = new Date();
    const recent = await db.find(mediaUploadIntents, { workspaceId: scope.workspaceId, createdAt: { $gte: new Date(now.getTime() - 3600000) } }, { limit: 20 });
    if (recent.length >= 20) throw new MediaStorageError("Workspace upload rate limit reached. Try again in an hour.", 429);
    const outstanding = await db.find(mediaUploadIntents, { workspaceId: scope.workspaceId, expiresAt: { $gt: now } }, { limit: 5 });
    if (outstanding.length >= 5) throw new MediaStorageError("Workspace has too many active upload intents. Try again in five minutes.", 429);
    const expiresAt = new Date(now.getTime() + MEDIA_UPLOAD_TTL_SECONDS * 1000);
    const [intent] = await db.transaction(async tx => {
      await assertBrandEntitlement(scope.workspaceId, scope.brandId, tx);
      return tx.insert(mediaUploadIntents, { ...stored, ...scope, id: randomUUID(), expiresAt, nextCleanupAt: expiresAt });
    });
    const post = await signDirectMediaUpload(intent, expiresAt);
    return { intentId: intent.id, expiresAt, post };
  });
}
async function findIntent(scope: { workspaceId: number; brandId: number }, id: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw new MediaStorageError("Upload intent not found.", 404);
  const [intent] = await db.find(mediaUploadIntents, { ...scope, id }, { limit: 1 });
  if (!intent) throw new MediaStorageError("Upload intent not found.", 404);
  return intent;
}
function assetResponse(asset: { id: number; title: string; assetType: string; generationStatus: string }) {
  return { id: asset.id, title: asset.title, assetType: asset.assetType, generationStatus: asset.generationStatus, url: `/api/media/${asset.id}/content` };
}
export async function completeMediaUploadIntent(ctx: UploadContext, id: string) {
  const scope = await authorize(ctx);
  return workspaceLease(scope.workspaceId, async () => {
    let intent = await findIntent(scope, id);
    if (intent.status === "completed") {
      const [asset] = await db.find(mediaAssets, { ...scope, id: intent.assetId }, { limit: 1 });
      if (!asset) throw new MediaStorageError("Completed media has been deleted.", 410);
      return assetResponse(asset);
    }
    if (intent.status !== "pending" || intent.expiresAt.getTime() <= Date.now()) throw new MediaStorageError("Upload intent expired or is no longer active.", 410);
    let verified;
    try { verified = await inspectDirectMediaUpload(intent, intent.sourceVersion); }
    catch (error) {
      if (error instanceof MediaStorageError && error.status === 400)
        await db.update(mediaUploadIntents, { id }, { status: "rejected" });
      throw error;
    }
    if (!intent.sourceVersion) {
      [intent] = await db.update(mediaUploadIntents, { id, status: "pending" }, { sourceVersion: verified.versionId, sourceETag: verified.etag });
    }
    const stored = await finalizeDirectMediaUpload(intent, intent.sourceVersion!, intent.sourceETag!);
    // Only durable DB work in a retryable transaction. A crash before commit leaves
    // a pinned source and deterministic destination for retry or expiry cleanup.
    return db.transaction(async tx => {
      await assertBrandEntitlement(scope.workspaceId, scope.brandId, tx);
      const [current] = await tx.find(mediaUploadIntents, { ...scope, id }, { lock: true, limit: 1 });
      if (!current || current.status !== "pending") throw new MediaStorageError("Upload intent is no longer active.", 409);
      const [asset] = await tx.insert(mediaAssets, {
        ...scope, ...stored, title: intent.title, altText: intent.title,
        mimeType: verified.mimeType, assetType: verified.assetType, url: "", isSampleData: false,
      });
      await tx.update(mediaUploadIntents, { id }, { status: "completed", assetId: asset.id });
      return assetResponse(asset);
    });
  });
}
export async function cancelMediaUploadIntent(ctx: UploadContext, id: string) {
  const scope = await authorize(ctx);
  return workspaceLease(scope.workspaceId, async () => {
    const intent = await findIntent(scope, id);
    if (intent.status === "completed") throw new MediaStorageError("Completed uploads must be deleted from the media library.", 409);
    await db.update(mediaUploadIntents, { id }, { status: "cancelled" });
    // Keep the intent until after policy expiry; its signed POST may still be replayed.
    return { cleanupPending: true };
  });
}

export async function cleanupExpiredMediaUploads({ deadline = Date.now() + 8000, limit = 10 }: { deadline?: number; limit?: number } = {}) {
  const result = { inspected: 0, cleaned: 0, failed: 0 };
  if (!Number.isFinite(deadline) || deadline <= Date.now() + 1000) return result;
  deadline = Math.min(deadline, Date.now() + 20000);
  limit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.floor(limit))) : 10;
  const now = new Date();
  const candidates = await db.find(mediaUploadIntents, { expiresAt: { $lte: now }, nextCleanupAt: { $lte: now } }, { sort: { nextCleanupAt: 1 }, limit });
  for (const candidate of candidates) {
    if (Date.now() + 1000 >= deadline) break;
    try {
      await db.withLease(`media-uploads:${candidate.workspaceId}`, async () => {
        if (Date.now() + 1000 >= deadline) return;
        const [intent] = await db.find(mediaUploadIntents, { id: candidate.id }, { limit: 1 });
        if (!intent || intent.expiresAt.getTime() > Date.now()) return;
        result.inspected++;
        const cleaned = await cleanupDirectMediaUpload(intent, intent.status !== "completed", deadline - 500);
        const changes: Partial<MediaUploadIntent> = {
          nextCleanupAt: new Date(Date.now() + (cleaned ? 3600000 : 1000)),
          ...(intent.status === "pending" ? { status: "expired" as const } : {}),
        };
        await db.update(mediaUploadIntents, { id: intent.id }, changes);
        if (cleaned) result.cleaned++;
      }, undefined);
    } catch {
      result.failed++;
      console.error("Temporary media cleanup failed", { workspaceId: candidate.workspaceId });
    }
  }
  return result;
}
