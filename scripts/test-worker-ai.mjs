import "./register-ts.mjs";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { registerHooks } from "node:module";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
const { db } = await import("../src/db/index.ts");
const { encryptSecret } = await import("../src/lib/crypto.ts");
const { AIRequestError, generateMultiPlatformPosts, reconcileAIRequests } = await import("../src/lib/ai-engine.ts");
const { queueMedia, refreshPendingMedia, cancelQueuedMedia } = await import("../src/lib/media-generation.ts");
const { runRecurringPlanning } = await import("../src/lib/recurring-planner.ts");
const { runWorkerSweep } = await import("../src/lib/worker-orchestrator.ts");
const { isWorkerAuthorized } = await import("../src/lib/worker-auth.ts");
const { workerBudgetMs } = await import("../src/lib/worker-budget.ts");
const { processDuePosts } = await import("../src/lib/publishing-worker.ts");
const { deliverNotifications } = await import("../src/lib/notification-service.ts");
const { backgroundImageResult } = await import("../src/lib/openai-background-images.ts");
const { getWorkerDeadline } = await import("../src/lib/worker-network.ts");
const { getPlanDefinition } = await import("../src/lib/plans.ts");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/server") return next("next/server.js", context);
    if (context.parentURL?.includes("/src/app/api/ai/generate/route.ts")) {
      if (specifier === "@/lib/auth") return { url: `data:text/javascript,${encodeURIComponent("export async function getAuthContext(){return globalThis.aiGenerateTestAuth;}")}`, shortCircuit: true };
      if (specifier === "@/lib/entitlements") return { url: `data:text/javascript,${encodeURIComponent("export async function assertBrandEntitlement(){} export async function assertFeature(){}")}`, shortCircuit: true };
    }
    if (context.parentURL?.includes("/src/app/api/media/generate/route.ts") && specifier === "@/lib/auth")
      return { url: `data:text/javascript,${encodeURIComponent("export async function getAuthContext(){return globalThis.mediaGenerateTestAuth;}")}`, shortCircuit: true };
    return next(specifier, context);
  },
});
const { POST: generateRoute } = await import("../src/app/api/ai/generate/route.ts");
const { GET: mediaPreflightRoute } = await import("../src/app/api/media/generate/route.ts");

process.env.ENCRYPTION_SECRET = "test-encryption-secret-not-for-production";
process.env.OPENAI_API_KEY = "test-managed-key";
process.env.RUNWAY_API_KEY = "test-runway-key";
process.env.BILLING_ENABLED = "false";
process.env.PAYPAL_ENVIRONMENT = "sandbox";
process.env.PAYPAL_CLIENT_ID = "";
process.env.PAYPAL_CLIENT_SECRET = "";
process.env.PAYPAL_WEBHOOK_ID = "";
const originals = Object.fromEntries(["find", "insert", "update", "upsert", "transaction", "withLease"].map(key => [key, db[key]]));
const originalFetch = globalThis.fetch;
afterEach(() => {
  for (const [key, value] of Object.entries(originals)) db[key] = value;
  globalThis.fetch = originalFetch;
});

function fakeDatabase() {
  let tables = new Map();
  let nextId = 100;
  const rows = name => tables.get(name) || (tables.set(name, []), tables.get(name));
  const same = (left, right) => left instanceof Date && right instanceof Date ? +left === +right : left === right;
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === "$or") return value.some(item => matches(row, item));
      if (key === "$and") return value.every(item => matches(row, item));
      const actual = row[key];
      if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
        return Object.entries(value).every(([operator, expected]) => {
          if (operator === "$in") return expected.some(item => same(actual, item));
          if (operator === "$ne") return !same(actual, expected);
          if (operator === "$lte") return actual != null && actual <= expected;
          if (operator === "$lt") return actual != null && actual < expected;
          if (operator === "$gte") return actual != null && actual >= expected;
          if (operator === "$type") return typeof actual === expected;
          throw new Error(`Unsupported test operator ${operator}`);
        });
      }
      return same(actual, value);
    });
  }
  const repo = {
    async find(model, filter = {}, options = {}) {
      const result = rows(model.name).filter(row => matches(row, filter));
      if (options.sort) result.sort((a, b) => {
        for (const [field, direction] of Object.entries(options.sort)) {
          if (a[field] < b[field]) return -direction;
          if (a[field] > b[field]) return direction;
        }
        return 0;
      });
      return structuredClone(options.limit ? result.slice(0, options.limit) : result);
    },
    async insert(model, values) {
      const result = [];
      for (const value of Array.isArray(values) ? values : [values]) {
        const row = { ...model.defaults(), id: ++nextId, ...value };
        for (const key of model.unique) if (row[key] !== undefined && rows(model.name).some(item => same(item[key], row[key]))) throw new Error("Duplicate unique key");
        rows(model.name).push(row);
        result.push(structuredClone(row));
      }
      return result;
    },
    async update(model, filter, changes) {
      const result = [];
      for (const row of rows(model.name).filter(row => matches(row, filter))) {
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined) continue;
          row[key] = value?.constructor?.name === "Increment" ? row[key] + value.delta : structuredClone(value);
        }
        result.push(structuredClone(row));
      }
      return result;
    },
    async upsert(model, key, initial, changes) {
      const [existing] = await repo.find(model, { [key]: initial[key] });
      return existing ? repo.update(model, { id: existing.id }, changes) : repo.insert(model, { ...initial, ...changes });
    },
    async transaction(callback) {
      const snapshot = structuredClone(tables);
      try { return await callback(repo); } catch (error) { tables = snapshot; throw error; }
    },
    async withLease(_name, callback) { return callback(); },
  };
  Object.assign(db, repo);
  rows("workspaces").push({ id: 1, ownerId: 7, aiBillingMode: "managed", aiCreditsBalance: 1000, postsPublishedThisMonth: 0 });
  rows("paypal_subscriptions").push({ id: 1, workspaceId: 1, environment: "sandbox", planSlug: "pro_ai", planSnapshot: getPlanDefinition("pro_ai"), creditEpoch: "initial", paidThrough: new Date(Date.now() + 86400000 * 30) });
  rows("brands").push({ id: 3, workspaceId: 1, name: "Test Brand", description: "Only supplied facts", targetAudience: "Readers", tone: "Professional", contentPillars: ["Education"] });
  return { repo, rows };
}
const input = { workspaceId: 1, userId: 7, brandName: "Test Brand", topic: "Useful topic", prompt: "Write clearly", objective: "Educate", audience: "Readers", platforms: ["linkedin"], tone: "Professional", language: "English", contentType: "Educational Post", length: "medium", keywords: [], cta: "", requestKey: "deliberate-action-1" };

