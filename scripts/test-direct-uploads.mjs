import "./register-ts.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { registerHooks } from "node:module";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";

// All credentials, S3 commands and DB operations in this standalone suite are isolated mocks.
Object.assign(process.env, {
  MEDIA_STORAGE_PROVIDER: "s3", S3_MEDIA_REGION: "sa-east-1",
  S3_MEDIA_BUCKET: "postif-isolated-media-test", S3_MEDIA_PREFIX: "media/",
  AWS_ACCESS_KEY_ID: "isolated-test-key", AWS_SECRET_ACCESS_KEY: "isolated-test-secret",
  AWS_EC2_METADATA_DISABLED: "true",
});
globalThis.fetch = async () => { throw new Error("Live network is forbidden in direct-upload tests"); };
let allowed = true;
let deniedOnTransaction = false;
let entitlementCalls = [];
globalThis.directUploadEntitlement = async (workspaceId, brandId, tx) => {
  entitlementCalls.push({ workspaceId, brandId, tx: !!tx });
  if (!allowed || (deniedOnTransaction && tx)) throw Object.assign(new Error("Brand denied"), { status: 403 });
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/entitlements") return {
      url: "data:text/javascript,export const assertBrandEntitlement=(...args)=>globalThis.directUploadEntitlement(...args);",
      shortCircuit: true,
    };
    return next(specifier, context);
  },
});
const { db } = await import("../src/db/index.ts");
const storage = await import("../src/lib/media-storage.ts");
const service = await import("../src/lib/media-upload-intents.ts");
const { mediaUploadIntents } = await import("../src/db/media-upload-schema.ts");
const { mediaAssets } = await import("../src/db/schema.ts");
const context = { workspace: { id: 1 }, activeBrand: { id: 10 }, memberRole: "editor" };
const png = Buffer.from("89504e470d0a1a0a0000000000000000", "hex");
let tables, objects, calls, leases, sequence, failOperation, replayOnGet, failAssetInsert, deleteErrors, unversioned, stalledOperation, inTransaction;
function rows(model) { return tables.get(model.name) || (tables.set(model.name, []), tables.get(model.name)); }
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
      if (op === "$gte") return row[key] >= expected;
      if (op === "$gt") return row[key] > expected;
      if (op === "$lte") return row[key] <= expected;
      throw new Error(`Unsupported test operator: ${op}`);
    });
    return row[key] === value;
  });
}
function upload(intent, bytes = png, mimeType = intent.mimeType) {
  const version = { id: randomUUID(), bytes: Buffer.from(bytes), mimeType, etag: `"${randomUUID()}"` };
  const versions = objects.get(intent.quarantineKey) || [];
  objects.set(intent.quarantineKey, [version, ...versions]);
  return version;
}
function missing() { return Object.assign(new Error("Missing isolated object"), { name: "NoSuchKey" }); }
S3Client.prototype.send = async function (command, options) {
  const input = command.input, operation = command.constructor.name;
  calls.push({ operation, input, signal: options?.abortSignal });
  assert.ok(options?.abortSignal, "Every S3 command must have a deadline signal");
  assert.equal(input.Bucket, process.env.S3_MEDIA_BUCKET);
  assert.equal(input.ACL, undefined);
  assert.equal(inTransaction, false, "Retryable database transactions must never contain S3 calls");
  if (operation === stalledOperation) return new Promise((_, reject) => {
    const abort = () => reject(Object.assign(new Error("Isolated aborted network"), { name: "AbortError" }));
    if (options.abortSignal.aborted) abort();
    else options.abortSignal.addEventListener("abort", abort, { once: true });
  });
  if (operation === failOperation) throw Object.assign(new Error("sensitive provider diagnostic"), { name: "AccessDenied" });
  if (operation === "HeadObjectCommand" || operation === "GetObjectCommand") {
    if (operation === "GetObjectCommand" && replayOnGet) {
      replayOnGet();
      replayOnGet = undefined;
    }
    const versions = objects.get(input.Key) || [];
    const version = input.VersionId ? versions.find(item => item.id === input.VersionId) : versions[0];
    if (!version) throw missing();
    if (operation === "HeadObjectCommand") return { ContentLength: version.bytes.length, ContentType: version.mimeType, VersionId: unversioned ? "null" : version.id, ETag: version.etag };
    assert.equal(input.Range, "bytes=0-4095");
    const bytes = version.bytes.subarray(0, 4096);
    return { Body: { transformToWebStream: () => Readable.toWeb(Readable.from([bytes])) } };
  }
  if (operation === "CopyObjectCommand") {
    const [source, query] = input.CopySource.split("?");
    const key = decodeURIComponent(source.slice(source.indexOf("/") + 1));
    const version = objects.get(key)?.find(item => item.id === new URLSearchParams(query).get("versionId"));
    if (!version) throw missing();
    assert.equal(input.CopySourceIfMatch, version.etag);
    assert.equal(input.CacheControl, "private, no-store");
    objects.set(input.Key, [{ ...version, id: randomUUID() }, ...objects.get(input.Key) || []]);
    return {};
  }
  if (operation === "ListObjectVersionsCommand") {
    assert.equal(input.MaxKeys, 100);
    const versions = [...objects.entries()].filter(([key]) => key.startsWith(input.Prefix))
      .flatMap(([Key, items]) => items.map(item => ({ Key, VersionId: item.id })));
    return { Versions: versions.slice(0, 100), IsTruncated: versions.length > 100 };
  }
  if (operation === "DeleteObjectsCommand") {
    if (deleteErrors) return { Errors: [{ Code: "AccessDenied" }] };
    for (const object of input.Delete.Objects) {
      objects.set(object.Key, (objects.get(object.Key) || []).filter(item => item.id !== object.VersionId));
    }
    return {};
  }
  throw new Error(`Unexpected S3 command: ${operation}`);
};
beforeEach(() => {
  tables = new Map(); objects = new Map(); calls = []; leases = new Set(); sequence = 0;
  allowed = true; deniedOnTransaction = false; entitlementCalls = []; failOperation = undefined;
  replayOnGet = undefined; failAssetInsert = false; deleteErrors = false;
  unversioned = false; stalledOperation = undefined; inTransaction = false;
  process.env.MEDIA_STORAGE_PROVIDER = "s3";
  Object.assign(db, {
    async find(model, filter = {}, options = {}) {
      let found = rows(model).filter(row => matches(row, filter));
      if (options.sort) found = found.sort((a, b) => +a.nextCleanupAt - +b.nextCleanupAt);
      return structuredClone(found.slice(0, options.limit || found.length));
    },
    async insert(model, values) {
      if (model === mediaAssets && failAssetInsert) throw new Error("Isolated DB insert failure");
      const row = { ...model.defaults(), id: ++sequence, ...values };
      rows(model).push(row);
      return [structuredClone(row)];
    },
    async update(model, filter, changes) {
      return rows(model).filter(row => matches(row, filter)).map(row => {
        Object.assign(row, changes); return structuredClone(row);
      });
    },
    async transaction(callback) {
      const snapshot = structuredClone(tables);
      inTransaction = true;
      try { return await callback(db); } catch (error) { tables = snapshot; throw error; }
      finally { inTransaction = false; }
    },
    async withLease(name, callback, busy) {
      if (leases.has(name)) return busy;
      leases.add(name);
      try { return await callback(); } finally { leases.delete(name); }
    },
  });
});
async function intent() {
  const created = await service.createMediaUploadIntent(context, { filename: "image.png", mimeType: "image/png", byteSize: png.length });
  return { created, intent: rows(mediaUploadIntents).at(-1) };
}
function expire(row) { row.expiresAt = new Date(Date.now() - 1000); row.nextCleanupAt = new Date(0); }
async function sweep() { return service.cleanupExpiredMediaUploads({ deadline: Date.now() + 5000, limit: 3 }); }

