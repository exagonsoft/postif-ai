import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const executable = () => process.env.FFMPEG_PATH || "ffmpeg";
export async function verifyGifEncoder() {
  try { await run(executable(), ["-version"], { timeout: 10000, windowsHide: true }); }
  catch { throw new Error("GIF generation needs FFmpeg installed on the worker (or FFMPEG_PATH configured)."); }
}
async function convertMedia(bytes: Buffer, extension: "gif" | "jpg", arguments_: string[]) {
  const directory = await mkdtemp(path.join(tmpdir(), "postif-convert-"));
  const input = path.join(directory, "source.media");
  const output = path.join(directory, `result.${extension}`);
  try {
    await writeFile(input, bytes);
    await run(executable(), ["-nostdin", "-y", "-i", input, ...arguments_, output], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    return await readFile(output);
  } finally {
    // Only the two known files inside our freshly created temporary directory.
    for (const file of [input, output]) {
      await unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
    await rmdir(directory);
  }
}

export function videoToGif(video: Buffer) {
  return convertMedia(video, "gif", ["-t", "5", "-an", "-filter_complex", "fps=10,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0"]);
}
export function imageToJpeg(image: Buffer) {
  return convertMedia(image, "jpg", ["-frames:v", "1", "-q:v", "2"]);
}