test("media preflight identifies unexpected failures without exposing their details", async () => {
  const { repo } = fakeDatabase();
  const env = { node: process.env.NODE_ENV, storage: process.env.MEDIA_STORAGE_PROVIDER, dir: process.env.MEDIA_STORAGE_DIR };
  const info = console.info, error = console.error, events = [];
  globalThis.mediaGenerateTestAuth = { workspace: { id: 1 }, activeBrand: { id: 3 }, memberRole: "owner" };
  process.env.NODE_ENV = "development";
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  delete process.env.MEDIA_STORAGE_DIR;
  console.info = (...args) => events.push(args);
  console.error = (...args) => events.push(args);
  db.find = async (model, ...args) => {
    if (model.name === "workspaces") throw new Error("sensitive database detail");
    return repo.find(model, ...args);
  };
  try {
    const response = await mediaPreflightRoute(new Request("http://localhost/api/media/generate?kind=image&brandId=3"));
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.ok(events.some(([label, event]) => label === "[Media diagnostic]" && event?.stage === "gate" && event.step === "workspace" && event.category === "unexpected"));
    assert.doesNotMatch(JSON.stringify(events) + body, /sensitive database detail/);
  } finally {
    console.info = info; console.error = error;
    for (const [key, value] of Object.entries({ NODE_ENV: env.node, MEDIA_STORAGE_PROVIDER: env.storage, MEDIA_STORAGE_DIR: env.dir })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    delete globalThis.mediaGenerateTestAuth;
  }
});

test("media preflight reports an invalid credit balance without starting generation", async () => {
  const { rows } = fakeDatabase();
  const storage = process.env.MEDIA_STORAGE_PROVIDER, dir = process.env.MEDIA_STORAGE_DIR;
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  delete process.env.MEDIA_STORAGE_DIR;
  globalThis.mediaGenerateTestAuth = { workspace: { id: 1 }, activeBrand: { id: 3 }, memberRole: "owner" };
  rows("workspaces")[0].aiCreditsBalance = -1;
  try {
    const response = await mediaPreflightRoute(new Request("http://localhost/api/media/generate?kind=image&brandId=3"));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /credit balance requires administrator reconciliation/i);
    assert.equal(rows("media_assets").length, 0);
  } finally {
    if (storage === undefined) delete process.env.MEDIA_STORAGE_PROVIDER; else process.env.MEDIA_STORAGE_PROVIDER = storage;
    if (dir === undefined) delete process.env.MEDIA_STORAGE_DIR; else process.env.MEDIA_STORAGE_DIR = dir;
    delete globalThis.mediaGenerateTestAuth;
  }
});
const generated = { baseContent: "Useful actual copy.", variants: { linkedin: { content: "Useful actual copy.", hashtags: [], cta: "", formatLabel: "Text" } } };
function completion(result) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }], usage: { total_tokens: 123 } });
}

test("stable text request keys settle once, replay saved results, and reject changed input", async () => {
  const { rows } = fakeDatabase();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return completion(generated); };
  const first = await generateMultiPlatformPosts(input);
  const second = await generateMultiPlatformPosts(input);
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  assert.equal(rows("ai_requests")[0].status, "succeeded");
  assert.equal(rows("ai_usage_records").length, 1);
  assert.equal(rows("ai_usage_records")[0].tokensEstimate, 123);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000 - first.meta.creditsCharged);
  await assert.rejects(generateMultiPlatformPosts({ ...input, topic: "Different" }), /different content/);
  assert.equal(calls, 1);
});

