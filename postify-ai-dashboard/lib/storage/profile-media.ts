import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const maxUploadBytes = 50 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function storeProfileMedia(profileId: string, file: File) {
  if (!allowedTypes.has(file.type)) throw new Error("Only JPG, PNG, WebP, GIF, MP4, and WebM files are supported.");
  if (file.size > maxUploadBytes) throw new Error("Media files must be 50 MB or smaller.");

  const extension = extensions[file.type];
  const filename = `${randomUUID()}.${extension}`;
  const directory = path.join(process.cwd(), "storage", "profiles", profileId, "media");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));

  return { originalName: file.name, path: path.posix.join("storage", "profiles", profileId, "media", filename), mimeType: file.type, size: file.size };
}