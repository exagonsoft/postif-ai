import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function fixture({ killed = false, missing = false, deadline } = {}) {
  const files = new Map();
  const calls = [];
  let cleaned = false;
  const key = `gifWorkerFixture_${crypto.randomUUID().replaceAll("-", "")}`;
  globalThis[key] = {
    deadline,
    async mkdtemp(prefix) { return `${prefix}owned-test-directory`; },
    async writeFile(file, bytes) { files.set(file, bytes); },
    async readFile(file) { return files.get(file); },
    async unlink(file) { files.delete(file); },
    async rmdir() { assert.equal(files.size, 0); cleaned = true; },
    async run(executable, arguments_, options) {
      calls.push({ executable, arguments_, options });
      if (missing) throw Object.assign(new Error("Missing test encoder"), { code: "ENOENT" });
      if (arguments_.includes("-version")) return {};
      if (killed) throw Object.assign(new Error("Killed at deadline"), { killed: true });
      files.set(arguments_.at(-1), Buffer.from("GIF89a-test-encoded-output"));
      return {};
    },
  };
  let source = await readFile(new URL("../src/lib/gif-generation.ts", import.meta.url), "utf8");
  source = source
    .replace('import { execFile } from "node:child_process";', "")
    .replace('import { promisify } from "node:util";', "")
    .replace('import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";', `const { mkdtemp, writeFile, readFile, unlink, rmdir } = globalThis["${key}"];`)
    .replace('import { tmpdir } from "node:os";', "const tmpdir = () => process.cwd();")
    .replace('import { getWorkerDeadline } from "./worker-network";', `const getWorkerDeadline = () => globalThis["${key}"].deadline;`)
    .replace('import { resolveFfmpegPath } from "./ffmpeg-path";', 'const resolveFfmpegPath = () => "mock-bundled-ffmpeg";')
    .replace("const run = promisify(execFile);", `const run = globalThis["${key}"].run;`);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return { module: loaded, calls, files, cleaned: () => cleaned, dispose: () => { delete globalThis[key]; } };
}

test("configured GIF encoder completes inside the remaining deadline and cleans owned files", async () => {
  const subject = await fixture();
  try {
    await subject.module.verifyGifEncoder({ deadline: Date.now() + 1500 });
    const bytes = await subject.module.videoToGif(Buffer.from("mock-video"), { deadline: Date.now() + 4000 });
    assert.match(bytes.toString(), /^GIF89a/);
    assert.ok(subject.calls[1].options.timeout <= 4000);
    assert.equal(subject.calls[1].options.killSignal, "SIGKILL");
    assert.equal(subject.files.size, 0);
    assert.equal(subject.cleaned(), true);
  } finally { subject.dispose(); }
});

test("FFmpeg timeout is recoverable and still removes every owned intermediate", async () => {
  const subject = await fixture({ killed: true });
  try {
    await assert.rejects(subject.module.videoToGif(Buffer.from("mock-video"), { deadline: Date.now() + 2000 }), error => error.name === "TimeoutError");
    assert.equal(subject.files.size, 0);
    assert.equal(subject.cleaned(), true);
  } finally { subject.dispose(); }
});

test("unavailable encoder rejects explicitly before conversion", async () => {
  const subject = await fixture({ missing: true });
  try {
    await assert.rejects(subject.module.verifyGifEncoder(), /executable FFmpeg binary/);
    assert.equal(subject.files.size, 0);
  } finally { subject.dispose(); }
});

test("social image conversion inherits the worker deadline without a separate timer", async () => {
  const subject = await fixture({ deadline: Date.now() + 1500 });
  try {
    await subject.module.imageToJpeg(Buffer.from("mock-image"));
    assert.ok(subject.calls[0].options.timeout <= 1500);
    assert.equal(subject.cleaned(), true);
  } finally { subject.dispose(); }
});

async function resolverFixture(environment, bundledPath, exists = true) {
  const key = `ffmpegResolverFixture_${crypto.randomUUID().replaceAll("-", "")}`;
  const calls = [];
  globalThis[key] = {
    environment,
    loadPackage(name) {
      calls.push(name);
      if (bundledPath === undefined) throw new Error("Missing test package");
      return bundledPath;
    },
    existsSync() { return exists; },
  };
  let source = await readFile(new URL("../src/lib/ffmpeg-path.ts", import.meta.url), "utf8");
  source = source
    .replace('import { createRequire } from "node:module";', `const createRequire = () => globalThis["${key}"].loadPackage;`)
    .replace('import { existsSync } from "node:fs";', `const existsSync = globalThis["${key}"].existsSync;`)
    .replaceAll("process.env", `globalThis["${key}"].environment`);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return { resolve: loaded.resolveFfmpegPath, calls, dispose: () => { delete globalThis[key]; } };
}

test("configured FFmpeg path takes precedence over the bundled binary", async () => {
  const subject = await resolverFixture({ NODE_ENV: "production", FFMPEG_PATH: " C:\\runtime\\ffmpeg.exe " }, "bundled-ffmpeg");
  try {
    assert.equal(subject.resolve(), "C:\\runtime\\ffmpeg.exe");
    assert.equal(subject.calls.length, 0);
  } finally { subject.dispose(); }
});

test("production uses the installed platform-specific bundled FFmpeg binary", async () => {
  const subject = await resolverFixture({ NODE_ENV: "production" }, "bundled-platform-ffmpeg");
  try {
    assert.equal(subject.resolve(), "bundled-platform-ffmpeg");
    assert.deepEqual(subject.calls, ["ffmpeg-static"]);
  } finally { subject.dispose(); }
});

test("missing production or Amplify binary never silently falls back to a host installation", async () => {
  for (const [environment, bundledPath, exists] of [
    [{ NODE_ENV: "production" }, undefined, false],
    [{ NODE_ENV: "development", AWS_APP_ID: "test-amplify-app" }, "missing-binary", false],
    [{ NODE_ENV: "production" }, null, false],
  ]) {
    const subject = await resolverFixture(environment, bundledPath, exists);
    try { assert.throws(subject.resolve, /bundled FFmpeg binary is unavailable/); }
    finally { subject.dispose(); }
  }
});

test("local development retains PATH fallback only when no bundle is available", async () => {
  const subject = await resolverFixture({ NODE_ENV: "development" }, undefined);
  try { assert.equal(subject.resolve(), "ffmpeg"); }
  finally { subject.dispose(); }
});