test("media preflight rejects missing S3 credentials before generation", async () => {
  const { rows } = fakeDatabase();
  const names = ["MEDIA_STORAGE_PROVIDER", "S3_MEDIA_REGION", "S3_MEDIA_BUCKET", "S3_MEDIA_PREFIX", "POSTIF_S3_ACCESS_KEY_ID", "POSTIF_S3_SECRET_ACCESS_KEY", "POSTIF_S3_SESSION_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_EC2_METADATA_DISABLED", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, {
    MEDIA_STORAGE_PROVIDER: "s3", S3_MEDIA_REGION: "us-east-1", S3_MEDIA_BUCKET: "isolated-media-test", S3_MEDIA_PREFIX: "media/",
    AWS_PROFILE: "isolated-missing-profile", AWS_CONFIG_FILE: path.join(process.cwd(), ".missing-test-aws-config"),
    AWS_SHARED_CREDENTIALS_FILE: path.join(process.cwd(), ".missing-test-aws-credentials"), AWS_EC2_METADATA_DISABLED: "true",
  });
  globalThis.mediaGenerateTestAuth = { workspace: { id: 1 }, activeBrand: { id: 3 }, memberRole: "owner" };
  try {
    const response = await mediaPreflightRoute(new Request("http://localhost/api/media/generate?kind=image&brandId=3"));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /S3 credentials are unavailable/);
    assert.equal(rows("media_assets").length, 0);
    assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    delete globalThis.mediaGenerateTestAuth;
  }
});

test("social generation requests a strict schema for the selected platforms on supported OpenAI models", async () => {
  const { rows } = fakeDatabase();
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return completion({ baseContent: "Useful copy", variants: {
      linkedin: { content: "LinkedIn copy", hashtags: [], cta: "", formatLabel: "Text" },
      facebook: { content: "Facebook copy", hashtags: [], cta: "", formatLabel: "Text" },
    } });
  };
  const result = await generateMultiPlatformPosts({ ...input, platforms: ["linkedin", "facebook", "facebook"] });
  assert.deepEqual(Object.keys(result.variants), ["linkedin", "facebook"]);
  const format = requestBody.response_format;
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  const schema = format.json_schema.schema;
  assert.deepEqual(schema.required, ["baseContent", "variants"]);
  assert.deepEqual(schema.properties.variants.required, ["linkedin", "facebook"]);
  assert.equal(schema.properties.variants.additionalProperties, false);
  assert.deepEqual(schema.properties.variants.properties.facebook.required, ["content", "hashtags", "cta", "formatLabel"]);
  assert.equal(schema.properties.variants.properties.facebook.additionalProperties, false);
  assert.equal(rows("ai_requests")[0].status, "succeeded");
});

test("other configured models retain JSON mode and the same output validation", async () => {
  const { rows } = fakeDatabase();
  rows("ai_configurations").push({ id: 8, workspaceId: 1, mode: "managed", preferredModel: "gpt-4-turbo" });
  let requestBody;
  globalThis.fetch = async (_url, init) => { requestBody = JSON.parse(init.body); return completion(generated); };
  await generateMultiPlatformPosts(input);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
});

test("ambiguous text failures refund exactly once and cannot repeat a paid request", async () => {
  const { rows } = fakeDatabase();
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new DOMException("Timed out", "TimeoutError"); };
  await assert.rejects(generateMultiPlatformPosts(input), error => error instanceof AIRequestError && error.code === "AI_REQUEST_UNCERTAIN" && !error.safeToRetry);
  assert.equal(rows("ai_requests")[0].status, "uncertain");
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
  await assert.rejects(generateMultiPlatformPosts(input), /will not be sent again/);
  await reconcileAIRequests();
  await reconcileAIRequests();
  assert.equal(rows("ai_usage_records").length, 2);
  assert.equal(calls, 1);
});

