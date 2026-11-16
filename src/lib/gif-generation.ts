import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getWorkerDeadline } from "./worker-network";
import { resolveFfmpegPath } from "./ffmpeg-path";

const run = promisify(execFile);
type ConversionOptions = { deadline?: number };
function conversionTimeout(options: ConversionOptions, maximum: number) {
  const deadline = options.deadline ?? getWorkerDeadline();
  const timeout = deadline === undefined ? maximum : Math.min(maximum, deadline - Date.now() - 300);
  if (timeout < 1) throw Object.assign(new Error("Media conversion deferred because the request deadline was reached."), { name: "TimeoutError" });
  return Math.floor(timeout);
}
export async function verifyGifEncoder(options: ConversionOptions = {}) {
  try { await run(resolveFfmpegPath(), ["-version"], { timeout: conversionTimeout(options, 2000), killSignal: "SIGKILL", windowsHide: true }); }
  catch (error) {
    if ((error as { name?: string; killed?: boolean }).name === "TimeoutError" || (error as { killed?: boolean }).killed) {
      throw Object.assign(new Error("FFmpeg verification exceeded the remaining request budget."), { name: "TimeoutError" });
    }
    if (error instanceof Error && error.message.startsWith("The bundled FFmpeg binary is unavailable.")) throw error;
    throw new Error("GIF generation needs an executable FFmpeg binary in the Next.js runtime (or FFMPEG_PATH configured).");
  }
}
async function cleanupConversion(input: string, output: string, directory: string) {
  let failed = false;
  for (const file of [input, output]) {
    await unlink(file).catch(error => { if (error.code !== "ENOENT") failed = true; });
  }
  await rmdir(directory).catch(error => { if (error.code !== "ENOENT") failed = true; });
  if (failed) throw new Error("Media conversion intermediate cleanup failed. Verify writable runtime scratch storage.");
}
async function convertMedia(bytes: Buffer, extension: "gif" | "jpg", arguments_: string[], options: ConversionOptions) {
  conversionTimeout(options, 60000);
  const directory = await mkdtemp(path.join(tmpdir(), "postif-convert-"));
  const input = path.join(directory, "source.media");
  const output = path.join(directory, `result.${extension}`);
  try {
    await writeFile(input, bytes);
    try {
      await run(resolveFfmpegPath(), ["-nostdin", "-y", "-i", input, ...arguments_, output], { timeout: conversionTimeout(options, 60000), killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 });
    } catch (error) {
      if ((error as { killed?: boolean }).killed) throw Object.assign(new Error("FFmpeg conversion exceeded the remaining request budget; retry the same provider task on a later sweep."), { name: "TimeoutError" });
      throw new Error("FFmpeg conversion failed. Verify the input, executable compatibility, and writable runtime storage.", { cause: error });
    }
    return await readFile(output);
  } finally {
    await cleanupConversion(input, output, directory);
  }
}

export function videoToGif(video: Buffer, options: ConversionOptions = {}) {
  return convertMedia(video, "gif", ["-t", "5", "-an", "-filter_complex", "fps=10,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0"], options);
}
export function imageToJpeg(image: Buffer, options: ConversionOptions = {}) {
  return convertMedia(image, "jpg", ["-frames:v", "1", "-q:v", "2"], options);
}
