import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

const loadPackage = createRequire(path.join(process.cwd(), "package.json"));

export function resolveFfmpegPath() {
  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured) return configured;
  try {
    const bundled: unknown = loadPackage("ffmpeg-static");
    if (typeof bundled === "string" && bundled && existsSync(bundled)) return bundled;
  } catch {
    // A missing bundled binary may use PATH during local development, never in production.
  }
  if (process.env.NODE_ENV === "production" || process.env.AWS_APP_ID || process.env.AWS_BRANCH || process.env.AWS_EXECUTION_ENV) {
    throw new Error("The bundled FFmpeg binary is unavailable. Include ffmpeg-static in the Next.js server artifact, or configure FFMPEG_PATH to a runtime-compatible executable.");
  }
  return "ffmpeg";
}