test("invalid AI responses produce sanitized stage diagnostics and remain unsafe to retry", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWarn = console.warn;
  const logs = [];
  console.warn = (...args) => logs.push(args.join(" "));
  try {
    process.env.NODE_ENV = "development";
    const cases = [
      { response: () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "private-generated-content" } }] }), stage: "envelope", path: "usage" },
      { response: () => Response.json({ choices: [{ finish_reason: "length", message: { content: "private-not-json" } }], usage: { total_tokens: 1 } }), stage: "content_json", path: null },
      { response: () => completion({ baseContent: "private-generated-content", variants: { linkedin: { content: "private-generated-content", hashtags: "private-value", cta: "", formatLabel: "Text" } } }), stage: "generated_schema", path: "hashtags" },
      { response: () => completion({ baseContent: "private-generated-content", variants: {} }), stage: "generated_schema", path: "linkedin" },
    ];
    for (const [index, item] of cases.entries()) {
      const { rows } = fakeDatabase();
      let calls = 0;
      globalThis.fetch = async () => { calls++; return item.response(); };
      await assert.rejects(generateMultiPlatformPosts(input), error => error instanceof AIRequestError && error.code === "AI_REQUEST_UNCERTAIN" && !error.safeToRetry);
      await assert.rejects(generateMultiPlatformPosts(input), error => error instanceof AIRequestError && error.code === "AI_REQUEST_UNCERTAIN" && !error.safeToRetry);
      assert.equal(calls, 1);
      assert.equal(rows("ai_requests")[0].status, "uncertain");
      const entry = JSON.parse(logs[index].slice(logs[index].indexOf("{")));
      assert.equal(entry.stage, item.stage);
      if (item.path) assert.ok(entry.issues.some(issue => issue.path.includes(item.path)));
      if (item.stage === "content_json") assert.equal(entry.finishReason, "length");
    }
    assert.doesNotMatch(logs.join("\n"), /private-|test-managed-key|Useful topic/);
    process.env.NODE_ENV = "production";
    fakeDatabase();
    globalThis.fetch = async () => completion({ baseContent: "private-generated-content", variants: {} });
    await assert.rejects(generateMultiPlatformPosts(input), error => error instanceof AIRequestError && !error.safeToRetry);
    assert.equal(logs.length, cases.length);
  } finally {
    console.warn = originalWarn;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("definite OpenAI rejection records the cause and permits a separate user action", async () => {
  const { rows } = fakeDatabase();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("sensitive provider response", { status: 401 }); };
  await assert.rejects(generateMultiPlatformPosts(input), error =>
    error instanceof AIRequestError && error.code === "AI_REQUEST_FAILED" && error.safeToRetry && /HTTP 401/.test(error.message));
  assert.equal(rows("ai_requests")[0].status, "refunded");
  assert.match(rows("ai_requests")[0].error, /HTTP 401/);
  assert.doesNotMatch(rows("ai_requests")[0].error, /sensitive/);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
  await assert.rejects(generateMultiPlatformPosts(input), error =>
    error instanceof AIRequestError && error.code === "AI_REQUEST_FAILED" && error.safeToRetry && /HTTP 401/.test(error.message));
  assert.equal(calls, 1);
  globalThis.fetch = async () => { calls++; return completion(generated); };
  await generateMultiPlatformPosts({ ...input, requestKey: "deliberate-action-2" });
  assert.equal(calls, 2);
  assert.equal(rows("ai_requests")[1].status, "succeeded");
});

test("in-progress and uncertain requests never authorize a new attempt", async () => {
  const { rows } = fakeDatabase();
  let release;
  let calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async () => { calls++; await pending; return new Response("", { status: 503 }); };
  const first = generateMultiPlatformPosts(input);
  while (!rows("ai_requests").length || rows("ai_requests")[0].status !== "sending") await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(generateMultiPlatformPosts(input), error =>
    error instanceof AIRequestError && error.code === "AI_REQUEST_IN_PROGRESS" && !error.safeToRetry);
  release();
  await assert.rejects(first, error => error instanceof AIRequestError && error.code === "AI_REQUEST_UNCERTAIN" && !error.safeToRetry && error.providerStatus === 503);
  await assert.rejects(generateMultiPlatformPosts(input), error =>
    error instanceof AIRequestError && error.code === "AI_REQUEST_UNCERTAIN" && !error.safeToRetry && error.providerStatus === 503);
  assert.equal(calls, 1);
});

test("an inconsistent refunded record cannot authorize a fresh attempt", async () => {
  const { rows } = fakeDatabase();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("", { status: 401 }); };
  await assert.rejects(generateMultiPlatformPosts(input), error => error instanceof AIRequestError && error.safeToRetry);
  rows("ai_requests")[0].refundedAt = null;
  await assert.rejects(generateMultiPlatformPosts(input), error =>
    error instanceof AIRequestError && error.code === "AI_REQUEST_UNCERTAIN" && !error.safeToRetry);
  assert.equal(calls, 1);
});

test("AI generation API reports provider rejection and refuses replay without a second charge", async () => {
  const { rows } = fakeDatabase();
  globalThis.aiGenerateTestAuth = { user: { id: 7 }, workspace: { id: 1, name: "Test" }, memberRole: "owner", activeBrand: { id: 3 } };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("sensitive provider body", { status: 401 }); };
  const request = () => new Request("https://example.test/api/ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "generate-route-test-1" },
    body: JSON.stringify({ mode: "generate", topic: "Test", platforms: ["linkedin"] }),
  });

  const first = await generateRoute(request());
  const firstBody = await first.json();
  assert.equal(first.status, 502);
  assert.equal(firstBody.code, "AI_REQUEST_FAILED");
  assert.equal(firstBody.safeToRetry, true);
  assert.equal(firstBody.providerStatus, 401);
  assert.doesNotMatch(JSON.stringify(firstBody), /sensitive provider body/);
  const replay = await generateRoute(request());
  const replayBody = await replay.json();
  assert.equal(replay.status, 409);
  assert.equal(replayBody.code, "AI_REQUEST_FAILED");
  assert.equal(replayBody.safeToRetry, true);
  assert.equal(replayBody.providerStatus, 401);
  assert.equal(calls, 1);
  assert.equal(rows("ai_requests").length, 1);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
});

