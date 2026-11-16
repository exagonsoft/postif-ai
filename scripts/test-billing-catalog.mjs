// Isolated catalog state-machine tests: no environment files, MongoDB, or provider traffic.
import "./register-ts.mjs";
import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

const operator = { user: { id: 1, email: "operator@example.invalid", systemRole: "operator" } };
let rows;
let counters;
let queue = Promise.resolve();
let environment;
let calls;
let resources;
let failMonth;
let failProduct;
let pauseProduct;
let databaseFailure;
let providerReads;
let publicationBusy = false;
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && "$gt" in value) return row[key] > value.$gt;
    return row[key] === value;
  });
}
const repository = {
  async find(model, filter = {}, options = {}) {
    if (databaseFailure) throw new Error("isolated database unavailable");
    let result = (rows.get(model.name) ?? []).filter(row => matches(row, filter));
    if (options.sort?.id === -1) result = [...result].sort((a, b) => b.id - a.id);
    return structuredClone(options.limit ? result.slice(0, options.limit) : result);
  },
  async insert(model, values) {
    const result = [];
    for (const value of Array.isArray(values) ? values : [values]) {
      const id = (counters.get(model.name) ?? 0) + 1;
      counters.set(model.name, id);
      const row = { ...model.defaults(), id, ...structuredClone(value) };
      const collection = rows.get(model.name) ?? [];
      if (model.unique.some(key => collection.some(existing => existing[key] === row[key]))) throw new Error("duplicate unique key");
      collection.push(row);
      rows.set(model.name, collection);
      result.push(structuredClone(row));
    }
    return result;
  },
  async update(model, filter, changes) {
    const result = [];
    for (const row of rows.get(model.name) ?? []) {
      if (!matches(row, filter)) continue;
      Object.assign(row, structuredClone(changes));
      result.push(structuredClone(row));
    }
    return result;
  },
};
const db = {
  ...repository,
  async withLease(name, callback, busy) {
    if (publicationBusy) return busy;
    publicationBusy = true;
    try { return await callback(); } finally { publicationBusy = false; }
  },
  async transaction(callback) {
    const previous = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    const oldRows = structuredClone(rows);
    const oldCounters = structuredClone(counters);
    try { return await callback(repository); }
    catch (error) { rows = oldRows; counters = oldCounters; throw error; }
    finally { release(); }
  },
};
class BillingError extends Error {
  constructor(message, status = 503, providerStatus) { super(message); this.status = status; this.providerStatus = providerStatus; }
}
async function create(kind, input, requestId) {
  calls.push({ kind, input: structuredClone(input), requestId, environment });
  const key = `${environment}:${requestId}`;
  let resource = resources.get(key);
  if (!resource) {
    resource = { id: kind === "product" && input.id ? input.id : `MOCK-${environment}-${kind}-${resources.size + 1}`, input: structuredClone(input) };
    resources.set(key, resource);
  }
  if (kind === "product" && pauseProduct) await pauseProduct;
  if (kind === "product" && failProduct) { failProduct = false; throw new Error("uncertain isolated product response"); }
  if (kind === "month" && failMonth) { failMonth = false; throw new Error("uncertain isolated provider response"); }
  return { id: resource.id };
}
function resource(id) { return [...resources.values()].find(item => item.id === id); }
const { getPayPalPlanName } = await import("../src/lib/paypal.ts");
globalThis.__catalogTest = {
  db, BillingError, getPayPalPlanName,
  DEFAULT_PAYPAL_PAYMENT_POLICY: { autoBillOutstanding: false, paymentFailureThreshold: 1 },
  getPayPalPaymentPolicy: provider => provider.paymentPolicy ?? { autoBillOutstanding: false, paymentFailureThreshold: 1 },
  getPayPalEnvironment: () => environment,
  getPayPalCatalogIdentity: () => `isolated-${environment}`,
  getBillingReadiness: () => ({ enabled: false, configured: true, ready: false, missing: [], invalid: [] }),
  createPayPalProduct: (input, requestId) => create("product", input, requestId),
  createPayPalPlan: (input, requestId) => create(input.interval, input, requestId),
  renamePayPalPlan: async () => { throw new Error("Provider rename is covered by the isolated MongoDB suite."); },
  getPayPalProduct: async (id, deadline) => {
    providerReads.push({ kind: "product", id, deadline });
    const existing = resource(id);
    if (!existing) throw new BillingError("not found", 502, 404);
    return { ...existing.input, id };
  },
  getPayPalPlan: async (id, deadline) => {
    providerReads.push({ kind: "plan", id, deadline });
    const existing = resource(id);
    if (!existing) throw new BillingError("not found", 502, 404);
    return { id, name: existing.input.plan.name, description: existing.input.plan.description, status: "ACTIVE", ...existing.input };
  },
  verifyPayPalPlan: (provider, definition, interval, productId) => {
    assert.equal(provider.productId, productId);
    assert.equal(provider.interval, interval);
    assert.deepEqual(provider.plan, definition);
  },
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/billing-catalog.ts")) {
      if (specifier === "@/db") return { url: "catalog-mock:db", shortCircuit: true };
      if (specifier === "@/db/schema") return { url: "catalog-mock:schema", shortCircuit: true };
      if (specifier === "./paypal") return { url: "catalog-mock:paypal", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "catalog-mock:db") return { format: "module", shortCircuit: true, source: "export const db = globalThis.__catalogTest.db;" };
    if (url === "catalog-mock:schema") return { format: "module", shortCircuit: true, source: 'export const auditLogs = { name: "audit_logs", defaults: () => ({ createdAt: new Date() }), unique: ["id"] }; export const users = { name: "users" };' };
    if (url === "catalog-mock:paypal") return { format: "module", shortCircuit: true, source: `export const { BillingError, DEFAULT_PAYPAL_PAYMENT_POLICY, getPayPalPlanName, getPayPalPaymentPolicy, getPayPalEnvironment, getPayPalCatalogIdentity, getBillingReadiness, createPayPalProduct, createPayPalPlan, getPayPalProduct, getPayPalPlan, renamePayPalPlan, verifyPayPalPlan } = globalThis.__catalogTest;` };
    return next(url, context);
  },
});
const { getCatalogPlans, getFreePlan, getPurchasablePlan, getAdminCatalog, manageCatalog, catalogPlanDefinitionSchema, verifyCatalogVersion } = await import("../src/lib/billing-catalog.ts");
const { SUBSCRIPTION_PLANS } = await import("../src/lib/plans.ts");
const { catalogProducts, catalogPlans, catalogVersions } = await import("../src/db/catalog-schema.ts");
beforeEach(() => {
  rows = new Map(); counters = new Map(); queue = Promise.resolve();
  environment = "sandbox"; calls = []; resources = new Map(); failMonth = false; failProduct = false; pauseProduct = null; databaseFailure = false;
  providerReads = []; publicationBusy = false;
});
async function initialize() { await manageCatalog(operator, { action: "initialize_defaults" }); }
async function plan(slug = "starter_ai") { return (await db.find(catalogPlans, { slug }))[0]; }
async function publish(slug = "starter_ai") {
  const current = await plan(slug);
  await manageCatalog(operator, { action: "publish_plan", id: current.id, revision: current.revision });
}
test("only a platform operator can read or mutate; workspace admins and absent workspaces do not authorize", async () => {
  for (const actor of [null, { user: { id: 2, email: "admin@example.invalid", systemRole: "user" }, memberRole: "admin", workspace: { id: 1 } }]) {
    await assert.rejects(getAdminCatalog(actor), error => error.status === 403);
    await assert.rejects(manageCatalog(actor, { action: "initialize_defaults" }), error => error.status === 403);
  }
  assert.equal(rows.size, 0);
  await initialize();
  assert.equal((await getAdminCatalog(operator)).plans.length, 6);
  assert.equal(calls.length, 0);
});
test("empty catalog has informational paid defaults only; database failures surface", async () => {
  const catalog = await getCatalogPlans();
  assert.equal(catalog.find(item => item.slug === "free").purchasable, true);
  assert.equal(catalog.find(item => item.slug === "starter_ai").monthlyPrice, 19);
  assert.equal(catalog.filter(item => item.slug !== "free").every(item => item.purchasable === false), true);
  await assert.rejects(getPurchasablePlan("starter_ai", "month"));
  assert.equal(calls.length, 0);
  databaseFailure = true;
  await assert.rejects(getCatalogPlans(), /database unavailable/);
});
test("definitions and actions reject unknown keys, unsafe slugs, unbounded values and non-Free commercial invariants", async () => {
  for (const change of [
    { slug: "__proto__" }, { slug: "constructor" }, { monthlyPrice: -1 }, { annualMonthlyPrice: 0 },
    { monthlyPrice: 1.001 }, { maxPostsPerMonth: 10000001 }, { maxBrands: 1.5 },
    { includedMonthlyCredits: -1 }, { features: ["x".repeat(241)] }, { extraneous: true },
  ]) assert.equal(catalogPlanDefinitionSchema.safeParse({ ...SUBSCRIPTION_PLANS.starter_ai, ...change }).success, false);
  for (const change of [{ monthlyPrice: 1 }, { includedMonthlyCredits: 1 }, { defaultAiMode: "managed" }, { allowsConfigurableAiMode: true }]) {
    assert.equal(catalogPlanDefinitionSchema.safeParse({ ...SUBSCRIPTION_PLANS.free, ...change }).success, false);
  }
  await assert.rejects(manageCatalog(operator, { action: "initialize_defaults", ignored: true }), error => error.status === 400);
  await assert.rejects(manageCatalog(operator, JSON.parse('{"action":"initialize_defaults","__proto__":{}}')), error => error.status === 400);
  let nested = {};
  for (let index = 0; index < 20; index++) nested = { child: nested };
  await assert.rejects(manageCatalog(operator, nested), error => error.status === 400);
});
test("Free versions publish locally with configurable limits/features but never provider calls", async () => {
  await initialize();
  const free = await plan("free");
  await manageCatalog(operator, { action: "edit_plan", id: free.id, revision: free.revision, definition: { ...free.draft, maxBrands: 2, campaignsEnabled: true } });
  await publish("free");
  assert.equal((await getFreePlan()).maxBrands, 2);
  assert.equal((await getFreePlan()).campaignsEnabled, true);
  assert.ok((await getFreePlan()).catalogVersionId);
  assert.equal(calls.length, 0);
  const current = await plan("free");
  await assert.rejects(manageCatalog(operator, { action: "archive_plan", id: current.id, revision: current.revision, archived: true }));
});
test("plan descriptions replace line breaks with spaces without shortening content in drafts or new provider snapshots", async () => {
  await initialize();
  const productId = (await plan()).productId;
  const description = "Create content.\r\nSchedule posts.\nUse your own key.";
  const expected = "Create content. Schedule posts. Use your own key.";
  for (const legacy of [false, true]) {
    const slug = legacy ? "legacy_description" : "wrapped_description";
    await manageCatalog(operator, { action: "create_plan", productId, definition: { ...SUBSCRIPTION_PLANS.starter_ai, slug, description } });
    const draft = await plan(slug);
    assert.equal(draft.draft.description, expected);
    if (legacy) await db.update(catalogPlans, { id: draft.id }, { draft: { ...draft.draft, description } });
    await publish(slug);
    const [version] = await db.find(catalogVersions, { planId: draft.id });
    assert.equal(version.definition.description, expected);
    assert.equal(version.monthRequest.description, expected);
    assert.equal(version.yearRequest.description, expected);
    for (const call of calls.filter(call => call.input.plan?.slug === slug)) assert.equal(call.input.plan.description, expected);
  }
  assert.equal(catalogPlanDefinitionSchema.safeParse({ ...SUBSCRIPTION_PLANS.starter_ai, description: "x".repeat(128) }).success, false);
  assert.equal(catalogPlanDefinitionSchema.parse({ ...SUBSCRIPTION_PLANS.starter_ai, description: `${"x".repeat(63)}\n${"y".repeat(63)}` }).description,
    `${"x".repeat(63)} ${"y".repeat(63)}`);
});
test("new versions preserve old immutable terms, reject stale checkout, and use distinct provider resources", async () => {
  await initialize(); await publish();
  const old = await getPurchasablePlan("starter_ai", "month");
  const current = await plan();
  await manageCatalog(operator, { action: "edit_plan", id: current.id, revision: current.revision, definition: { ...current.draft, monthlyPrice: 25, includedMonthlyCredits: 900, autopilotEnabled: true } });
  assert.equal((await getPurchasablePlan("starter_ai", "month")).definition.monthlyPrice, 19);
  await publish();
  const latest = await getPurchasablePlan("starter_ai", "month");
  assert.notEqual(latest.versionId, old.versionId);
  assert.notEqual(latest.paypalPlanId, old.paypalPlanId);
  assert.equal(latest.definition.monthlyPrice, 25);
  assert.equal(latest.definition.includedMonthlyCredits, 900);
  assert.equal((await db.find(catalogVersions, { id: old.versionId }))[0].definition.monthlyPrice, 19);
  assert.equal(old.definition.autopilotEnabled, false);
  await assert.rejects(getPurchasablePlan("starter_ai", "month", old.versionId), /Catalog changed/);
  await publish();
  assert.equal(calls.length, 5);
  assert.equal(latest.paypalProductId, old.paypalProductId);
});
test("environment mappings never cross Sandbox/live and catalog reads never create provider resources", async () => {
  await initialize(); await publish();
  const sandbox = await getPurchasablePlan("starter_ai", "year");
  environment = "live";
  await assert.rejects(getPurchasablePlan("starter_ai", "year"));
  assert.deepEqual((await getCatalogPlans()).map(item => item.slug), ["free"]);
  assert.equal(calls.length, 3);
  await publish();
  const live = await getPurchasablePlan("starter_ai", "year");
  assert.notEqual(live.paypalPlanId, sandbox.paypalPlanId);
  environment = "sandbox";
  assert.equal((await getPurchasablePlan("starter_ai", "year")).versionId, sandbox.versionId);
});
test("archive and revision races reject stale edits while retaining published snapshots", async () => {
  await initialize(); await publish();
  const current = await plan();
  const results = await Promise.allSettled([
    manageCatalog(operator, { action: "archive_plan", id: current.id, revision: current.revision, archived: true }),
    manageCatalog(operator, { action: "edit_plan", id: current.id, revision: current.revision, definition: { ...current.draft, maxChannels: 9 } }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  await assert.rejects(getPurchasablePlan("starter_ai", "month"));
  assert.equal((await db.find(catalogVersions, { planId: current.id })).length, 1);
  assert.equal((await getCatalogPlans()).some(item => item.slug === "starter_ai"), false);
});
test("product archival hides paid checkout but retains Free and historical snapshots; restoration reuses published versions", async () => {
  await initialize(); await publish();
  const prior = await getPurchasablePlan("starter_ai", "month");
  const [product] = await db.find(catalogProducts);
  await manageCatalog(operator, { action: "archive_product", id: product.id, revision: product.revision, archived: true });
  await assert.rejects(getPurchasablePlan("starter_ai", "month"));
  assert.deepEqual((await getCatalogPlans()).map(item => item.slug), ["free"]);
  assert.equal((await db.find(catalogVersions, { id: prior.versionId }))[0].definition.monthlyPrice, 19);
  const [archived] = await db.find(catalogProducts);
  await manageCatalog(operator, { action: "archive_product", id: archived.id, revision: archived.revision, archived: false });
  assert.equal((await getPurchasablePlan("starter_ai", "month")).versionId, prior.versionId);
  assert.equal(calls.length, 3);
});
test("a pending publication blocks draft/product/archive races and busy publishers", async () => {
  await initialize();
  let release;
  pauseProduct = new Promise(resolve => { release = resolve; });
  const publishing = publish();
  while (!calls.length) await new Promise(resolve => setImmediate(resolve));
  const current = await plan();
  const [product] = await db.find(catalogProducts);
  await assert.rejects(manageCatalog(operator, { action: "archive_plan", id: current.id, revision: current.revision, archived: true }));
  await assert.rejects(manageCatalog(operator, { action: "edit_product", id: product.id, revision: product.revision, name: "Changed", description: "Changed" }));
  await assert.rejects(manageCatalog(operator, { action: "archive_product", id: product.id, revision: product.revision, archived: true }));
  await assert.rejects(publish(), /busy/);
  release(); await publishing;
  assert.equal((await getPurchasablePlan("starter_ai", "month")).definition.monthlyPrice, 19);
});
test("uncertain publish retry reuses durable request IDs and snapshots, never duplicates products/plans", async () => {
  await initialize(); failMonth = true;
  await assert.rejects(publish(), /uncertain isolated/);
  const [pending] = await db.find(catalogVersions);
  assert.equal(pending.status, "pending");
  assert.ok(pending.productRequest.providerId);
  assert.ok(pending.monthRequest.startedAt instanceof Date);
  assert.equal(pending.monthRequest.providerId, null);
  const firstMonth = calls.find(item => item.kind === "month");
  environment = "live";
  await assert.rejects(publish(), /original environment/);
  environment = "sandbox";
  await publish();
  assert.equal(calls.filter(item => item.kind === "product").length, 1);
  assert.deepEqual(calls.filter(item => item.kind === "month").map(item => item.requestId), [firstMonth.requestId, firstMonth.requestId]);
  assert.equal(resources.size, 3);
  assert.equal((await db.find(catalogVersions)).length, 1);
  assert.equal((await getPurchasablePlan("starter_ai", "month")).versionId, pending.id);
});
test("legacy pending publications retain their original unformatted names when retried", async () => {
  await initialize(); failMonth = true;
  await assert.rejects(publish(), /uncertain isolated/);
  const [pending] = await db.find(catalogVersions);
  const monthRequest = { ...pending.monthRequest }, yearRequest = { ...pending.yearRequest };
  delete monthRequest.name; delete yearRequest.name;
  resources.get(`sandbox:${monthRequest.requestId}`).input.name = pending.definition.name;
  await db.update(catalogVersions, { id: pending.id }, { monthRequest, yearRequest });
  await publish();
  for (const kind of ["month", "year"]) {
    assert.equal(calls.filter(item => item.kind === kind).at(-1).input.name, pending.definition.name);
  }
  assert.equal((await db.find(catalogVersions)).length, 1);
});
test("uncertain outcomes beyond retention require reconciliation, not a fresh request", async () => {
  await initialize(); failMonth = true;
  await assert.rejects(publish());
  const [pending] = await db.find(catalogVersions);
  await db.update(catalogVersions, { id: pending.id }, { monthRequest: { ...pending.monthRequest, startedAt: new Date(Date.now() - 72 * 3600000) } });
  const previousCalls = calls.length;
  await assert.rejects(publish(), /reconciliation is required/);
  assert.equal(calls.length, previousCalls);
});
test("uncertain product creation reconciles by durable custom ID even after request retention", async () => {
  await initialize(); failProduct = true;
  await assert.rejects(publish(), /uncertain isolated product/);
  const [pending] = await db.find(catalogVersions);
  assert.match(pending.productRequest.requestedId, /^PROD-[A-Z0-9]{17}$/);
  assert.equal(pending.productRequest.requestedId.length, 22);
  assert.equal(pending.productRequest.providerId, null);
  await db.update(catalogVersions, { id: pending.id }, { productRequest: { ...pending.productRequest, startedAt: new Date(Date.now() - 72 * 3600000) } });
  await publish();
  assert.equal(calls.filter(item => item.kind === "product").length, 1);
  assert.equal((await getPurchasablePlan("starter_ai", "month")).paypalProductId, pending.productRequest.requestedId);
});
test("a confirmed missing product retries its original request instead of treating mapped HTTP 404 as a fatal provider error", async () => {
  await initialize(); failProduct = true;
  await assert.rejects(publish(), /uncertain isolated product/);
  const original = calls.find(call => call.kind === "product");
  resources.clear();
  await publish();
  const productCalls = calls.filter(call => call.kind === "product");
  assert.equal(productCalls.length, 2);
  assert.ok(productCalls.every(call => call.requestId === original.requestId && call.input.id === original.input.id));
  assert.equal(resources.size, 3);
  assert.equal((await db.find(catalogVersions)).length, 1);
});
test("verification reads the immutable product and both plans without database or provider mutations", async () => {
  await initialize(); await publish();
  const [version] = await db.find(catalogVersions);
  const before = structuredClone(rows), writes = calls.length;
  providerReads = [];
  const result = await verifyCatalogVersion(operator, version.id);
  assert.equal(result.status, "verified");
  assert.equal(result.productId, version.productRequest.providerId);
  assert.equal(result.monthPlanId, version.monthRequest.providerId);
  assert.equal(result.yearPlanId, version.yearRequest.providerId);
  assert.equal(providerReads.length, 3);
  assert.ok(providerReads.every(read => read.deadline > Date.now() && read.deadline <= Date.now() + 20000));
  assert.equal(calls.length, writes);
  assert.deepEqual(rows, before);
  const current = await plan();
  await manageCatalog(operator, { action: "edit_plan", id: current.id, revision: current.revision, definition: { ...current.draft, monthlyPrice: 29 } });
  assert.equal((await verifyCatalogVersion(operator, version.id)).status, "verified");
});
test("verification rejects unauthorized callers, missing or cross-environment versions and incomplete mappings", async () => {
  await initialize(); await publish();
  const [version] = await db.find(catalogVersions);
  providerReads = [];
  await assert.rejects(verifyCatalogVersion(null, version.id), error => error.status === 403);
  await assert.rejects(verifyCatalogVersion(operator, -1), error => error.status === 400);
  await assert.rejects(verifyCatalogVersion(operator, 999), error => error.status === 404);
  environment = "live";
  await assert.rejects(verifyCatalogVersion(operator, version.id), /original PayPal environment/);
  environment = "sandbox";
  await db.update(catalogVersions, { id: version.id }, { yearRequest: { ...version.yearRequest, providerId: null } });
  await assert.rejects(verifyCatalogVersion(operator, version.id), /incomplete/);
  assert.equal(providerReads.length, 0);
});
test("verification never accepts remote product drift, plan term drift or removed resources", async () => {
  await initialize(); await publish();
  const [version] = await db.find(catalogVersions), product = resource(version.productRequest.providerId);
  const originalName = product.input.name;
  product.input.name = "Changed remotely";
  await assert.rejects(verifyCatalogVersion(operator, version.id), /immutable catalog snapshot/);
  product.input.name = originalName;
  resource(version.monthRequest.providerId).input.plan.monthlyPrice = 1;
  await assert.rejects(verifyCatalogVersion(operator, version.id));
  resource(version.monthRequest.providerId).input.plan.monthlyPrice = version.definition.monthlyPrice;
  for (const [key, value] of resources) if (value.id === version.yearRequest.providerId) resources.delete(key);
  await assert.rejects(verifyCatalogVersion(operator, version.id), error => error.providerStatus === 404);
});
test("Free verification is explicitly local-only and pending versions cannot be declared connected", async () => {
  await initialize(); await publish("free");
  const [free] = await db.find(catalogVersions);
  assert.equal((await verifyCatalogVersion(operator, free.id)).status, "local_only");
  assert.equal(providerReads.length, 0);
  failMonth = true;
  await assert.rejects(publish());
  const pending = (await db.find(catalogVersions)).find(version => version.status === "pending");
  const before = providerReads.length;
  await assert.rejects(verifyCatalogVersion(operator, pending.id), /Publish or reconcile/);
  assert.equal(providerReads.length, before);
});
test("catalog revisions publish only on an explicit administrator publication request, not draft edits or queue approval", async () => {
  await initialize();
  const current = await plan();
  await manageCatalog(operator, { action: "edit_plan", id: current.id, revision: current.revision, definition: { ...current.draft, monthlyPrice: 29 } });
  await assert.rejects(manageCatalog(operator, { action: "approve_publication", id: current.id, revision: current.revision + 1 }), error => error.status === 400);
  assert.equal((await db.find(catalogVersions)).length, 0);
  assert.equal(calls.length, 0);
  assert.equal(providerReads.length, 0);
  await assert.rejects(getPurchasablePlan("starter_ai", "month"));
  await publish();
  const [version] = await db.find(catalogVersions);
  assert.equal(version.status, "published");
  assert.deepEqual(version.approval, { userId: operator.user.id, accountKey: "isolated-sandbox" });
  assert.equal(calls.length, 3);
  assert.equal(version.definition.monthlyPrice, 29);
  assert.equal((await getPurchasablePlan("starter_ai", "month")).versionId, version.id);
  assert.ok((rows.get("audit_logs") ?? []).some(row => row.action === "admin.catalog.published"));
});
test("republishing the selected unchanged plan verifies existing resources without creating duplicates or publishing other plans", async () => {
  await initialize(); await publish();
  const [version] = await db.find(catalogVersions);
  const creates = calls.length;
  providerReads = [];
  await publish();
  assert.equal(calls.length, creates);
  assert.equal(providerReads.length, 3);
  assert.equal((await db.find(catalogVersions)).length, 1);
  assert.equal((await db.find(catalogPlans)).filter(plan => Object.keys(plan.currentVersions).length > 0).length, 1);
  const product = resource(version.productRequest.providerId);
  product.input.name = "Changed outside POSTIF-AI";
  await assert.rejects(publish(), /immutable catalog snapshot/);
  assert.equal(calls.length, creates, "A changed published resource must not be silently replaced.");
});
