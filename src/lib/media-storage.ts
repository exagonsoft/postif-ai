import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getMediaStorageConfig, type MediaStorageConfig } from "./media-storage-config";

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MEDIA_DOWNLOAD_TTL_SECONDS = 300;
export interface MediaStorageReference {
  workspaceId: number;
  storageKey: string | null;
  storageProvider?: string;
  storageBucket?: string | null;
  storageRegion?: string | null;
}
export interface StoredMedia {
  storageKey: string;
  storageProvider: "local" | "s3";
  storageBucket: string | null;
  storageRegion: string | null;
  byteSize: number;
}
interface MediaStorageProvider {
  put(key: string, bytes: Buffer, mimeType: string): Promise<StoredMedia>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  downloadUrl(key: string, mimeType: string): Promise<string | null>;
}
export class MediaStorageError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export function detectMedia(bytes: Buffer): { mimeType: string; assetType: "image" | "video" | "gif"; extension: string } | null {
  if (bytes.length < 12) return null;
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return { mimeType: "image/gif", assetType: "gif", extension: "gif" };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: "image/png", assetType: "image", extension: "png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mimeType: "image/jpeg", assetType: "image", extension: "jpg" };
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mimeType: "image/webp", assetType: "image", extension: "webp" };
  if (bytes.toString("ascii", 4, 8) === "ftyp" && ["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(bytes.toString("ascii", 8, 12))) return { mimeType: "video/mp4", assetType: "video", extension: "mp4" };
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) && bytes.subarray(0, 4096).includes(Buffer.from("webm"))) return { mimeType: "video/webm", assetType: "video", extension: "webm" };
  return null;
}
function workspacePrefix(workspaceId: number) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) throw new MediaStorageError("Invalid media workspace.", 400);
  return `workspaces/${workspaceId}/`;
}
const filenamePattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(png|jpg|webp|mp4|webm|gif)$/;
const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm" };
function safeKey(reference: MediaStorageReference, prefix: string) {
  const key = reference.storageKey;
  if (!key || !key.startsWith(prefix) || !filenamePattern.test(key.slice(prefix.length))) throw new MediaStorageError("Invalid media storage reference.", 400);
  return key;
}
function logStorageFailure(provider: string, operation: string, error: unknown) {
  const code = error instanceof Error ? error.name : "unknown";
  console.error("Media storage operation failed", { provider, operation, code: /^[A-Za-z0-9_]+$/.test(code) ? code : "storage_error" });
}
function localStorage(directory: string): MediaStorageProvider {
  const location = (key: string) => path.join(/* turbopackIgnore: true */ directory, ...key.split("/"));
  return {
    async put(key, bytes) {
      const file = location(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes, { flag: "wx" });
      return { storageKey: key, storageProvider: "local", storageBucket: null, storageRegion: null, byteSize: bytes.length };
    },
    async read(key) { return readFile(location(key)); },
    async delete(key) {
      try { await unlink(location(key)); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
    },
    async downloadUrl() { return null; },
  };
}
const clients = new Map<string, S3Client>();
function s3Storage(config: Extract<MediaStorageConfig, { provider: "s3" }>): MediaStorageProvider {
  let client = clients.get(config.region);
  if (!client) {
    client = new S3Client({ region: config.region });
    clients.set(config.region, client);
  }
  const s3 = client;
  return {
    async put(key, bytes, mimeType) {
      await s3.send(new PutObjectCommand({
        Bucket: config.bucket, Key: key, Body: bytes, ContentType: mimeType, ContentLength: bytes.length,
        CacheControl: "private, no-store", IfNoneMatch: "*",
        ChecksumSHA256: createHash("sha256").update(bytes).digest("base64"),
      }), { abortSignal: AbortSignal.timeout(60000) });
      return { storageKey: key, storageProvider: "s3", storageBucket: config.bucket, storageRegion: config.region, byteSize: bytes.length };
    },
    async read(key) {
      const response = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(60000) });
      if (!response.Body) throw new MediaStorageError("Media file unavailable.", 404);
      return readLimitedResponse(new Response(response.Body.transformToWebStream()));
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(60000) });
    },
    async downloadUrl(key, mimeType) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseContentType: mimeType, ResponseContentDisposition: "inline", ResponseCacheControl: "private, no-store" }), { expiresIn: MEDIA_DOWNLOAD_TTL_SECONDS });
    },
  };
}
function resolveStorage(reference: MediaStorageReference) {
  const scopedPrefix = workspacePrefix(reference.workspaceId);
  if (reference.storageProvider === "s3") {
    const config = getMediaStorageConfig();
    if (config.provider !== "s3" || reference.storageBucket !== config.bucket || reference.storageRegion !== config.region) throw new MediaStorageError("S3 media configuration does not match the stored asset.");
    return { provider: s3Storage(config), key: safeKey(reference, config.prefix + scopedPrefix), kind: "s3" };
  }
  if (reference.storageProvider && reference.storageProvider !== "local") throw new MediaStorageError("Unsupported stored media provider.");
  // Old records have flat UUID keys and no provider metadata. Never reinterpret them as S3 objects.
  const legacy = !reference.storageProvider && filenamePattern.test(reference.storageKey || "");
  const key = legacy ? reference.storageKey! : safeKey(reference, scopedPrefix);
  if (process.env.MEDIA_STORAGE_PROVIDER === "s3" && !process.env.MEDIA_STORAGE_DIR) throw new MediaStorageError("This legacy local asset must be copied to S3 before it can be served on Amplify.");
  const config = getMediaStorageConfig({ ...process.env, MEDIA_STORAGE_PROVIDER: "local" });
  if (config.provider !== "local") throw new MediaStorageError("Local media storage is unavailable.");
  return { provider: localStorage(config.directory), key, kind: "local" };
}
async function operation<T>(kind: string, name: string, callback: () => Promise<T>): Promise<T> {
  try { return await callback(); }
  catch (error) {
    if (error instanceof MediaStorageError) throw error;
    logStorageFailure(kind, name, error);
    const missing = error instanceof Error && (["NoSuchKey", "NotFound"].includes(error.name) || ("code" in error && error.code === "ENOENT"));
    throw new MediaStorageError(missing ? "Media file unavailable." : "Media storage is unavailable. Try again later.", missing ? 404 : 503);
  }
}
export async function storeMedia(bytes: Buffer, workspaceId: number) {
  const scope = workspacePrefix(workspaceId);
  if (bytes.length > MAX_MEDIA_BYTES) throw new MediaStorageError("Media must be no larger than 50 MB.", 413);
  const format = detectMedia(bytes);
  if (!format) throw new MediaStorageError("Supported files: PNG, JPEG, WebP, GIF, MP4, and WebM.", 400);
  const config = getMediaStorageConfig();
  const provider = config.provider === "s3" ? s3Storage(config) : localStorage(config.directory);
  const key = `${config.provider === "s3" ? config.prefix : ""}${scope}${randomUUID()}.${format.extension}`;
  const stored = await operation(config.provider, "upload", () => provider.put(key, bytes, format.mimeType));
  return { ...stored, ...format };
}
export async function readMedia(reference: MediaStorageReference) {
  const { provider, key, kind } = resolveStorage(reference);
  return operation(kind, "read", async () => {
    const bytes = await provider.read(key);
    if (bytes.length > MAX_MEDIA_BYTES) throw new MediaStorageError("Stored media exceeds the size limit.");
    return bytes;
  });
}
export async function deleteMedia(reference: MediaStorageReference) {
  const { provider, key, kind } = resolveStorage(reference);
  return operation(kind, "delete", () => provider.delete(key));
}
export async function mediaDownloadUrl(reference: MediaStorageReference) {
  const { provider, key, kind } = resolveStorage(reference);
  const mimeType = mimeTypes[key.slice(key.lastIndexOf(".") + 1)];
  return operation(kind, "sign_download", () => provider.downloadUrl(key, mimeType));
}

export async function readLimitedResponse(response: Response) {
  if (!response.ok || !response.body) throw new Error("Media download failed.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MEDIA_BYTES) throw new MediaStorageError("Media exceeds the 50 MB limit.", 413);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