test("authenticated capability and intent/completion enforce writer, tenant, effective brand", async () => {
  assert.equal((await service.getMediaUploadCapability({ ...context, memberRole: "approver" })).direct, true);
  for (const ctx of [null, { ...context, memberRole: "viewer" }, { ...context, activeBrand: null }]) {
    await assert.rejects(service.getMediaUploadCapability(ctx), error => error.status === 403);
    await assert.rejects(service.createMediaUploadIntent(ctx, {}), error => error.status === 403);
    await assert.rejects(service.completeMediaUploadIntent(ctx, randomUUID()), error => error.status === 403);
  }
  const { intent: row } = await intent(); upload(row);
  await assert.rejects(service.completeMediaUploadIntent({ ...context, workspace: { id: 2 } }, row.id), error => error.status === 404);
  await assert.rejects(service.completeMediaUploadIntent({ ...context, activeBrand: { id: 11 } }, row.id), error => error.status === 404);
  allowed = false;
  await assert.rejects(service.createMediaUploadIntent(context, {}), /Brand denied/);
  await assert.rejects(service.completeMediaUploadIntent(context, row.id), /Brand denied/);
  assert.equal(calls.length, 0);
});
test("POST policy pins private workspace key, MIME, exact bounded size and five-minute expiry", async () => {
  const { created, intent: row } = await intent();
  const policy = JSON.parse(Buffer.from(created.post.fields.Policy, "base64").toString());
  assert.ok(Date.parse(policy.expiration) <= Date.now() + 300000);
  assert.deepEqual(policy.conditions.find(item => item[0] === "content-length-range"), ["content-length-range", png.length, png.length]);
  assert.ok(policy.conditions.some(item => item[0] === "eq" && item[1] === "$Content-Type" && item[2] === "image/png"));
  assert.equal(created.post.fields.key, row.quarantineKey);
  assert.match(row.quarantineKey, /^media\/workspaces\/1\/quarantine\/[a-f0-9-]+\.png$/);
  assert.notEqual(row.storageKey, row.quarantineKey);
  assert.equal(created.post.fields.acl, undefined);
  assert.equal((await service.getMediaUploadCapability(context)).direct, true);
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  assert.equal((await service.getMediaUploadCapability(context)).direct, false);
  await assert.rejects(service.createMediaUploadIntent(context, { filename: "a.png", mimeType: "image/png", byteSize: 16 }), error => error.status === 409);
});
test("invalid filenames, MIME and byte limits rejected before signing or persistence", async () => {
  for (const invalid of [
    { filename: "../a.png" }, { filename: "a\\b.png" }, { filename: "" }, { filename: "a\n.png" },
    { filename: "a".repeat(301) }, { mimeType: "image/svg+xml" }, { mimeType: "text/html" },
    { byteSize: storage.MAX_MEDIA_BYTES + 1 }, { byteSize: 0 }, { byteSize: 12.5 }, { byteSize: "16" },
  ]) await assert.rejects(service.createMediaUploadIntent(context, { filename: "a.png", mimeType: "image/png", byteSize: 16, ...invalid }));
  assert.equal(rows(mediaUploadIntents).length, 0);
});
test("durable workspace caps serialize concurrent creation and retain rate history", async () => {
  await Promise.allSettled(Array.from({ length: 10 }, () => intent()));
  assert.equal(rows(mediaUploadIntents).length, 1, "concurrent workspace requests contend on a durable lease");
  for (let i = 0; i < 4; i++) await intent();
  await assert.rejects(intent(), error => error.status === 429);
  for (const row of rows(mediaUploadIntents)) expire(row);
  for (let i = 0; i < 15; i++) {
    const { intent: row } = await intent(); expire(row);
  }
  await assert.rejects(intent(), error => error.status === 429);
});
test("actual size, actual magic, and actual content type must match before an asset exists", async () => {
  for (const [bytes, mime] of [[Buffer.alloc(16), "image/png"], [Buffer.alloc(17), "image/png"], [png, "text/html"]]) {
    const { intent: row } = await intent(); upload(row, bytes, mime);
    await assert.rejects(service.completeMediaUploadIntent(context, row.id), error => error.status === 400);
    assert.equal(rows(mediaAssets).length, 0);
    assert.equal(rows(mediaUploadIntents).at(-1).status, "rejected");
  }
});
test("unversioned buckets fail closed without persisting an asset", async () => {
  const { intent: row } = await intent(); upload(row); unversioned = true;
  await assert.rejects(service.completeMediaUploadIntent(context, row.id), error => error.status === 503 && /versioning/.test(error.message));
  assert.equal(rows(mediaAssets).length, 0);
  assert.equal(calls.some(call => call.operation === "CopyObjectCommand"), false);
});
test("version-pinned inspection and ETag copy defeat presigned replay and completion is idempotent", async () => {
  const { intent: row } = await intent();
  const original = upload(row);
  replayOnGet = () => upload(row, Buffer.alloc(16), "image/png");
  const asset = await service.completeMediaUploadIntent(context, row.id);
  assert.equal(asset.url, `/api/media/${asset.id}/content`);
  assert.deepEqual(objects.get(row.storageKey)[0].bytes, png);
  assert.equal(rows(mediaUploadIntents)[0].sourceVersion, original.id);
  upload(row, Buffer.alloc(16));
  assert.deepEqual(await service.completeMediaUploadIntent(context, row.id), asset);
  assert.equal(rows(mediaAssets).length, 1);
  assert.equal(calls.filter(call => call.operation === "CopyObjectCommand").length, 1);
  assert.ok(entitlementCalls.some(call => call.tx), "entitlement is rechecked in DB-only transaction");
});
test("concurrent completions cannot create duplicate assets", async () => {
  const { intent: row } = await intent(); upload(row);
  const results = await Promise.allSettled([service.completeMediaUploadIntent(context, row.id), service.completeMediaUploadIntent(context, row.id)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
  await service.completeMediaUploadIntent(context, row.id);
  assert.equal(rows(mediaAssets).length, 1);
});
test("DB failure after copy is recoverable, source stays pinned, and expired orphan copies are removed", async () => {
  const { intent: row } = await intent(); upload(row); failAssetInsert = true;
  await assert.rejects(service.completeMediaUploadIntent(context, row.id), /DB insert failure/);
  assert.ok(objects.get(row.storageKey)?.length);
  assert.equal(rows(mediaUploadIntents)[0].status, "pending");
  upload(row, Buffer.alloc(16)); failAssetInsert = false;
  await service.completeMediaUploadIntent(context, row.id);
  assert.deepEqual(objects.get(row.storageKey)[0].bytes, png);
  const second = await intent(); upload(second.intent); failAssetInsert = true;
  await assert.rejects(service.completeMediaUploadIntent(context, second.intent.id));
  expire(rows(mediaUploadIntents).find(item => item.id === second.intent.id));
  for (let i = 0; i < 3; i++) {
    rows(mediaUploadIntents).find(item => item.id === second.intent.id).nextCleanupAt = new Date(0);
    await sweep();
  }
  assert.equal(objects.get(second.intent.storageKey)?.length, 0);
  assert.equal(rows(mediaAssets).length, 1);
});
test("brand entitlement lost after bytes arrive cannot persist a finalized asset", async () => {
  const { intent: row } = await intent(); upload(row); deniedOnTransaction = true;
  await assert.rejects(service.completeMediaUploadIntent(context, row.id), /Brand denied/);
  assert.equal(rows(mediaAssets).length, 0);
  assert.equal(rows(mediaUploadIntents)[0].status, "pending");
  assert.ok(objects.get(row.storageKey).length, "failed DB commit leaves durable orphan for expiry cleanup");
});
test("expiry cleanup removes all quarantine versions, retains durable tombstone and preserves finalized media", async () => {
  const { intent: row } = await intent(); upload(row);
  const asset = await service.completeMediaUploadIntent(context, row.id);
  upload(row); upload(row); expire(rows(mediaUploadIntents)[0]);
  assert.equal((await sweep()).cleaned, 0);
  assert.equal(objects.get(row.quarantineKey).length, 0);
  rows(mediaUploadIntents)[0].nextCleanupAt = new Date(0);
  assert.equal((await sweep()).cleaned, 1);
  assert.equal(rows(mediaUploadIntents).length, 1);
  assert.equal(rows(mediaAssets)[0].id, asset.id);
  assert.ok(objects.get(row.storageKey).length);
  upload(row); rows(mediaUploadIntents)[0].nextCleanupAt = new Date(0);
  await sweep();
  assert.equal(objects.get(row.quarantineKey).length, 0, "late/replayed versions remain discoverable");
  assert.ok(objects.get(row.storageKey).length);
});
test("cancelled/rejected temporary uploads stay durable on cleanup errors; AWS errors sanitized", async () => {
  const { intent: row } = await intent(); upload(row);
  await service.cancelMediaUploadIntent(context, row.id);
  await assert.rejects(service.completeMediaUploadIntent(context, row.id), error => error.status === 410);
  expire(rows(mediaUploadIntents)[0]); deleteErrors = true;
  assert.equal((await sweep()).failed, 1);
  assert.equal(rows(mediaUploadIntents).length, 1);
  assert.equal(objects.get(row.quarantineKey).length, 1);
  assert.equal(+rows(mediaUploadIntents)[0].nextCleanupAt, 0);
  deleteErrors = false; failOperation = "ListObjectVersionsCommand";
  await assert.rejects(storage.cleanupDirectMediaUpload(row, true, Date.now() + 1000), error => error.status === 503 && !error.message.includes("sensitive"));
});
test("cleanup deadlines, bounded pages and missing configuration never produce mocked success", async () => {
  const { intent: row } = await intent(); upload(row); expire(row);
  assert.deepEqual(await service.cleanupExpiredMediaUploads({ deadline: Date.now() - 1 }), { inspected: 0, cleaned: 0, failed: 0 });
  assert.equal(calls.length, 0);
  for (let i = 0; i < 110; i++) upload(row);
  await sweep();
  assert.equal(objects.get(row.quarantineKey).length, 11);
  assert.equal(calls.filter(call => call.operation === "DeleteObjectsCommand")[0].input.Delete.Objects.length, 100);
  assert.equal(rows(mediaUploadIntents).length, 1);
  rows(mediaUploadIntents)[0].nextCleanupAt = new Date(0);
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  assert.equal((await sweep()).failed, 1);
});
test("cleanup aborts stalled AWS network at the remaining deadline", async () => {
  const { intent: row } = await intent(); upload(row);
  stalledOperation = "ListObjectVersionsCommand";
  const started = Date.now();
  // Keep the process alive while AbortSignal.timeout's unref'ed timer is pending.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(storage.cleanupDirectMediaUpload(row, true, Date.now() + 50), error => error.status === 503);
    assert.ok(Date.now() - started < 500);
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(rows(mediaUploadIntents).length, 1);
  } finally { clearTimeout(keepAlive); }
});