test("text generation does not silently ignore a media request", async () => {
  fakeDatabase();
  globalThis.aiGenerateTestAuth = { user: { id: 7 }, workspace: { id: 1, name: "Test" }, memberRole: "owner", activeBrand: { id: 3 } };
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected provider call"); };
  const response = await generateRoute(new Request("https://example.test/api/ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "generate", topic: "A topic", mediaType: "image" }),
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /does not create media/);
  assert.equal(calls, 0);
});

test("stale text reservations reconcile idempotently without calling the provider", async () => {
  const { rows } = fakeDatabase();
  rows("workspaces")[0].aiCreditsBalance = 992;
  rows("ai_usage_records").push({ id: 5, workspaceId: 1, billingMode: "managed", creditsUsed: 8, executionSource: "reserved" });
  rows("ai_requests").push({ id: 10, key: "1:crashed", workspaceId: 1, userId: 7, operation: "generate_posts", model: "test", billingMode: "managed", creditEpoch: "initial", credits: 8, status: "sending", token: "fence", usageRecordId: 5, refundedAt: null, updatedAt: new Date(Date.now() - 180000) });
  globalThis.fetch = async () => { throw new Error("Unexpected provider call"); };
  assert.equal(await reconcileAIRequests(), 1);
  assert.equal(await reconcileAIRequests(), 0);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
  assert.equal(rows("ai_requests")[0].status, "uncertain");
  assert.equal(rows("ai_usage_records").reduce((sum, item) => sum + item.creditsUsed, 0), 0);
});

test("invalid balances fail before reservation or provider spending", async () => {
  const { rows } = fakeDatabase();
  rows("workspaces")[0].aiCreditsBalance = -1;
  globalThis.fetch = async () => { throw new Error("Unexpected provider call"); };
  await assert.rejects(generateMultiPlatformPosts(input), /reconciliation/);
  assert.equal(rows("ai_requests").length, 0);
});

test("delayed AI and media refunds cannot recreate credits after an allowance reset", async () => {
  const { rows, repo } = fakeDatabase();
  const asset = await queueMedia(1, 3, 7, { prompt: "An image", kind: "image", aspectRatio: "1:1" });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async () => { await pending; throw new Error("Uncertain provider response"); };
  const generation = generateMultiPlatformPosts(input);
  while (!rows("ai_requests").length || rows("ai_requests")[0].status !== "sending") await new Promise(resolve => setImmediate(resolve));
  rows("paypal_subscriptions")[0].creditEpoch = "next-allowance";
  rows("workspaces")[0].aiCreditsBalance = 1000;
  release();
  await assert.rejects(generation, /uncertain/);
  await cancelQueuedMedia(repo, asset.id, 1);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
  assert.equal(rows("ai_requests")[0].refundedCredits, 0);
  assert.equal(rows("media_reservations")[0].refundedCredits, 0);
  assert.equal(rows("ai_usage_records").filter(item => item.executionSource === "expired_refund").length, 2);
});

test("crashed settlement/refund is recoverable without a second provider call", async () => {
  const { rows, repo } = fakeDatabase();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return completion(generated); };
  let transactions = 0;
  db.transaction = async callback => {
    transactions++;
    if (transactions === 2 || transactions === 3) throw new Error("Mock settlement storage outage");
    return repo.transaction(callback);
  };
  await assert.rejects(generateMultiPlatformPosts(input), error =>
    error instanceof AIRequestError && error.code === "AI_REQUEST_UNCERTAIN" && !error.safeToRetry && /reconciliation/.test(error.message));
  assert.equal(rows("ai_requests")[0].status, "sending");
  assert.ok(rows("workspaces")[0].aiCreditsBalance < 1000);
  db.transaction = repo.transaction;
  rows("ai_requests")[0].updatedAt = new Date(Date.now() - 180000);
  await reconcileAIRequests();
  await reconcileAIRequests();
  await assert.rejects(generateMultiPlatformPosts(input), /will not be sent again/);
  assert.equal(calls, 1);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
});

test("BYOK media cannot switch to the platform payer while queued", async () => {
  const { rows } = fakeDatabase();
  rows("ai_configurations").push({ id: 8, workspaceId: 1, mode: "byok", encryptedApiKey: encryptSecret("test-customer-key") });
  const asset = await queueMedia(1, 3, 7, { prompt: "A landscape", kind: "image", aspectRatio: "1:1" });
  assert.equal(asset.generationCredits, 0);
  rows("ai_configurations")[0].mode = "managed";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Must not call managed provider"); };
  await refreshPendingMedia();
  assert.equal(calls, 0);
  assert.equal(rows("media_assets")[0].generationStatus, "failed");
  assert.match(rows("media_assets")[0].generationError, /payer, model, or credential version changed/);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
});

