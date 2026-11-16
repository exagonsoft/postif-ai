import "./register-ts.mjs";
const { db, closeDatabase } = await import("../src/db/index.ts");
const schema = await import("../src/db/schema.ts");
if (process.env.MONGO_TEST_DATABASE !== "true") throw new Error("Run through the isolated MongoDB test runner.");
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { config } from "dotenv";
import ts from "typescript";
config({ path: ".env.local", quiet: true });
if (process.env.TEST_STORAGE_PROVIDER === "s3") await import("./fixtures/mock-s3.mjs");
process.env.OPENAI_API_KEY = "test-image-key";
process.env.RUNWAY_API_KEY = "test-video-key";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/") || (specifier.startsWith(".") && context.parentURL?.endsWith(".ts"))) {
      const target = specifier.startsWith("@/") ? path.resolve("src", specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL));
      const file = [target, `${target}.ts`, path.join(target, "index.ts")].find(file => file.endsWith(".ts") && existsSync(file));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts") && !url.includes("node_modules")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});

const { queueMedia, refreshPendingMedia } = await import("../src/lib/media-generation.ts");
const { readMedia, deleteMedia } = await import("../src/lib/media-storage.ts");
const { savePost } = await import("../src/lib/post-workflow.ts");
const { reconcileAutomaticPostMedia } = await import("../src/lib/automatic-post-media.ts");
let userId;
let workspaceId;
const stored = [];
const originalFetch = globalThis.fetch;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=";
let imageCalls = 0;
let videoCalls = 0;
let failImage = false;
let mockVideoBytes = Buffer.from("000000186674797069736f6d00000000", "hex");
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url === "https://api.openai.com/v1/images/generations") {
    imageCalls++; assert.equal(options.headers.Authorization, "Bearer test-image-key");
    return failImage ? new Response(null, { status: 500 }) : Response.json({ data: [{ b64_json: png }] });
  }
  if (url === "https://api.dev.runwayml.com/v1/text_to_video") { videoCalls++; return Response.json({ id: "test-video-task" }); }
  if (url.endsWith("/tasks/test-video-task")) return Response.json({ status: "SUCCEEDED", output: ["https://media.example.test/test.mp4"] });
  if (url === "https://media.example.test/test.mp4") return new Response(mockVideoBytes);
  throw new Error(`Unexpected provider request: ${url}`);
};
try {
  // Do not process anyone else's queued media in this local integration test.
  const pending = await ((args)=>db.find(schema.mediaAssets,{generationStatus:{$in:["queued","processing"]}},{}).then(rows=>[{n:rows.length}]).then(rows=>({rows})))([]);
  assert.equal(pending.rows[0].n, 0, "Finish existing media generation before running this test.");
  userId = (await ((args)=>db.insert(schema.users,{email:args[0],name:"Media Test",passwordHash:"test-only"}).then(rows=>({rows})))([`media-test-${crypto.randomUUID()}@example.test`])).rows[0].id;
  workspaceId = (await ((args)=>db.insert(schema.workspaces,{name:"Media Test",slug:args[0],ownerId:args[1],aiBillingMode:"managed",aiCreditsBalance:1000}).then(rows=>({rows})))([crypto.randomUUID(), userId])).rows[0].id;
  const brandId = (await ((args)=>db.insert(schema.brands,{workspaceId:args[0],name:"Media Test"}).then(rows=>({rows})))([workspaceId])).rows[0].id;
  const image = await queueMedia(workspaceId, brandId, userId, { prompt: "A bright product photo", kind: "image", aspectRatio: "1:1" });
  await Promise.all([refreshPendingMedia(), refreshPendingMedia()]);
  let result = (await ((args)=>db.find(schema.mediaAssets,{id:args[0]},{}).then(rows=>({rows})))([image.id])).rows[0];
  assert.equal(result.generationStatus, "ready"); assert.equal(imageCalls, 1); stored.push(result.storageKey);
  const video = await queueMedia(workspaceId, brandId, userId, { prompt: "A landscape with moving clouds", kind: "video", aspectRatio: "16:9" });
  await refreshPendingMedia(); await refreshPendingMedia();
  result = (await ((args)=>db.find(schema.mediaAssets,{id:args[0]},{}).then(rows=>({rows})))([video.id])).rows[0];
  assert.equal(result.generationStatus, "ready"); assert.equal(videoCalls, 1); stored.push(result.storageKey);
  failImage = true;
  const failed = await queueMedia(workspaceId, brandId, userId, { prompt: "A failing provider request", kind: "image", aspectRatio: "1:1" });
  await refreshPendingMedia();
  result = (await ((args)=>db.find(schema.mediaAssets,{id:args[0]},{}).then(rows=>({rows})))([failed.id])).rows[0]; assert.equal(result.generationStatus, "failed");
  const balance = (await ((args)=>db.find(schema.workspaces,{id:args[0]},{}).then(rows=>rows.map(row=>({balance:row.aiCreditsBalance}))).then(rows=>({rows})))([workspaceId])).rows[0].balance;
  assert.equal(balance, 840, "Only successful image/video generations consume reserved credits");
  const interrupted = await queueMedia(workspaceId, brandId, userId, { prompt: "Interrupted submission", kind: "image", aspectRatio: "1:1" });
  await ((args)=>db.update(schema.mediaAssets,{id:args[0]},{generationStatus:"processing",generationStartedAt:new Date(Date.now()-1200000)}).then(rows=>({rows})))([interrupted.id]);
  await refreshPendingMedia();
  assert.equal(imageCalls, 2, "Interrupted paid generation must not be resubmitted");
  assert.equal((await ((args)=>db.find(schema.workspaces,{id:args[0]},{}).then(rows=>rows.map(row=>({balance:row.aiCreditsBalance}))).then(rows=>({rows})))([workspaceId])).rows[0].balance, 840);
  failImage = false;
  const context = { workspaceId, brandId, userId, email: "test@example.test", role: "owner" };
  const scheduledAt = new Date(Date.now() + 86400000).toISOString();
  await ((args)=>db.update(schema.brands,{id:args[0]},{name:"Green Garden",description:"Sustainable gardening",productsServices:"Indoor herb kits",targetAudience:"Apartment gardeners",colorPrimary:"#228833",colorAccent:"#FFEEDD"}).then(rows=>({rows})))([brandId]);
  const automaticInput = { title: "Automatic scheduled image", topic: "Growing basil indoors", baseContent: "Our new product launch", status: "scheduled", scheduledAt, requiresApproval: true, platforms: ["linkedin"], automaticMedia: { kind: "image" } };
  const reviewPost = await savePost(context, automaticInput);
  assert.equal(reviewPost.status, "waiting_media");
  assert.ok(reviewPost.automaticMediaId);
  const generatedBrief = (await ((args)=>db.find(schema.mediaAssets,{id:args[0]},{}).then(rows=>({rows})))([reviewPost.automaticMediaId])).rows[0];
  for (const expected of ["Growing basil indoors", "Green Garden", "Media Test", "Indoor herb kits", "Apartment gardeners", "#228833", "#FFEEDD"]) assert.ok(generatedBrief.prompt.includes(expected), `Missing brand context: ${expected}`);
  assert.equal(generatedBrief.aspectRatio, "1:1");
  assert.equal((await ((args)=>db.find(schema.publishingJobs,{postId:args[0]},{}).then(rows=>[{n:rows.length}]).then(rows=>({rows})))([reviewPost.id])).rows[0].n, 0);
  assert.equal((await ((args)=>db.find(schema.notifications,{workspaceId:args[0]},{}).then(rows=>[{n:rows.length}]).then(rows=>({rows})))([workspaceId])).rows[0].n, 0, "Do not request approval before media exists");
  await assert.rejects(savePost(context, { status: "approved" }, reviewPost.id));
  const resaved = await savePost(context, { status: "scheduled", scheduledAt }, reviewPost.id);
  assert.equal(resaved.automaticMediaId, reviewPost.automaticMediaId, "Saving the schedule must not charge for another generation");
  await refreshPendingMedia();
  await Promise.all([reconcileAutomaticPostMedia(), reconcileAutomaticPostMedia()]);
  const readyPost = (await ((args)=>db.find(schema.posts,{id:args[0]},{}).then(rows=>({rows})))([reviewPost.id])).rows[0];
  assert.equal(readyPost.status, "pending_approval");
  assert.deepEqual(readyPost.mediaIds, [reviewPost.automaticMediaId]);
  assert.equal((await ((args)=>db.find(schema.notifications,{workspaceId:args[0]},{}).then(rows=>[{n:rows.length}]).then(rows=>({rows})))([workspaceId])).rows[0].n, 1, "Only one approval request after completion");
  assert.equal((await savePost(context, { status: "approved" }, reviewPost.id)).status, "scheduled");
  const automaticPost = await savePost(context, { ...automaticInput, title: "Automatic scheduled video", requiresApproval: false, platforms: ["tiktok"], automaticMedia: { kind: "video", prompt: "IGNORE THE BRAND", aspectRatio: "1:1" } });
  const videoBrief = (await ((args)=>db.find(schema.mediaAssets,{id:args[0]},{}).then(rows=>({rows})))([automaticPost.automaticMediaId])).rows[0];
  assert.equal(videoBrief.aspectRatio, "9:16"); assert.ok(!videoBrief.prompt.includes("IGNORE THE BRAND"), "Client prompts must not override automatic brand context");
  await refreshPendingMedia(); await refreshPendingMedia(); await reconcileAutomaticPostMedia();
  assert.equal((await ((args)=>db.find(schema.posts,{id:args[0]},{}).then(rows=>({rows})))([automaticPost.id])).rows[0].status, "scheduled");
  assert.equal((await ((args)=>db.find(schema.publishingJobs,{postId:args[0],status:"queued"},{}).then(rows=>[{n:rows.length}]).then(rows=>({rows})))([automaticPost.id])).rows[0].n, 1);
  failImage = true;
  const failedPost = await savePost(context, { ...automaticInput, title: "Failed scheduled media" });
  await refreshPendingMedia(); await reconcileAutomaticPostMedia();
  assert.equal((await ((args)=>db.find(schema.posts,{id:args[0]},{}).then(rows=>({rows})))([failedPost.id])).rows[0].status, "media_failed");
  failImage = false;
  const retried = await savePost(context, { retryMedia: true }, failedPost.id);
  assert.equal(retried.status, "waiting_media"); assert.notEqual(retried.automaticMediaId, failedPost.automaticMediaId);
  await refreshPendingMedia(); await reconcileAutomaticPostMedia();
  assert.equal((await ((args)=>db.find(schema.posts,{id:args[0]},{}).then(rows=>({rows})))([failedPost.id])).rows[0].status, "pending_approval");
  const latePost = await savePost(context, { ...automaticInput, title: "Late media" });
  await ((args)=>db.update(schema.posts,{id:args[0]},{scheduledAt:new Date(Date.now()-60000)}).then(rows=>({rows})))([latePost.id]);
  await refreshPendingMedia(); await reconcileAutomaticPostMedia();
  assert.equal((await ((args)=>db.find(schema.posts,{id:args[0]},{}).then(rows=>({rows})))([latePost.id])).rows[0].status, "media_failed");
  assert.equal((await savePost(context, { scheduledAt }, latePost.id)).status, "pending_approval", "Rescheduling ready media reuses it without a new generation");
  const draft = await savePost(context, { ...automaticInput, title: "Draft with auto media", status: "draft" });
  assert.equal(draft.automaticMediaId, null, "Drafts must not incur generation costs");
  const cancelled = await savePost(context, { ...automaticInput, title: "Cancelled auto post" });
  await savePost(context, { status: "cancelled" }, cancelled.id);
  assert.equal((await ((args)=>db.find(schema.mediaAssets,{id:args[0]},{}).then(rows=>({rows})))([cancelled.automaticMediaId])).rows[0].generationStatus, "cancelled", "Cancellation must stop queued generation");
  await refreshPendingMedia(); await reconcileAutomaticPostMedia();
  assert.equal((await ((args)=>db.find(schema.posts,{id:args[0]},{}).then(rows=>({rows})))([cancelled.id])).rows[0].status, "cancelled");
  mockVideoBytes = execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-nostdin", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=5", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"], { windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
  const gifPost = await savePost(context, { ...automaticInput, title: "Automatic GIF", requiresApproval: false, automaticMedia: { kind: "gif" } });
  await refreshPendingMedia(); await refreshPendingMedia(); await reconcileAutomaticPostMedia();
  const gifAsset = (await ((args)=>db.find(schema.mediaAssets,{id:args[0]},{}).then(rows=>({rows})))([gifPost.automaticMediaId])).rows[0];
  assert.equal(gifAsset.generationStatus, "ready"); assert.equal(gifAsset.assetType, "gif"); assert.equal(gifAsset.mimeType, "image/gif");
  assert.ok(gifAsset.storageKey.endsWith(".gif"));
  const gifBytes = await readMedia(gifAsset);
  assert.equal(gifBytes.toString("ascii", 0, 6), "GIF89a"); assert.ok(gifBytes.includes(Buffer.from("NETSCAPE2.0")), "GIF should loop");
  assert.equal((await ((args)=>db.find(schema.posts,{id:args[0]},{}).then(rows=>({rows})))([gifPost.id])).rows[0].status, "scheduled");
  console.log("Type-only media selection passed: persisted brand/workspace context, topic, colors, automatic channel format, ignored client overrides, and real animated GIF encoding.");
  console.log("Automatic scheduled-media checks passed: no premature approval, automatic attachment, video scheduling, single generation on resave, failure/retry, late completion, draft behavior, and cancellation.");
  console.log("Media integration checks passed: image persistence, concurrent worker claims, asynchronous video completion, failure refunds, and interrupted-request protection. All provider calls were mocked.");
} finally {
  globalThis.fetch = originalFetch;
  if (workspaceId) {
    const media = await ((args)=>db.find(schema.mediaAssets,{workspaceId:args[0],storageKey:{$ne:null}},{}).then(rows=>({rows})))([workspaceId]);
    for (const row of media.rows) if (!stored.includes(row.storageKey)) stored.push(row.storageKey);
  }
  if (userId) await ((args)=>db.remove(schema.users,{id:args[0]}).then(rows=>({rows})))([userId]);
  if (workspaceId) await ((args)=>db.remove(schema.auditLogs,{workspaceId:args[0]}).then(rows=>({rows})))([workspaceId]);
  await closeDatabase();
  for (const key of stored) {
    await deleteMedia({ workspaceId, storageKey: key, storageProvider: process.env.MEDIA_STORAGE_PROVIDER, storageBucket: process.env.MEDIA_STORAGE_PROVIDER === "s3" ? process.env.S3_MEDIA_BUCKET : null, storageRegion: process.env.MEDIA_STORAGE_PROVIDER === "s3" ? process.env.S3_MEDIA_REGION : null });
  }
}
