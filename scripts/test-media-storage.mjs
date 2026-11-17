import "./register-ts.mjs";
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, writeFile, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.MEDIA_STORAGE_UNIT_TEST = "true";
const { objects, calls, failS3 } = await import("./fixtures/mock-s3.mjs");
const { storeMedia, readMedia, deleteMedia, mediaDownloadUrl, checkMediaStorageCredentials, MAX_MEDIA_BYTES } = await import("../src/lib/media-storage.ts");
const { getMediaStorageConfig, getS3Credentials } = await import("../src/lib/media-storage-config.ts");
const { validateRuntimeConfig } = await import("../src/lib/runtime-config.ts");
const png = Buffer.from("89504e470d0a1a0a0000000000000000", "hex");
const directory = await mkdtemp(path.join(tmpdir(), "postif-storage-unit-"));
let stored;
test("S3 custom credential names are paired, support session tokens, and preserve the SDK default chain", () => {
  assert.equal(getS3Credentials({}), undefined);
  assert.deepEqual(getS3Credentials({ POSTIF_S3_ACCESS_KEY_ID: "test-key", POSTIF_S3_SECRET_ACCESS_KEY: "test-secret", POSTIF_S3_SESSION_TOKEN: "test-session" }),
    { accessKeyId: "test-key", secretAccessKey: "test-secret", sessionToken: "test-session" });
  for (const env of [{ POSTIF_S3_ACCESS_KEY_ID: "test-key" }, { POSTIF_S3_SECRET_ACCESS_KEY: "test-secret" }, { POSTIF_S3_SESSION_TOKEN: "test-session" }]) {
    assert.throws(() => getS3Credentials(env), /Configure both POSTIF_S3/);
  }
});
test("S3 credential readiness resolves without contacting the bucket", async () => {
  const before = calls.length;
  await checkMediaStorageCredentials(getMediaStorageConfig());
  assert.equal(calls.length, before);
});
test("S3 puts private, unique, workspace-scoped objects with validated metadata", async () => {
  stored = { workspaceId: 101, ...await storeMedia(png, 101) };
  const second = { workspaceId: 101, ...await storeMedia(png, 101) };
  assert.notEqual(stored.storageKey, second.storageKey);
  assert.match(stored.storageKey, /^media\/workspaces\/101\/[a-f0-9-]+\.png$/);
  assert.equal(stored.storageProvider, "s3");
  assert.equal(stored.byteSize, png.length);
  const put = calls.find(call => call.operation === "PutObjectCommand").input;
  assert.equal(put.ContentType, "image/png");
  assert.equal(put.ContentLength, png.length);
  assert.ok(put.ChecksumSHA256);
  assert.equal(put.IfNoneMatch, "*");
  assert.equal(put.ACL, undefined);
  assert.deepEqual(await readMedia(stored), png);
  await deleteMedia(second);
});
test("S3 rejects forged tenants, keys, buckets, unsupported bytes and oversized writes before AWS calls", async () => {
  const before = calls.length;
  for (const reference of [
    { ...stored, workspaceId: 102 }, { ...stored, storageKey: "media/workspaces/101/../secret.png" },
    { ...stored, storageKey: `${stored.storageKey}%2f..` }, { ...stored, storageBucket: "another-bucket" },
    { ...stored, storageRegion: "us-east-1" }, { ...stored, storageKey: "/absolute.png" },
  ]) {
    await assert.rejects(readMedia(reference));
    await assert.rejects(deleteMedia(reference));
    await assert.rejects(mediaDownloadUrl(reference));
  }
  await assert.rejects(storeMedia(Buffer.from("<script>not a media file</script>"), 101), /Supported files/);
  await assert.rejects(storeMedia(Buffer.alloc(MAX_MEDIA_BYTES + 1), 101), /50 MB/);
  assert.equal(calls.length, before);
});
test("S3 downloads are GET-only, short-lived, and failures are sanitized without local fallback", async () => {
  const url = new URL(await mediaDownloadUrl(stored));
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  const signed = calls.find(call => call.operation === "SignDownload");
  assert.equal(signed.input.ResponseContentType, "image/png");
  failS3("GetObjectCommand");
  try { await assert.rejects(readMedia(stored), error => error.status === 503 && !error.message.includes("Sensitive AWS")); }
  finally { failS3(undefined); }
  await deleteMedia(stored);
  await deleteMedia(stored);
  await assert.rejects(readMedia(stored), error => error.status === 404);
  assert.equal(objects.size, 0);
});
test("local scoped storage and existing flat local references remain compatible", async () => {
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  process.env.MEDIA_STORAGE_DIR = directory;
  const local = { workspaceId: 101, ...await storeMedia(png, 101) };
  assert.deepEqual(await readMedia(local), png);
  assert.equal(await mediaDownloadUrl(local), null);
  await assert.rejects(readMedia({ ...local, workspaceId: 102 }), /Invalid media/);
  await deleteMedia(local);
  const legacy = { workspaceId: 101, storageKey: "01234567-0123-4567-89ab-0123456789ab.png" };
  await writeFile(path.join(directory, legacy.storageKey), png);
  assert.deepEqual(await readMedia(legacy), png);
  await deleteMedia(legacy);
  process.env.MEDIA_STORAGE_PROVIDER = "s3";
  delete process.env.MEDIA_STORAGE_DIR;
  await assert.rejects(readMedia(legacy), /legacy local asset/);
});
test("S3 production validation requires no permanent directory but preserves unrelated validation", () => {
  const env = { NODE_ENV: "production", MONGODB_URI: "mongodb://127.0.0.1:27017", MONGODB_DB: "isolated", APP_URL: "https://app.example.test", ENCRYPTION_SECRET: "isolated-encryption-secret-long-enough", WORKER_SECRET: "isolated-worker-secret-long-enough", MEDIA_STORAGE_PROVIDER: "s3", S3_MEDIA_REGION: "sa-east-1", S3_MEDIA_BUCKET: "postif-isolated-media-test", S3_MEDIA_PREFIX: "media/" };
  validateRuntimeConfig(env);
  for (const overrides of [{ S3_MEDIA_REGION: "" }, { S3_MEDIA_BUCKET: "Invalid_Bucket" }, { S3_MEDIA_PREFIX: "../media/" }, { S3_MEDIA_PREFIX: "" }, { MEDIA_STORAGE_PROVIDER: "unknown" }, { WORKER_SECRET: "" }, { ENCRYPTION_SECRET: env.WORKER_SECRET }, { SMTP_URL: "smtp://localhost" }]) assert.throws(() => validateRuntimeConfig({ ...env, ...overrides }));
  assert.throws(() => getMediaStorageConfig({ NODE_ENV: "production", MEDIA_STORAGE_PROVIDER: "local" }), /MEDIA_STORAGE_DIR/);
});
after(async () => {
  await rmdir(path.join(directory, "workspaces", "101"));
  await rmdir(path.join(directory, "workspaces"));
  await rmdir(directory);
});