test("media cancellation refunds once, and a missing GIF encoder reserves nothing", async () => {
  const { rows, repo } = fakeDatabase();
  const asset = await queueMedia(1, 3, 7, { prompt: "A landscape", kind: "image", aspectRatio: "1:1" });
  await cancelQueuedMedia(repo, asset.id, 1);
  await cancelQueuedMedia(repo, asset.id, 1);
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
  assert.equal(rows("ai_usage_records").filter(item => item.creditsUsed < 0).length, 1);
  const ffmpegPath = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = `${process.cwd()}\\missing-test-ffmpeg.exe`;
  try { await assert.rejects(queueMedia(1, 3, 7, { prompt: "Loop", kind: "gif", aspectRatio: "1:1" }), /executable FFmpeg/); }
  finally {
    if (ffmpegPath === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = ffmpegPath;
  }
  assert.equal(rows("media_assets").length, 1);
});

test("background images persist a response ID, poll without repeating generation, and settle failures once", async () => {
  const { rows } = fakeDatabase();
  const asset = await queueMedia(1, 3, 7, { prompt: "An image", kind: "image", aspectRatio: "1:1" });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body && JSON.parse(init.body) });
    if (calls.length === 1) return Response.json({ id: "resp_test_image", status: "queued" });
    return Response.json({ id: "resp_test_image", status: calls.length === 2 ? "in_progress" : "failed" });
  };
  await refreshPendingMedia();
  assert.equal(rows("media_assets")[0].providerJobId, "resp_test_image");
  assert.equal(rows("media_assets")[0].generationStatus, "processing");
  for (let i = 0; i < 2; i++) {
    rows("media_reservations")[0].nextCheckAt = new Date(0);
    await refreshPendingMedia();
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].body.background, true);
  assert.equal(calls[0].body.store, true);
  assert.equal(calls[0].body.tools[0].model, "gpt-image-1.5");
  assert.equal(calls[0].body.model, "gpt-5.2");
  assert.equal(calls[0].body.max_tool_calls, 1);
  assert.ok(calls.slice(1).every(call => call.url.endsWith("/responses/resp_test_image") && !call.body));
  assert.equal(rows("media_assets")[0].generationStatus, "failed");
  assert.equal(rows("workspaces")[0].aiCreditsBalance, 1000);
  assert.equal(rows("media_reservations")[0].assetId, asset.id);
  await refreshPendingMedia();
  assert.equal(calls.length, 3);
  const encoded = Buffer.from("89504e470d0a1a0a0000000000000000", "hex").toString("base64");
  const completed = backgroundImageResult({ id: "resp_done", status: "completed", output: [{ type: "image_generation_call", result: encoded }], usage: { total_tokens: 321 } });
  assert.equal(completed.bytes.toString("hex"), "89504e470d0a1a0a0000000000000000");
  assert.equal(completed.tokens, 321);
});

for (const mode of ["managed", "byok"]) test(`${mode} background images finish from a durable response without resubmission`, async () => {
  const { rows } = fakeDatabase();
  if (mode === "byok") {
    rows("paypal_subscriptions")[0].paidThrough = new Date(Date.now() - 1000);
    rows("workspaces")[0].aiCreditsBalance = 0;
    rows("ai_configurations").push({ id: 8, workspaceId: 1, mode: "byok", encryptedApiKey: encryptSecret("test-customer-image-key") });
  }
  const directory = path.resolve(`.worker-ai-media-fixture-${crypto.randomUUID()}`);
  const previous = { provider: process.env.MEDIA_STORAGE_PROVIDER, directory: process.env.MEDIA_STORAGE_DIR };
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  process.env.MEDIA_STORAGE_DIR = directory;
  try {
    const image = Buffer.from("89504e470d0a1a0a0000000000000000", "hex");
    const asset = await queueMedia(1, 3, 7, { prompt: "An image", kind: "image", aspectRatio: "1:1" });
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      assert.equal(init.headers.Authorization, `Bearer ${mode === "byok" ? "test-customer-image-key" : "test-managed-key"}`);
      return Response.json(calls === 1 ? { id: "resp_ready_image", status: "queued" } : {
        id: "resp_ready_image", status: "completed", usage: { total_tokens: 321 },
        output: [{ type: "image_generation_call", status: "completed", result: image.toString("base64") }],
      });
    };
    await refreshPendingMedia();
    rows("media_reservations")[0].nextCheckAt = new Date(0);
    await refreshPendingMedia();
    await refreshPendingMedia();
    const ready = rows("media_assets").find(item => item.id === asset.id);
    assert.equal(ready.generationStatus, "ready");
    assert.equal(ready.storageProvider, "local");
    assert.deepEqual(await readFile(path.join(directory, ...ready.storageKey.split("/"))), image);
    assert.equal(rows("media_reservations")[0].status, "succeeded");
    assert.equal(rows("ai_usage_records")[0].executionSource, mode === "byok" ? "byok_live" : "openai_live");
    assert.equal(rows("ai_usage_records")[0].tokensEstimate, 321);
    assert.equal(rows("workspaces")[0].aiCreditsBalance, mode === "byok" ? 0 : 960);
    assert.equal(calls, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (previous.provider === undefined) delete process.env.MEDIA_STORAGE_PROVIDER;
    else process.env.MEDIA_STORAGE_PROVIDER = previous.provider;
    if (previous.directory === undefined) delete process.env.MEDIA_STORAGE_DIR;
    else process.env.MEDIA_STORAGE_DIR = previous.directory;
  }
});

test("revoked BYOK credentials never reuse a queued media credential snapshot", async () => {
  const { rows } = fakeDatabase();
  rows("ai_configurations").push({ id: 8, workspaceId: 1, mode: "byok", encryptedApiKey: encryptSecret("test-customer-key") });
  await queueMedia(1, 3, 7, { prompt: "An image", kind: "image", aspectRatio: "1:1" });
  rows("ai_configurations")[0].encryptedApiKey = null;
  globalThis.fetch = async () => { throw new Error("Revoked credential must not be used"); };
  await refreshPendingMedia();
  assert.equal(rows("media_assets")[0].generationStatus, "failed");
  assert.equal(rows("media_reservations")[0].status, "refunded");
});

test("an unfinished oldest video cannot starve the next queued media job", async () => {
  const { rows } = fakeDatabase();
  const oldest = await queueMedia(1, 3, 7, { prompt: "First", kind: "video", aspectRatio: "16:9" });
  await queueMedia(1, 3, 7, { prompt: "Second", kind: "video", aspectRatio: "16:9" });
  Object.assign(rows("media_assets").find(asset => asset.id === oldest.id), { generationStatus: "processing", providerJobId: "old-video", generationStartedAt: new Date() });
  const urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return Response.json(String(url).includes("/tasks/") ? { status: "RUNNING" } : { id: "new-video" }); };
  await refreshPendingMedia({ limit: 1 });
  await refreshPendingMedia({ limit: 1 });
  assert.equal(urls.length, 2);
  assert.match(urls[0], /tasks\/old-video/);
  assert.match(urls[1], /text_to_video/);
  assert.equal(rows("media_assets")[1].providerJobId, "new-video");
});

test("recurring planning creates real unapproved drafts and reuses durable period results", async () => {
  const { rows } = fakeDatabase();
  rows("agent_configurations").push({ id: 9, workspaceId: 1, brandId: 3, mode: "autopilot", isPaused: false, maxPostsPerWeek: 2, allowedPlatforms: ["linkedin"], objectives: ["Educate"], currentStrategy: "Be useful" });
  rows("planning_schedules").push({ id: 11, workspaceId: 1, enabled: true, enabledBy: 7, intervalDays: 7, nextRunAt: new Date(Date.now() - 1000), updatedAt: new Date(0) });
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    return completion(body.messages[0].content.includes("weekly content plan") ? { weeklyPlan: [
      { day: "Monday", platform: "linkedin", pillar: "Education", concept: "First topic", status: "planned" },
      { day: "Friday", platform: "linkedin", pillar: "Education", concept: "Second topic", status: "planned" },
    ] } : generated);
  };
  for (let i = 0; i < 4; i++) await runRecurringPlanning();
  assert.equal(calls, 3);
  assert.equal(rows("posts").length, 2);
  assert.ok(rows("posts").every(post => post.baseContent === generated.baseContent && post.status === "pending_approval" && post.requiresApproval && post.approvedAt === null && post.scheduledAt === null));
  assert.equal(rows("publishing_jobs").length, 0);
  assert.equal(rows("planning_runs")[0].status, "completed");
  assert.ok(rows("planning_schedules")[0].nextRunAt > new Date());
});

test("phase failure is persisted without stopping other worker phases", async () => {
  const { rows } = fakeDatabase();
  db.withLease = async (name, callback) => {
    if (name === "notification-delivery") throw new Error("Mock notification failure");
    return callback();
  };
  globalThis.fetch = async () => { throw new Error("No provider calls expected"); };
  const result = await runWorkerSweep();
  assert.equal(result.ok, false);
  assert.equal(result.phases.publishing.status, "completed");
  assert.equal(result.phases.notifications.status, "failed");
  assert.equal(result.phases.media.status, "completed");
  assert.equal(result.phases.media_upload_cleanup.status, "completed");
  assert.equal(result.phases.catalog_sync, undefined, "Scheduled workers must not synchronize the PayPal catalog.");
  assert.equal(result.phases.catalog_publications, undefined, "Scheduled workers must not publish PayPal plans.");
  assert.equal(rows("worker_states").some(row => ["phase:catalog_sync", "phase:catalog_publications"].includes(row.key)), false);
  assert.equal(rows("worker_states").find(row => row.key === "phase:media_upload_cleanup").status, "completed");
  assert.equal(rows("worker_states").find(row => row.key === "sweep").status, "degraded");
});

test("confirmed publication and usage settle before notification fan-out, with recovery sweeps", async () => {
  const { rows, repo } = fakeDatabase();
  rows("posts").push({ id: 20, workspaceId: 1, title: "Confirmed post", status: "publishing", requiresApproval: true, approvedAt: new Date(), notifyOnPublish: true, updatedAt: new Date(0) });
  rows("publishing_jobs").push({ id: 21, workspaceId: 1, postId: 20, status: "completed" });
  await processDuePosts();
  assert.equal(rows("posts")[0].status, "published");
  assert.equal(rows("workspaces")[0].postsPublishedThisMonth, 1);
  assert.equal(rows("worker_notices").length, 1);
  const insert = repo.insert;
  repo.insert = async (model, values) => {
    if (model.name === "notifications") throw new Error("Mock fan-out failure");
    return insert(model, values);
  };
  await deliverNotifications();
  await processDuePosts();
  assert.equal(rows("posts")[0].status, "published");
  assert.equal(rows("workspaces")[0].postsPublishedThisMonth, 1);
  assert.equal(rows("worker_notices")[0].attempts, 1);
});

test("direct publishing invocations share one bounded network deadline and claim at most five jobs", async () => {
  const { rows } = fakeDatabase();
  const due = new Date(Date.now() - 1000);
  rows("social_accounts").push({ id: 30, workspaceId: 1, brandId: 3, platform: "linkedin", status: "connected" });
  rows("social_credentials").push({ id: 31, workspaceId: 1, socialAccountId: 30, encryptedCredentials: encryptSecret(JSON.stringify({ accessToken: "test-customer-token", accountId: "urn:li:person:test", apiVersion: "202601" })) });
  for (let index = 0; index < 7; index++) {
    rows("posts").push({ id: 40 + index, workspaceId: 1, brandId: 3, title: "Due post", baseContent: "Actual content",
      status: "scheduled", requiresApproval: false, approvedAt: null, notifyOnPublish: false,
      updatedAt: new Date(0), scheduledAt: due, platforms: ["linkedin"], variants: {}, mediaIds: [] });
    rows("publishing_jobs").push({ id: 60 + index, workspaceId: 1, postId: 40 + index, platform: "linkedin",
      scheduledFor: due, status: "queued", nextCheckAt: null, encryptedProviderState: null,
      startedAt: null, attempts: 0, maxAttempts: 3, socialAccountId: null });
  }
  const deadlines = [];
  globalThis.fetch = async (_url, init) => {
    deadlines.push(getWorkerDeadline());
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(null, { status: 201, headers: { "x-restli-id": `urn:li:share:${deadlines.length}` } });
  };
  const started = Date.now();
  assert.equal(await processDuePosts(1), 5);
  assert.equal(deadlines.length, 5);
  assert.equal(new Set(deadlines).size, 1);
  assert.ok(deadlines[0] > started && deadlines[0] <= started + 20000);
  assert.equal(rows("publishing_jobs").filter(job => job.status === "completed").length, 5);
  assert.equal(rows("publishing_jobs").filter(job => job.status === "queued").length, 2);
  assert.equal(await processDuePosts(1, { deadline: Date.now() - 1 }), 0);
  assert.equal(deadlines.length, 5);
});

test("expired subscriptions prevent recurring AI spending without removing drafts", async () => {
  const { rows } = fakeDatabase();
  rows("paypal_subscriptions")[0].paidThrough = new Date(Date.now() - 1000);
  rows("agent_configurations").push({ id: 9, workspaceId: 1, brandId: 3, mode: "autopilot", isPaused: false, maxPostsPerWeek: 2, allowedPlatforms: ["linkedin"], objectives: [], currentStrategy: "" });
  rows("planning_schedules").push({ id: 11, workspaceId: 1, enabled: true, enabledBy: 7, intervalDays: 7, nextRunAt: new Date(0), updatedAt: new Date(0) });
  rows("posts").push({ id: 4, workspaceId: 1, status: "draft", baseContent: "Retain me" });
  globalThis.fetch = async () => { throw new Error("No provider spending allowed"); };
  const result = await runRecurringPlanning();
  assert.equal(result.blocked, 1);
  assert.equal(rows("posts")[0].baseContent, "Retain me");
  assert.equal(rows("ai_requests").length, 0);
});

test("worker authentication and budget never accept missing secrets or unbounded values", () => {
  process.env.WORKER_SECRET = "";
  assert.equal(isWorkerAuthorized(new Request("http://localhost", { headers: { authorization: "Bearer undefined" } })), false);
  process.env.WORKER_SECRET = "test-worker-secret-of-at-least-32-characters";
  assert.equal(isWorkerAuthorized(new Request("http://localhost", { headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } })), true);
  assert.equal(workerBudgetMs("999999"), 25000);
  assert.equal(workerBudgetMs("bad"), 24000);
});
