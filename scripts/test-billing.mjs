import "./register-ts.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
const { getPlanDefinition, SUBSCRIPTION_PLANS } = await import("../src/lib/plans.ts");
globalThis.__paypalCatalog = new Map();
globalThis.__paypalFree = getPlanDefinition("free");
globalThis.__paypalContext = null;
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/src/lib/billing-catalog.ts")) return { format: "module", shortCircuit: true, source: `
      export async function getPurchasablePlan(slug, interval, version) {
        const mapping = globalThis.__paypalCatalog.get(slug + ':' + interval);
        if (!mapping || version !== undefined && version !== mapping.versionId) throw new Error('Stale/unpublished catalog version');
        return structuredClone(mapping);
      }
      export async function getFreePlan() {return structuredClone(globalThis.__paypalFree);}
    ` };
    if (url.endsWith("/src/lib/auth.ts")) return { format: "module", shortCircuit: true, source: "export async function getAuthContext(){return globalThis.__paypalContext;}" };
    return nextLoad(url, context);
  },
});
const { db } = await import("../src/db/index.ts");
const { billingSubscriptions, billingIntents, billingPayments, billingGrants, billingEvents, billingReversals, billingCreditLots } = await import("../src/db/billing-schema.ts");
const { workspaces } = await import("../src/db/schema.ts");
const { allowanceWindow, billingAnniversary, paidTransactionWindow, replacementCreditAmount } = await import("../src/lib/billing-policy.ts");
const { getWorkspaceEntitlements } = await import("../src/lib/entitlements.ts");
const { getBillingReadiness, validateBillingConfig, verifyPayPalWebhook, verifyPayPalPlan, moneyCents, trustedPayPalUrl, createPayPalPlan, renamePayPalPlan, paypalRequest, checkPayPalCatalogConnection } = await import("../src/lib/paypal.ts");
const { listPayPalCatalog, readPayPalCatalogPlan } = await import("../src/lib/paypal-catalog.ts");
const { withWorkerDeadline } = await import("../src/lib/worker-network.ts");
const { createBillingCheckout, changeBillingSubscription, confirmBillingCheckout, reconcilePayPalSubscription, refreshSubscriptionAllowances, processBillingEvent, invalidatePayPalPayment, getPaidSubscriptionMrr } = await import("../src/lib/subscriptions.ts");
const checkoutRoute = await import("../src/app/api/billing/checkout/route.ts");
const billingRoute = await import("../src/app/api/billing/route.ts");
const webhookRoute = await import("../src/app/api/billing/webhook/route.ts");

function fixture(t) {
  const originalFetch = globalThis.fetch;
  const originalDb = Object.fromEntries(["find", "insert", "update", "upsert", "transaction", "withLease"].map(key => [key, db[key]]));
  const settings = { BILLING_ENABLED: "true", BILLING_APP_URL: "https://billing.example.test", PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: `offline-client-${crypto.randomUUID()}`, PAYPAL_CLIENT_SECRET: "offline-secret", PAYPAL_WEBHOOK_ID: "offline-webhook" };
  const originalEnv = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  globalThis.__paypalCatalog.clear();
  globalThis.__paypalContext = { workspace: { id: 7 }, memberRole: "owner", user: { email: "owner@example.test" } };
  t.after(() => {
    Object.assign(db, originalDb); globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const tables = new Map(), leases = new Set(), calls = [];
  let sequence = 100;
  const rows = model => tables.get(model.name) || (tables.set(model.name, []), tables.get(model.name));
  const same = (a, b) => a instanceof Date && b instanceof Date ? +a === +b : a === b;
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === "$or") return value.some(part => matches(row, part));
      const actual = row[key];
      if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
        return Object.entries(value).every(([op, wanted]) => {
          if (op === "$in") return wanted.some(item => same(actual, item));
          if (op === "$ne") return !same(actual, wanted);
          if (op === "$gt") return actual != null && actual > wanted;
          if (op === "$gte") return actual != null && actual >= wanted;
          if (op === "$lt") return actual != null && actual < wanted;
          if (op === "$lte") return actual != null && actual <= wanted;
          throw new Error(`Unsupported fixture operator ${op}`);
        });
      }
      return same(actual, value);
    });
  }
  const repo = {
    async find(model, filter = {}, options = {}) {
      const result = rows(model).filter(row => matches(row, filter));
      if (options.sort) result.sort((a, b) => { for (const [key, order] of Object.entries(options.sort)) { if (a[key] < b[key]) return -order; if (a[key] > b[key]) return order; } return 0; });
      return structuredClone(options.limit ? result.slice(0, options.limit) : result);
    },
    async insert(model, values, options = {}) {
      const result = [];
      for (const value of Array.isArray(values) ? values : [values]) {
        const record = { ...model.defaults(), id: ++sequence, ...structuredClone(value) };
        if (model.unique.some(key => record[key] !== undefined && rows(model).some(item => same(item[key], record[key])))) {
          if (options.ignoreDuplicates) continue;
          throw new Error("Duplicate fixture key");
        }
        rows(model).push(record); result.push(structuredClone(record));
      }
      return result;
    },
    async update(model, filter, values) {
      return rows(model).filter(row => matches(row, filter)).map(row => {
        for (const [key, value] of Object.entries(values)) if (value !== undefined) row[key] = structuredClone(value);
        return structuredClone(row);
      });
    },
    async upsert(model, key, initial, changes) {
      const [record] = await repo.find(model, { [key]: initial[key] });
      return record ? repo.update(model, { id: record.id }, changes) : repo.insert(model, { ...initial, ...changes });
    },
    async transaction(operation) { return operation(repo); },
    async withLease(key, operation, fallback) {
      if (leases.has(key)) return fallback;
      leases.add(key); try { return await operation(); } finally { leases.delete(key); }
    },
  };
  Object.assign(db, repo);
  rows(workspaces).push({ ...workspaces.defaults(), id: 7, ownerId: 1, aiCreditsBalance: 0 });
  const plan = structuredClone(getPlanDefinition("starter_ai"));
  const mapping = { versionId: 7, definition: plan, paypalPlanId: "P-MONTH", paypalProductId: "PROD-AAAAAAAAAAAAAAAAA" };
  globalThis.__paypalCatalog.set("starter_ai:month", mapping);
  const start = new Date(Date.now() - 60000), end = billingAnniversary(start, 1, "month");
  const state = { remote: null, transactions: [], failCreate: false, failGet: false, verify: "SUCCESS", planStatus: "ACTIVE", mapping, start, end };
  function providerPlan(id) {
    const value = [...globalThis.__paypalCatalog.values()].find(item => item.paypalPlanId === id) || mapping;
    const interval = [...globalThis.__paypalCatalog.entries()].find(([, item]) => item.paypalPlanId === id)?.[0].endsWith(":year") ? "year" : "month";
    return { id, status: state.planStatus, product_id: value.paypalProductId,
      billing_cycles: [{ tenure_type: "REGULAR", sequence: 1, total_cycles: 0, frequency: { interval_unit: interval === "year" ? "YEAR" : "MONTH", interval_count: 1 },
        pricing_scheme: { fixed_price: { currency_code: "USD", value: ((interval === "year" ? value.definition.annualMonthlyPrice * 12 : value.definition.monthlyPrice)).toFixed(2) } } }],
      payment_preferences: { auto_bill_outstanding: value.paymentPolicy?.autoBillOutstanding ?? false,
        payment_failure_threshold: value.paymentPolicy?.paymentFailureThreshold ?? 1, setup_fee: { currency_code: "USD", value: "0.00" } } };
  }
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url), body = options.body && options.headers?.["Content-Type"] === "application/json" ? JSON.parse(options.body) : null;
    calls.push({ url: parsed.href, path: parsed.pathname, method: options.method || "GET", requestId: options.headers?.["PayPal-Request-Id"], body });
    if (parsed.pathname === "/v1/oauth2/token") return Response.json({ access_token: "offline-token", expires_in: 3600 });
    if (parsed.pathname.startsWith("/v1/customer/disputes/")) return Response.json(state.dispute);
    if (parsed.pathname === "/v1/notifications/verify-webhook-signature") return Response.json({ verification_status: state.verify });
    if (parsed.pathname === "/v1/billing/subscriptions" && options.method === "POST") {
      if (state.remote?.custom_id !== body.custom_id) {
        state.remote = { id: state.nextSubscriptionId || "I-SUB001", status: "APPROVAL_PENDING", plan_id: body.plan_id, custom_id: body.custom_id, quantity: "1", start_time: (state.nextStart || start).toISOString(),
          subscriber: { payer_id: "PAYER001" }, links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=OFFLINE" }] };
      }
      if (state.failCreate) { state.failCreate = false; throw new Error("Uncertain provider result"); }
      return Response.json({ id: state.remote.id, status: state.remote.status, links: state.remote.links });
    }
    if (parsed.pathname.endsWith("/transactions")) return Response.json({ transactions: state.transactions });
    if (parsed.pathname.endsWith("/cancel")) { state.remote.status = "CANCELLED"; return new Response(null, { status: 204 }); }
    if (parsed.pathname.endsWith("/revise")) return Response.json({ links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/approve?token=OFFLINE-REVISION" }] });
    if (parsed.pathname.startsWith("/v1/billing/subscriptions/")) { if (state.failGet) throw new Error("Offline outage"); return Response.json({ ...state.remote, ...state.getOverrides }); }
    if (parsed.pathname === "/v1/billing/plans" && options.method === "POST") return Response.json({ id: "P-CREATED" });
    if (parsed.pathname.startsWith("/v1/billing/plans/") && options.method === "PATCH") return new Response(null, { status: 204 });
    if (parsed.pathname.startsWith("/v1/billing/plans/")) return Response.json(providerPlan(parsed.pathname.split("/").at(-1)));
    throw new Error(`Unexpected fixture request ${parsed.pathname}`);
  };
  async function paid() {
    await createBillingCheckout(7, "starter_ai", "month", 7);
    state.remote.status = "ACTIVE";
    state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "19.00" }, time: start.toISOString() }, next_billing_time: end.toISOString() };
    state.transactions = [{ id: "SALE001", status: "COMPLETED", time: start.toISOString(), amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "19.00" } } }];
    await reconcilePayPalSubscription("I-SUB001");
  }
  return { rows, state, calls, paid, providerPlan };
}

test("PayPal configuration is explicit, Sandbox defaults safely and errors contain names only", () => {
  assert.equal(getBillingReadiness({}).enabled, false);
  assert.throws(() => validateBillingConfig({ BILLING_ENABLED: "true" }), /PAYPAL_CLIENT_SECRET/);
  assert.doesNotThrow(() => validateBillingConfig({ BILLING_ENABLED: "false" }));
  const env = { BILLING_ENABLED: "true", BILLING_APP_URL: "https://app.example.test", PAYPAL_CLIENT_ID: "offline", PAYPAL_CLIENT_SECRET: "secret-marker", PAYPAL_WEBHOOK_ID: "webhook" };
  assert.equal(getBillingReadiness(env).ready, true);
  assert.equal(getBillingReadiness({ ...env, PAYPAL_ENVIRONMENT: "arbitrary" }).ready, false);
  assert.equal(getBillingReadiness({ ...env, BILLING_APP_URL: "http://localhost" }).ready, false);
  assert.doesNotMatch(JSON.stringify(getBillingReadiness(env)), /secret-marker/);
});
test("monthly and annual anniversaries retain their anchor and stop at the paid boundary", () => {
  const start = new Date("2024-01-31T12:15:00Z"), end = new Date("2025-01-31T12:15:00Z");
  const window = allowanceWindow(start, end, new Date("2024-03-01"));
  assert.equal(window.start.toISOString(), "2024-02-29T12:15:00.000Z");
  assert.equal(window.end.toISOString(), "2024-03-31T12:15:00.000Z");
  assert.equal(allowanceWindow(start, end, end), null);
  assert.equal(paidTransactionWindow(start, new Date("2024-03-05"), "month").start.toISOString(), "2024-02-29T12:15:00.000Z");
  assert.equal(paidTransactionWindow(start, new Date("2024-01-01"), "month"), null);
});
test("replacement compensation prorates verified cents over the paid period and rounds up", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date("2026-01-31T00:00:00Z");
  assert.equal(replacementCreditAmount(900, start, end, start), 270);
  assert.equal(replacementCreditAmount(900, start, end, new Date("2026-01-16T00:00:00Z")), 135);
  assert.equal(replacementCreditAmount(900, start, end, new Date(end.getTime() - 1)), 1);
  assert.equal(replacementCreditAmount(900, start, end, end), 0);
  assert.throws(() => replacementCreditAmount(900, start, end, new Date(start.getTime() - 1)), /reconciliation/);
  assert.throws(() => replacementCreditAmount(-1, start, end, start), /reconciliation/);
});
test("paid plans require full USD regular cycles; archived plans may still renew existing contracts", t => {
  const { providerPlan, state } = fixture(t), plan = providerPlan("P-MONTH");
  verifyPayPalPlan(plan, state.mapping.definition, "month", state.mapping.paypalProductId);
  for (const value of [{ ...plan, product_id: "other" }, { ...plan, billing_cycles: [...plan.billing_cycles, plan.billing_cycles[0]] },
    { ...plan, payment_preferences: { ...plan.payment_preferences, setup_fee: { currency_code: "USD", value: "1" } } }]) {
    assert.throws(() => verifyPayPalPlan(value, state.mapping.definition, "month", state.mapping.paypalProductId));
  }
  assert.throws(() => verifyPayPalPlan({ ...plan, status: "INACTIVE" }, state.mapping.definition, "month", state.mapping.paypalProductId));
  assert.doesNotThrow(() => verifyPayPalPlan({ ...plan, status: "INACTIVE" }, state.mapping.definition, "month", state.mapping.paypalProductId, true));
  assert.equal(moneyCents({ currency_code: "EUR", value: "19" }), null);
  assert.equal(moneyCents({ currency_code: "USD", value: "-19" }), null);
});
test("the REST adapter creates exact annual USD plans with durable request IDs and no trials", async t => {
  const { calls } = fixture(t);
  await createPayPalPlan({ productId: "PROD-AAAAAAAAAAAAAAAAA", plan: getPlanDefinition("starter_ai"), interval: "year" }, "offline-request");
  const call = calls.find(item => item.path === "/v1/billing/plans");
  assert.equal(call.requestId, "offline-request");
  assert.equal(call.body.name, "POSTIF-AI Starter AI \u2014 Yearly");
  assert.equal(call.body.description, getPlanDefinition("starter_ai").description);
  assert.equal(call.body.billing_cycles[0].pricing_scheme.fixed_price.value, "180.00");
  assert.equal(call.body.billing_cycles.length, 1);
  assert.ok(calls.every(item => item.url.startsWith("https://api-m.sandbox.paypal.com/")));
});
test("new PayPal plans use the branded monthly/yearly naming pattern and reject oversized names before requests", async t => {
  const { calls } = fixture(t);
  for (const interval of ["month", "year"]) {
    await createPayPalPlan({ productId: "POSTIF-AI", plan: getPlanDefinition("starter_byok"), interval }, `offline-${interval}`);
  }
  assert.deepEqual(calls.filter(call => call.path === "/v1/billing/plans").map(call => call.body.name),
    ["POSTIF-AI Starter BYOK \u2014 Monthly", "POSTIF-AI Starter BYOK \u2014 Yearly"]);
  const before = calls.length;
  await assert.rejects(createPayPalPlan({ productId: "POSTIF-AI", plan: { ...getPlanDefinition("starter_byok"), name: "x".repeat(127) }, interval: "month" }, "offline-long-name"), /127 characters/);
  assert.equal(calls.length, before);
});
test("PayPal rejection diagnostics expose only safe operation, validation fields and correlation IDs", async t => {
  fixture(t);
  const originalError = console.error, logs = [];
  console.error = (...args) => logs.push(args);
  t.after(() => { console.error = originalError; });
  globalThis.fetch = async (url) => new URL(url).pathname === "/v1/oauth2/token"
    ? Response.json({ access_token: "offline-token", expires_in: 3600 })
    : Response.json({ name: "INVALID_REQUEST", debug_id: "abc123def4567", message: "private-message-marker",
      details: [
        { issue: "INVALID_PARAMETER_VALUE", field: "/product_id", value: "private-input-marker", description: "private-description-marker" },
        { issue: "INVALID_STRING_PATTERN", field: "/1/value", value: "private-description-marker" },
        { issue: "UNSUPPORTED_PATCH_OPERATION", field: "/0/op" },
        { issue: "private-unknown-marker", field: "/subscriber/private-email-marker", value: "private-input-marker" },
      ], access_token: "private-token-marker",
    }, { status: 400 });
  await assert.rejects(createPayPalPlan({ productId: "POSTIF-AI", plan: getPlanDefinition("starter_byok"), interval: "year" }, "offline-rejected-request"), error => {
    assert.equal(error.status, 502);
    assert.equal(error.providerStatus, 400);
    assert.match(error.message, /create_plan.*HTTP 400/);
    assert.match(error.message, /INVALID_PARAMETER_VALUE at \/product_id/);
    assert.match(error.message, /INVALID_STRING_PATTERN at \/1\/value/);
    assert.match(error.message, /UNSUPPORTED_PATCH_OPERATION at \/0\/op/);
    assert.match(error.message, /abc123def4567/);
    assert.equal(error.providerFailure.operation, "create_plan");
    assert.doesNotMatch(JSON.stringify({ message: error.message, diagnostic: error.providerFailure, logs }), /private-|offline-secret/);
    return true;
  });
});
test("renaming a PayPal plan patches only its name and rejects invalid input before requests", async t => {
  const { calls } = fixture(t);
  const name = "POSTIF-AI Starter BYOK \u2014 Monthly";
  await renamePayPalPlan("P-EXISTING", name);
  const patches = calls.filter(call => call.method === "PATCH");
  assert.equal(patches.length, 1);
  assert.equal(patches[0].path, "/v1/billing/plans/P-EXISTING");
  assert.deepEqual(patches[0].body, [{ op: "replace", path: "/name", value: name }]);
  const before = calls.length;
  await assert.rejects(renamePayPalPlan("P-EXISTING", ""), /1-127/);
  await assert.rejects(renamePayPalPlan("P-EXISTING", "x".repeat(128)), /1-127/);
  await assert.rejects(renamePayPalPlan("../invalid", name), /identifier/);
  assert.equal(calls.length, before);
});
test("plan create and rename reject literal line breaks before any provider request", async t => {
  const { calls } = fixture(t);
  for (const lineBreak of ["\n", "\r\n", "\r", "\u0085", "\u2028", "\u2029"]) {
    const description = `First line.${lineBreak}Second line.`;
    await assert.rejects(renamePayPalPlan("P-EXISTING", "Valid name", description), /descriptions must not contain line breaks/);
    await assert.rejects(createPayPalPlan({ productId: "POSTIF-AI", plan: { ...getPlanDefinition("starter_byok"), description }, interval: "month" }, "invalid-description"), /descriptions must not contain line breaks/);
    await assert.rejects(renamePayPalPlan("P-EXISTING", `Invalid${lineBreak}name`), /names must not contain line breaks/);
    await assert.rejects(createPayPalPlan({ productId: "POSTIF-AI", plan: { ...getPlanDefinition("starter_byok"), name: `Invalid${lineBreak}name` }, interval: "year" }, "invalid-name"), /names must not contain line breaks/);
  }
  assert.equal(calls.length, 0);
});
test("updating plan details reads and adds an absent description and validates input before network calls", async t => {
  const { calls } = fixture(t);
  await renamePayPalPlan("P-EXISTING", "POSTIF-AI Revised \u2014 Monthly", "A real plan description.");
  assert.deepEqual(calls.find(call => call.method === "PATCH").body, [
    { op: "replace", path: "/name", value: "POSTIF-AI Revised \u2014 Monthly" },
    { op: "add", path: "/description", value: "A real plan description." },
  ]);
  assert.ok(calls.some(call => call.method === "GET" && call.path === "/v1/billing/plans/P-EXISTING"));
  const before = calls.length;
  for (const description of ["", " ", "x".repeat(128)]) {
    await assert.rejects(renamePayPalPlan("P-EXISTING", "Valid name", description), /descriptions require/);
    await assert.rejects(createPayPalPlan({ productId: "POSTIF-AI", plan: { ...getPlanDefinition("starter_byok"), description }, interval: "month" }, "invalid-description"), /descriptions require/);
  }
  assert.equal(calls.length, before);
});
test("existing descriptions, including empty strings, are replaced using the fresh exact-ID provider record", async t => {
  const { calls } = fixture(t);
  for (const description of ["Old description", ""]) {
    await renamePayPalPlan("P-EXISTING", "New name", "Updated description", { id: "P-EXISTING", description });
  }
  assert.deepEqual(calls.filter(call => call.method === "PATCH").map(call => call.body), [0, 1].map(() => [
    { op: "replace", path: "/name", value: "New name" },
    { op: "replace", path: "/description", value: "Updated description" },
  ]));
  assert.ok(!calls.some(call => call.method === "GET"), "The caller already supplied a fresh provider record.");
  const before = calls.length;
  for (const remote of [{ id: "P-OTHER" }, { id: "P-EXISTING", description: null }]) {
    await assert.rejects(renamePayPalPlan("P-EXISTING", "New name", "Updated description", remote), /invalid plan metadata/);
  }
  assert.equal(calls.length, before, "Wrong IDs and invalid metadata must never trigger a PATCH.");
});
test("adopting existing plans rejects additional charges and reports specific billing-policy mismatches", t => {
  const { providerPlan, state } = fixture(t), remote = providerPlan("P-MONTH");
  for (const [changes, reason] of [
    [{ taxes: { percentage: "5", inclusive: false } }, /taxes/],
    [{ quantity_supported: true }, /quantity/],
    [{ billing_cycles: [{ ...remote.billing_cycles[0], pricing_scheme: { ...remote.billing_cycles[0].pricing_scheme, pricing_model: "VOLUME" } }] }, /volume pricing/],
    [{ payment_preferences: { ...remote.payment_preferences, payment_failure_threshold: -1 } }, /payment failure threshold/],
  ]) assert.throws(() => verifyPayPalPlan({ ...remote, ...changes }, state.mapping.definition, "month", state.mapping.paypalProductId), reason);
  const noSetupFee = { ...remote, payment_preferences: { ...remote.payment_preferences } };
  delete noSetupFee.payment_preferences.setup_fee;
  assert.doesNotThrow(() => verifyPayPalPlan(noSetupFee, state.mapping.definition, "month", state.mapping.paypalProductId));
});
test("existing PayPal retry policies are valid independently of application defaults and remain bound to their published snapshot", t => {
  const { providerPlan, state } = fixture(t), remote = providerPlan("P-MONTH");
  for (const [automatic, threshold] of [[true, 3], [true, 0], [false, 5], [false, 999]]) {
    const policy = { autoBillOutstanding: automatic, paymentFailureThreshold: threshold };
    const selected = { ...remote, payment_preferences: { ...remote.payment_preferences, auto_bill_outstanding: automatic, payment_failure_threshold: threshold } };
    assert.doesNotThrow(() => verifyPayPalPlan(selected, state.mapping.definition, "month", state.mapping.paypalProductId, false, policy));
    assert.throws(() => verifyPayPalPlan(selected, state.mapping.definition, "month", state.mapping.paypalProductId, false,
      { ...policy, autoBillOutstanding: !automatic }), /payment policy changed/);
  }
  for (const threshold of [-1, 1000, 1.5, undefined]) {
    assert.throws(() => verifyPayPalPlan({ ...remote, payment_preferences: { ...remote.payment_preferences, payment_failure_threshold: threshold } },
      state.mapping.definition, "month", state.mapping.paypalProductId), /payment failure threshold/);
  }
});
test("checkout preserves an imported PayPal policy and renewal rejects later provider policy drift without resetting credits", async t => {
  const { state, paid, rows } = fixture(t);
  state.mapping.paymentPolicy = { autoBillOutstanding: true, paymentFailureThreshold: 3 };
  await paid();
  assert.deepEqual(rows(billingIntents)[0].paymentPolicy, { autoBillOutstanding: true, paymentFailureThreshold: 3 });
  rows(workspaces)[0].aiCreditsBalance = 17;
  state.mapping.paymentPolicy = { autoBillOutstanding: true, paymentFailureThreshold: 5 };
  await assert.rejects(reconcilePayPalSubscription("I-SUB001"), /payment policy changed/);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 17);
});
for (const interval of ["month", "year"]) test(`automatic ${interval} arrears settlement activates only the current period and never duplicates credits`, async t => {
  const { state, rows } = fixture(t);
  const mapping = { ...state.mapping, paypalPlanId: interval === "year" ? "P-YEAR" : "P-MONTH",
    paymentPolicy: { autoBillOutstanding: true, paymentFailureThreshold: 0 } };
  globalThis.__paypalCatalog.set(`starter_ai:${interval}`, mapping);
  const amount = Math.round((interval === "year" ? mapping.definition.annualMonthlyPrice * 12 : mapping.definition.monthlyPrice) * 100) * 2;
  const money = { currency_code: "USD", value: (amount / 100).toFixed(2) };
  state.nextStart = billingAnniversary(state.start, -2, interval);
  await createBillingCheckout(7, "starter_ai", interval, 7);
  state.remote.status = "ACTIVE";
  const end = billingAnniversary(state.start, 1, interval);
  state.remote.billing_info = { last_payment: { amount: money, time: state.start.toISOString() },
    next_billing_time: end.toISOString(), outstanding_balance: { currency_code: "USD", value: "0.00" } };
  state.transactions = [{ id: "SALE-ARREARS", status: "COMPLETED", time: state.start.toISOString(), amount_with_breakdown: { gross_amount: money } }];
  assert.equal(await reconcilePayPalSubscription("I-SUB001"), true);
  assert.equal(rows(billingPayments)[0].amountPaid, amount);
  assert.equal(rows(billingPayments)[0].periodEnd.toISOString(), end.toISOString());
  assert.ok(+rows(billingPayments)[0].periodStart > +state.nextStart);
  assert.equal(rows(billingGrants).length, 1);
  rows(workspaces)[0].aiCreditsBalance = 13;
  await reconcilePayPalSubscription("I-SUB001");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 13);
  assert.equal(rows(billingGrants).length, 1);
});
test("ambiguous or partially settled overdue collections fail explicitly without granting access", async t => {
  const { state, rows } = fixture(t);
  state.mapping.paymentPolicy = { autoBillOutstanding: true, paymentFailureThreshold: 3 };
  state.nextStart = billingAnniversary(state.start, -2, "month");
  await createBillingCheckout(7, "starter_ai", "month", 7);
  const money = { currency_code: "USD", value: "38.00" };
  const info = { last_payment: { amount: money, time: state.start.toISOString() },
    next_billing_time: state.end.toISOString(), outstanding_balance: { currency_code: "USD", value: "0.00" } };
  for (const changes of [
    { outstanding_balance: undefined }, { outstanding_balance: { currency_code: "USD", value: "19.00" } },
    { next_billing_time: undefined }, { last_payment: { amount: { currency_code: "USD", value: "19.00" }, time: state.start.toISOString() } },
    { amount: { currency_code: "USD", value: "28.50" } }, { amount: { currency_code: "USD", value: "190.00" } },
  ]) {
    state.remote.status = "ACTIVE";
    state.remote.billing_info = { ...info, ...changes };
    state.transactions = [{ id: "SALE-UNCERTAIN", status: "COMPLETED", time: state.start.toISOString(),
      amount_with_breakdown: { gross_amount: changes.amount ?? money } }];
    await assert.rejects(reconcilePayPalSubscription("I-SUB001"), /overdue collection requires reconciliation/);
    assert.equal(rows(billingPayments).length, 0);
    assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  }
});
test("catalog connection checks authenticate and read provider lists only, rejecting malformed totals", async t => {
  fixture(t);
  const calls = [];
  let malformed = false;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: options.method });
    if (path === "/v1/oauth2/token") return Response.json({ access_token: "offline-token", expires_in: 3600 });
    if (path === "/v1/catalogs/products") return Response.json({ products: [{ id: "PROD-TEST" }], total_items: malformed ? undefined : 1 });
    if (path === "/v1/billing/plans") return Response.json({ plans: [{ id: "P-TEST" }], total_items: 1 });
    throw new Error("Unexpected provider mutation");
  };
  assert.equal((await checkPayPalCatalogConnection()).products, 1);
  assert.ok(calls.every(call => call.path === "/v1/oauth2/token" ? call.method === "POST" : call.method === "GET"));
  malformed = true;
  await assert.rejects(checkPayPalCatalogConnection(), /invalid catalog listing/);
});
test("remote catalog browsing preserves external products/plans, paginates and strips private provider fields", async t => {
  fixture(t);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    if (parsed.pathname === "/v1/oauth2/token") return Response.json({ access_token: "offline-token", expires_in: 3600 });
    if (parsed.pathname === "/v1/catalogs/products") return Response.json({
      products: [{ id: "PROD-EXTERNAL", name: "Existing product", description: "External product", secret: "provider-private-marker" }],
      total_items: 21, links: [{ href: "https://untrusted.example.test" }],
    });
    if (parsed.pathname === "/v1/billing/plans") return Response.json({
      plans: [{ id: "P-EXTERNAL", name: "Legacy plan", status: "INACTIVE", product_id: "PROD-EXTERNAL", secret: "provider-private-marker" }], total_items: 1,
    });
    throw new Error("Unexpected provider endpoint");
  };
  const products = await listPayPalCatalog("products", 2);
  assert.equal(products.pages, 2);
  assert.equal(products.page, 2);
  assert.equal(products.items[0].name, "Existing product");
  assert.equal(products.items[0].status, null);
  const plans = await listPayPalCatalog("plans");
  assert.equal(plans.items[0].status, "INACTIVE");
  assert.equal(plans.items[0].productId, "PROD-EXTERNAL");
  assert.doesNotMatch(JSON.stringify({ products, plans }), /provider-private-marker|untrusted/);
  const reads = calls.filter(call => call.url.pathname !== "/v1/oauth2/token");
  assert.ok(reads.every(call => call.options.method === "GET" && call.options.cache === "no-store"));
  assert.equal(reads[0].url.searchParams.get("page"), "2");
  assert.equal(reads[0].url.searchParams.get("page_size"), "20");
  assert.equal(reads[0].url.searchParams.get("total_required"), "true");
  const previous = calls.length;
  for (const page of [0, -1, 1.5, 100001, NaN]) await assert.rejects(listPayPalCatalog("products", page), error => error.status === 400);
  await assert.rejects(listPayPalCatalog("unknown"), error => error.status === 400);
  assert.equal(calls.length, previous);
});
test("remote catalog rejects malformed provider data instead of reporting an empty success", async t => {
  fixture(t);
  let payload;
  globalThis.fetch = async url => new URL(url).pathname === "/v1/oauth2/token" ?
    Response.json({ access_token: "offline-token", expires_in: 3600 }) : Response.json(payload);
  for (payload of [{ products: [], total_items: -1 }, { products: [{ id: "../bad", name: "Bad" }], total_items: 1 },
    { products: [{ id: "P", name: "One" }, { id: "P", name: "Two" }], total_items: 2 },
    { products: [{ id: "P", name: "One" }], total_items: 0 }, { products: [] }]) {
    await assert.rejects(listPayPalCatalog("products"), /invalid catalog listing/);
  }
  payload = { plans: [{ id: "P", name: "No status" }], total_items: 1 };
  await assert.rejects(listPayPalCatalog("plans"), /invalid catalog listing/);
  payload = { products: [], total_items: 0 };
  assert.deepEqual((await listPayPalCatalog("products")).items, []);
});
test("external plan details retain their actual non-USD price and cycles without inventing app entitlements", async t => {
  const { providerPlan } = fixture(t);
  let payload = providerPlan("P-EXTERNAL");
  payload.name = "External annual EUR";
  payload.billing_cycles[0].frequency.interval_unit = "YEAR";
  payload.billing_cycles[0].pricing_scheme.fixed_price = { currency_code: "EUR", value: "30.00" };
  payload.secret = "private-provider-marker";
  globalThis.fetch = async url => new URL(url).pathname === "/v1/oauth2/token" ?
    Response.json({ access_token: "offline-token", expires_in: 3600 }) : Response.json(payload);
  const detail = await readPayPalCatalogPlan("P-EXTERNAL");
  assert.equal(detail.cycles[0].price.currency_code, "EUR");
  assert.equal(detail.cycles[0].price.value, "30.00");
  assert.equal(detail.cycles[0].interval, "YEAR");
  assert.doesNotMatch(JSON.stringify(detail), /private-provider-marker|payment_preferences/);
  payload = { ...payload, id: "P-WRONG" };
  await assert.rejects(readPayPalCatalogPlan("P-EXTERNAL"), /invalid plan details/);
  await assert.rejects(readPayPalCatalogPlan("../bad"), error => error.status === 400);
});
test("provider not-found status survives safe API error mapping for product reconciliation", async t => {
  fixture(t);
  globalThis.fetch = async url => new URL(url).pathname === "/v1/oauth2/token" ?
    Response.json({ access_token: "offline-token", expires_in: 3600 }) :
    new Response("private-provider-body-marker", { status: 404 });
  await assert.rejects(paypalRequest("/v1/catalogs/products/PROD-MISSING"), error =>
    error.status === 502 && error.providerStatus === 404 && !error.message.includes("private-provider-body-marker"));
});
test("joining an in-flight OAuth request respects the shorter worker deadline without duplicating authentication", async t => {
  const { calls } = fixture(t), providerFetch = globalThis.fetch;
  let started;
  const start = new Promise(resolve => { started = resolve; });
  globalThis.fetch = async (url, options) => {
    if (new URL(url).pathname === "/v1/oauth2/token") {
      started();
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    return providerFetch(url, options);
  };
  const first = paypalRequest("/v1/billing/plans/P-MONTH");
  await start;
  const began = Date.now();
  await assert.rejects(paypalRequest("/v1/billing/plans/P-MONTH", { deadline: began + 110 }), /deadline reached/);
  assert.ok(Date.now() - began < 500);
  await first;
  assert.equal(calls.filter(item => item.path === "/v1/oauth2/token").length, 1);
});
test("catalog publication requests inherit the Next.js worker deadline without an explicit adapter override", async t => {
  fixture(t);
  globalThis.fetch = async (url, options) => {
    if (new URL(url).pathname === "/v1/oauth2/token") return Response.json({ access_token: "offline-token", expires_in: 3600 });
    return new Promise((resolve, reject) => {
      void resolve;
      const keepAlive = setTimeout(() => reject(new Error("Fixture deadline was not applied")), 2000);
      options.signal.addEventListener("abort", () => { clearTimeout(keepAlive); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  };
  const began = Date.now();
  await assert.rejects(withWorkerDeadline(began + 150, () => createPayPalPlan({
    productId: "PROD-TEST", plan: getPlanDefinition("starter_ai"), interval: "month",
  }, "offline-request")), /could not be reached|deadline/);
  assert.ok(Date.now() - began < 1000);
});
test("malformed provider JSON never exposes response contents or accepts invalid money", async t => {
  fixture(t);
  globalThis.fetch = async () => new Response("credential-like-provider-marker", { status: 200 });
  await assert.rejects(paypalRequest("/v1/billing/plans/P-MONTH"), error =>
    error.message === "PayPal returned an invalid authentication response.");
  assert.equal(moneyCents({ currency_code: "USD", value: 19 }), null);
  assert.throws(() => trustedPayPalUrl("not-a-url"), /invalid approval URL/);
});
test("webhook verification binds the original event and never accepts failure or missing signatures", async t => {
  const { calls, state } = fixture(t);
  const headers = new Headers(Object.fromEntries(["auth-algo", "cert-url", "transmission-id", "transmission-sig", "transmission-time"].map(key => [`paypal-${key}`, "offline"])));
  const event = { id: "WH-TEST", event_type: "BILLING.SUBSCRIPTION.CREATED", create_time: "2026-01-01", resource: { id: "I-SUB001" } };
  await verifyPayPalWebhook(headers, event);
  assert.deepEqual(calls.find(item => item.path.endsWith("verify-webhook-signature")).body.webhook_event, event);
  state.verify = "FAILURE";
  await assert.rejects(verifyPayPalWebhook(headers, event), /Invalid PayPal/);
  await assert.rejects(verifyPayPalWebhook(new Headers(), event), /Missing/);
  assert.equal((await webhookRoute.POST(new Request("https://app.example.test/api/billing/webhook", { method: "POST", body: JSON.stringify(event) }))).status, 400);
});
test("approval redirects accept only the configured PayPal host", t => {
  fixture(t);
  for (const url of ["https://www.paypal.com/approve", "https://www.sandbox.paypal.com.evil.test", "javascript:alert(1)", "https://user:pass@www.sandbox.paypal.com"]) assert.throws(() => trustedPayPalUrl(url));
});
test("uncertain checkout retries reuse the persisted authorization and cannot create a second subscription", async t => {
  const { rows, state, calls } = fixture(t);
  state.failCreate = true;
  await assert.rejects(createBillingCheckout(7, "starter_ai", "month", 7), /pending/);
  const key = rows(billingIntents)[0].requestKey;
  await createBillingCheckout(7, "starter_ai", "month", 7);
  assert.equal(rows(billingIntents).length, 1);
  assert.deepEqual(calls.filter(item => item.path === "/v1/billing/subscriptions").map(item => item.requestId), [key, key]);
  await assert.rejects(createBillingCheckout(7, "other", "month", 7), /pending/);
});
test("minimal subscription creation is verified through a full read before returning approval", async t => {
  const { rows, calls } = fixture(t);
  const url = await createBillingCheckout(7, "starter_ai", "month", 7);
  assert.match(url, /^https:\/\/www\.sandbox\.paypal\.com\//);
  assert.equal(rows(billingIntents)[0].paypalSubscriptionId, "I-SUB001");
  assert.equal(rows(billingIntents)[0].approvalUrl, url);
  assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
  assert.equal(rows(billingGrants).length, 0);
  assert.equal(calls.filter(item => item.path === "/v1/billing/subscriptions/I-SUB001").length, 1);
  await createBillingCheckout(7, "starter_ai", "month", 7);
  assert.equal(calls.filter(item => item.path === "/v1/billing/subscriptions").length, 1);
});
test("a failed post-create read retains the provider ID and retries with GET even beyond idempotency retention", async t => {
  const { rows, state, calls } = fixture(t);
  state.failGet = true;
  await assert.rejects(createBillingCheckout(7, "starter_ai", "month", 7), /could not be reached/);
  assert.equal(rows(billingIntents)[0].paypalSubscriptionId, "I-SUB001");
  assert.equal(rows(billingIntents)[0].approvalUrl, null);
  state.failGet = false;
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 73 * 3600000 });
  await createBillingCheckout(7, "starter_ai", "month", 7);
  assert.equal(calls.filter(item => item.path === "/v1/billing/subscriptions").length, 1);
  assert.equal(rows(billingIntents).length, 1);
  assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
});
for (const [label, overrides] of [
  ["wrong resource ID", { id: "I-OTHER" }],
  ["wrong workspace binding", { custom_id: "unmanaged-binding" }],
  ["wrong plan", { plan_id: "P-OTHER" }],
  ["quantity override", { quantity: "2" }],
  ["plan override", { plan_overridden: true }],
]) {
  test(`checkout rejects a full subscription read with ${label} without exposing approval or repeating creation`, async t => {
    const { rows, state, calls } = fixture(t);
    state.getOverrides = overrides;
    await assert.rejects(createBillingCheckout(7, "starter_ai", "month", 7), /authorization/);
    await assert.rejects(createBillingCheckout(7, "starter_ai", "month", 7), /authorization/);
    assert.equal(rows(billingIntents)[0].paypalSubscriptionId, "I-SUB001");
    assert.equal(rows(billingIntents)[0].approvalUrl, null);
    assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
    assert.equal(calls.filter(item => item.path === "/v1/billing/subscriptions").length, 1);
  });
}
test("checkout authorization is owner-only and ignores client workspace IDs", async t => {
  const { rows } = fixture(t);
  const request = () => new Request("https://app.example.test/api/billing/checkout", { method: "POST", body: JSON.stringify({ workspaceId: 999, planSlug: "starter_ai", billingCycle: "monthly", catalogVersionId: 7 }) });
  globalThis.__paypalContext.memberRole = "admin";
  assert.equal((await checkoutRoute.POST(request())).status, 403);
  globalThis.__paypalContext.memberRole = "owner";
  assert.equal((await checkoutRoute.POST(request())).status, 200);
  assert.equal(rows(billingIntents)[0].workspaceId, 7);
});
test("Free is owner-only, local and independent of PayPal configuration or a billing interval", async t => {
  const { rows, calls } = fixture(t);
  process.env.BILLING_ENABLED = "false";
  for (const key of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "BILLING_APP_URL"]) delete process.env[key];
  const request = () => new Request("https://app.example.test/api/billing", {
    method: "POST", body: JSON.stringify({ action: "change_plan", planSlug: "free", workspaceId: 999 }),
  });
  globalThis.__paypalContext.memberRole = "admin";
  assert.equal((await billingRoute.POST(request())).status, 403);
  globalThis.__paypalContext.memberRole = "owner";
  const response = await billingRoute.POST(request());
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /No PayPal subscription or approval/);
  assert.equal(rows(workspaces)[0].planSlug, "free");
  assert.equal(rows(workspaces)[0].aiBillingMode, "byok");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal(rows(billingIntents).length, 0);
  assert.equal(calls.length, 0);
  await assert.rejects(createBillingCheckout(7, "free", "month", 1), /Free does not require PayPal checkout/);
  assert.equal(calls.length, 0);
});
for (const reconciled of [false, true]) {
  test(`Free locally withdraws an unpaid checkout ${reconciled ? "after" : "before"} its creation webhook and permits another plan`, async t => {
    const { rows, state, calls } = fixture(t);
    await createBillingCheckout(7, "starter_ai", "month", 7);
    if (reconciled) await reconcilePayPalSubscription(state.remote.id);
    const oldIntent = structuredClone(rows(billingIntents)[0]);
    const count = calls.length;
    process.env.BILLING_ENABLED = "false";
    const response = await billingRoute.POST(new Request("https://app.example.test/api/billing", {
      method: "POST", body: JSON.stringify({ action: "change_plan", planSlug: "free" }),
    }));
    assert.equal(response.status, 200);
    assert.match((await response.json()).message, /checkout withdrawn/);
    assert.equal(calls.length, count, "Withdrawing unapproved checkout must not call PayPal.");
    assert.equal(rows(billingIntents)[0].state, "abandoned");
    assert.equal(rows(billingIntents)[0].approvalUrl, null);
    assert.equal(rows(billingIntents)[0].paypalSubscriptionId, oldIntent.paypalSubscriptionId);
    assert.equal(rows(billingSubscriptions)[0].pendingIntentId, null);
    assert.equal(rows(billingSubscriptions)[0].paypalSubscriptionId, null);
    assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "free");
    assert.equal(rows(billingGrants).length, 0);
    process.env.BILLING_ENABLED = "true";
    const next = lifecycleCatalog(state.mapping.paypalProductId).find(plan => plan.slug === "pro_ai" && plan.interval === "month");
    state.nextSubscriptionId = "I-SUB002";
    await createBillingCheckout(7, next.slug, next.interval, next.versionId);
    assert.equal(rows(billingIntents).length, 2);
    assert.equal(rows(billingIntents)[0].state, "abandoned");
    assert.equal(rows(billingSubscriptions)[0].pendingPlanSlug, "pro_ai");
  });
}
test("late approval of a withdrawn checkout stops renewals without restoring its pending state or granting paid access", async t => {
  const { rows, state } = fixture(t);
  await createBillingCheckout(7, "starter_ai", "month", 7);
  await reconcilePayPalSubscription(state.remote.id);
  await changeBillingSubscription(7, "free", "month");
  lifecyclePayment(state, { ...state.mapping, interval: "month" }, state.start, "SALE-WITHDRAWN");
  await lifecycleWebhook("WH-WITHDRAWN-APPROVAL", state);
  assert.equal(state.remote.status, "CANCELLED");
  assert.equal(rows(billingIntents)[0].state, "abandoned");
  assert.equal(rows(billingSubscriptions)[0].pendingIntentId, null);
  assert.equal(rows(billingSubscriptions)[0].paypalSubscriptionId, null);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "free");
  assert.equal(rows(billingPayments).length, 0);
  assert.equal(rows(billingGrants).length, 0);
});
test("Free withdraws a new checkout after an earlier cancelled paid subscription has expired", async t => {
  const { rows, state, calls, paid } = fixture(t);
  await paid();
  await changeBillingSubscription(7, "free", "month");
  t.mock.timers.enable({ apis: ["Date"], now: state.end.getTime() + 1000 });
  await refreshSubscriptionAllowances({ reconcile: false });
  state.nextSubscriptionId = "I-SUB002";
  await createBillingCheckout(7, "starter_ai", "month", 7);
  const pendingId = rows(billingSubscriptions)[0].pendingIntentId;
  assert.equal(rows(billingSubscriptions)[0].status, "CANCELLED");
  const count = calls.length;
  await changeBillingSubscription(7, "free", "month");
  assert.equal(calls.length, count);
  assert.equal(rows(billingIntents).find(intent => intent.id === pendingId).state, "abandoned");
  assert.equal(rows(billingSubscriptions)[0].pendingIntentId, null);
  assert.equal(rows(billingSubscriptions)[0].paypalSubscriptionId, null);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "free");
});
test("provider activation without a completed payment cannot grant access; replay never resets consumed credits", async t => {
  const { rows, state, paid } = fixture(t);
  await createBillingCheckout(7, "starter_ai", "month", 7);
  state.remote.status = "ACTIVE";
  await reconcilePayPalSubscription("I-SUB001");
  assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
  await paid();
  assert.equal(rows(billingGrants).length, 1);
  rows(workspaces)[0].aiCreditsBalance = 210;
  await reconcilePayPalSubscription("I-SUB001");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 210);
  assert.equal(rows(billingPayments).length, 1);
  assert.equal(rows(billingGrants).length, 1);
});
test("wrong currency, underpayment, quantity overrides and cross-workspace bindings cannot activate a term", async t => {
  const { rows, state } = fixture(t);
  await createBillingCheckout(7, "starter_ai", "month", 7);
  state.remote.status = "ACTIVE";
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "19" }, time: state.start.toISOString() }, next_billing_time: state.end.toISOString() };
  for (const amount of [{ currency_code: "USD", value: "18.99" }, { currency_code: "EUR", value: "19" }]) {
    state.transactions = [{ id: "SALE001", status: "COMPLETED", time: state.start.toISOString(), amount_with_breakdown: { gross_amount: amount } }];
    await reconcilePayPalSubscription("I-SUB001");
    assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
  }
  state.remote.quantity = "2";
  await assert.rejects(reconcilePayPalSubscription("I-SUB001"), /authorization/);
  state.remote.quantity = "1"; state.remote.custom_id = "unmanaged-binding";
  assert.equal(await reconcilePayPalSubscription("I-SUB001"), false);
  assert.equal(rows(billingGrants).length, 0);
});
test("out-of-order refunds and later completed-payment replays cannot restore a reversed term", async t => {
  const { rows, paid } = fixture(t);
  await invalidatePayPalPayment("SALE001", "refund");
  await paid();
  assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal(rows(billingReversals).length, 1);
});
test("pending and seller-winning disputes preserve verified access and consumed credits, including late events", async t => {
  const { rows, state, paid } = fixture(t);
  await paid();
  rows(workspaces)[0].aiCreditsBalance = 137;
  state.dispute = { dispute_id: "D-OFFLINE", status: "UNDER_REVIEW", disputed_transactions: [{ seller_transaction_id: "SALE001" }] };
  const resource = { dispute_id: "D-OFFLINE", dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" } };
  await processBillingEvent({ id: "WH-DISPUTE-CREATED", event_type: "CUSTOMER.DISPUTE.CREATED", resource });
  assert.equal((await getWorkspaceEntitlements(7)).paid, true);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137);
  state.dispute.status = "RESOLVED";
  state.dispute.dispute_outcome = { outcome_code: "RESOLVED_SELLER_FAVOUR" };
  await processBillingEvent({ id: "WH-DISPUTE-RESOLVED", event_type: "CUSTOMER.DISPUTE.RESOLVED", resource });
  await processBillingEvent({ id: "WH-DISPUTE-LATE", event_type: "CUSTOMER.DISPUTE.CREATED", resource });
  assert.equal((await getWorkspaceEntitlements(7)).paid, true);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137);
  assert.equal(rows(billingReversals).length, 0);
});
test("backend-confirmed buyer-winning disputes revoke payment and completed-payment replay cannot restore it", async t => {
  const { rows, state, paid } = fixture(t);
  await paid();
  state.dispute = { dispute_id: "D-OFFLINE", status: "RESOLVED", dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" },
    disputed_transactions: [{ seller_transaction_id: "SALE001" }] };
  await processBillingEvent({ id: "WH-DISPUTE-LOST", event_type: "CUSTOMER.DISPUTE.RESOLVED", resource: { dispute_id: "D-OFFLINE" } });
  await reconcilePayPalSubscription("I-SUB001");
  assert.equal((await getWorkspaceEntitlements(7)).paid, false);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal(rows(billingReversals)[0].reason, "dispute_lost");
});
test("cancellation retains paid access until exact expiry and requires a new purchase afterward", async t => {
  const { rows, state, paid } = fixture(t);
  await paid();
  await changeBillingSubscription(7, "free", "month");
  assert.equal(rows(billingSubscriptions)[0].paidThrough.toISOString(), state.end.toISOString());
  assert.equal((await getWorkspaceEntitlements(7)).paid, true);
  await assert.rejects(createBillingCheckout(7, "starter_ai", "month", 7), /paid access/);
  t.mock.timers.enable({ apis: ["Date"], now: state.end.getTime() });
  await refreshSubscriptionAllowances({ reconcile: false });
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "free");
  state.nextStart = new Date(state.end.getTime() + 1000);
  state.nextSubscriptionId = "I-NEW001";
  t.mock.timers.setTime(state.nextStart.getTime());
  await createBillingCheckout(7, "starter_ai", "month", 7);
  assert.equal(rows(billingIntents).length, 2);
  assert.equal((await getWorkspaceEntitlements(7)).paid, false);
  state.remote.status = "ACTIVE";
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "19" }, time: state.nextStart.toISOString() },
    next_billing_time: billingAnniversary(state.nextStart, 1, "month").toISOString() };
  state.transactions = [{ id: "SALE_REPURCHASE", status: "COMPLETED", time: state.nextStart.toISOString(),
    amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "19" } } }];
  await reconcilePayPalSubscription("I-NEW001");
  assert.equal((await getWorkspaceEntitlements(7)).paid, true);
  assert.equal(rows(billingSubscriptions)[0].paypalSubscriptionId, "I-NEW001");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, state.mapping.definition.includedMonthlyCredits);
});
test("confirmed cancelled-plan replacement activates only after payment and credits unused time once", async t => {
  const { rows, state, paid } = fixture(t);
  await paid();
  await changeBillingSubscription(7, "free", "month");
  rows(workspaces)[0].aiCreditsBalance = 137;
  const next = { versionId: 8, definition: structuredClone(getPlanDefinition("pro_ai")), paypalPlanId: "P-NEXT", paypalProductId: "PROD-BBBBBBBBBBBBBBBBB" };
  globalThis.__paypalCatalog.set("pro_ai:month", next);
  state.nextSubscriptionId = "I-NEW001";
  state.nextStart = new Date();
  await assert.rejects(createBillingCheckout(7, "pro_ai", "month", 8), /paid access/);
  await createBillingCheckout(7, "pro_ai", "month", 8, true);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "starter_ai");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137);
  assert.equal(rows(billingCreditLots)[0].held, true);
  assert.equal(await reconcilePayPalSubscription("I-NEW001"), false);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "starter_ai");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137);
  state.remote.status = "ACTIVE";
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "49.00" }, time: state.nextStart.toISOString() },
    next_billing_time: billingAnniversary(state.nextStart, 1, "month").toISOString() };
  state.transactions = [{ id: "SALE_NEW", status: "COMPLETED", time: state.nextStart.toISOString(), amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "49.00" } } }];
  const compensation = replacementCreditAmount(1900, state.start, state.end, state.nextStart);
  await reconcilePayPalSubscription("I-NEW001");
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "pro_ai");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137 + compensation + 1000);
  assert.equal(rows(billingCreditLots).length, 2);
  await reconcilePayPalSubscription("I-NEW001");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137 + compensation + 1000);
  await invalidatePayPalPayment("SALE001", "refund");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 1137);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "pro_ai");
  await invalidatePayPalPayment("SALE_NEW", "refund");
  await invalidatePayPalPayment("SALE_NEW", "refund");
  assert.equal((await getWorkspaceEntitlements(7)).paid, false);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137);
});
test("a verified replacement payment activates after the former period expires without losing carried credits", async t => {
  const { rows, state, paid } = fixture(t);
  await paid();
  await changeBillingSubscription(7, "free", "month");
  rows(workspaces)[0].aiCreditsBalance = 137;
  const next = { versionId: 8, definition: structuredClone(getPlanDefinition("pro_ai")), paypalPlanId: "P-NEXT", paypalProductId: "PROD-BBBBBBBBBBBBBBBBB" };
  globalThis.__paypalCatalog.set("pro_ai:month", next);
  const paymentTime = new Date(state.end.getTime() - 60000);
  t.mock.timers.enable({ apis: ["Date"], now: paymentTime.getTime() });
  state.nextSubscriptionId = "I-NEW001";
  state.nextStart = paymentTime;
  await createBillingCheckout(7, "pro_ai", "month", 8, true);
  state.remote.status = "ACTIVE";
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "49.00" }, time: paymentTime.toISOString() },
    next_billing_time: billingAnniversary(paymentTime, 1, "month").toISOString() };
  state.transactions = [{ id: "SALE_NEW", status: "COMPLETED", time: paymentTime.toISOString(), amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "49.00" } } }];
  t.mock.timers.setTime(state.end.getTime() + 1000);
  await refreshSubscriptionAllowances({ reconcile: false });
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal(rows(billingCreditLots)[0].remaining, 137);
  assert.equal(rows(billingCreditLots)[0].held, true);
  await reconcilePayPalSubscription("I-NEW001");
  const compensation = replacementCreditAmount(1900, state.start, state.end, paymentTime);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "pro_ai");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137 + compensation + 1000);
  assert.equal(rows(billingCreditLots)[0].held, false);
  await reconcilePayPalSubscription("I-NEW001");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 137 + compensation + 1000);
});
test("a confirmed new payment activates even when the previous payment was refunded during checkout", async t => {
  const { rows, state, paid } = fixture(t);
  await paid();
  await changeBillingSubscription(7, "free", "month");
  rows(workspaces)[0].aiCreditsBalance = 137;
  const next = { versionId: 8, definition: structuredClone(getPlanDefinition("pro_ai")), paypalPlanId: "P-NEXT", paypalProductId: "PROD-BBBBBBBBBBBBBBBBB" };
  globalThis.__paypalCatalog.set("pro_ai:month", next);
  state.nextSubscriptionId = "I-NEW001";
  state.nextStart = new Date();
  await createBillingCheckout(7, "pro_ai", "month", 8, true);
  await invalidatePayPalPayment("SALE001", "refund");
  assert.equal((await getWorkspaceEntitlements(7)).paid, false);
  state.remote.status = "ACTIVE";
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "49.00" }, time: state.nextStart.toISOString() },
    next_billing_time: billingAnniversary(state.nextStart, 1, "month").toISOString() };
  state.transactions = [{ id: "SALE_NEW", status: "COMPLETED", time: state.nextStart.toISOString(), amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "49.00" } } }];
  await reconcilePayPalSubscription("I-NEW001");
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "pro_ai");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 1000);
  assert.equal(rows(billingCreditLots).filter(lot => !lot.revokedAt).length, 0);
});
test("a missed paid renewal is reconciled before checkout and cannot create an overlapping purchase", async t => {
  const { rows, state, paid, calls } = fixture(t);
  await paid();
  t.mock.timers.enable({ apis: ["Date"], now: state.end.getTime() + 1000 });
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "19" }, time: state.end.toISOString() },
    next_billing_time: billingAnniversary(state.end, 1, "month").toISOString() };
  state.transactions = [{ id: "SALE_RENEWAL", status: "COMPLETED", time: state.end.toISOString(),
    amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "19" } } }];
  await assert.rejects(createBillingCheckout(7, "starter_ai", "month", 7), /paid access/);
  assert.equal(rows(billingIntents).length, 1);
  assert.equal(rows(billingPayments).length, 2);
  assert.equal((await getWorkspaceEntitlements(7)).paid, true);
  assert.equal(calls.some(item => item.path.endsWith("/cancel")), false);
});
test("same-product changes preserve old entitlements until the next matching settled renewal", async t => {
  const { rows, state, paid } = fixture(t);
  await paid();
  const next = { versionId: 8, definition: structuredClone(getPlanDefinition("pro_ai")), paypalPlanId: "P-NEXT", paypalProductId: state.mapping.paypalProductId,
    paymentPolicy: { autoBillOutstanding: true, paymentFailureThreshold: 0 } };
  globalThis.__paypalCatalog.set("pro_ai:month", next);
  const result = await changeBillingSubscription(7, "pro_ai", "month", 8);
  assert.ok(result.url);
  assert.equal((await getWorkspaceEntitlements(7)).plan.slug, "starter_ai");
  assert.deepEqual(rows(billingIntents)[0].paymentPolicy, { autoBillOutstanding: false, paymentFailureThreshold: 1 });
  assert.deepEqual(rows(billingIntents)[0].pendingRevision.paymentPolicy, next.paymentPolicy);
  state.remote.plan_id = "P-NEXT";
  await reconcilePayPalSubscription("I-SUB001");
  assert.equal(rows(billingSubscriptions)[0].planSlug, "starter_ai");
  assert.equal(rows(billingSubscriptions)[0].pendingPlanSlug, "pro_ai");
  t.mock.timers.enable({ apis: ["Date"], now: state.end.getTime() + 1000 });
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: "49" }, time: state.end.toISOString() }, next_billing_time: billingAnniversary(state.end, 1, "month").toISOString() };
  state.transactions = [{ id: "SALE_NEXT", status: "COMPLETED", time: state.end.toISOString(), amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "49" } } }];
  await reconcilePayPalSubscription("I-SUB001");
  assert.equal(rows(billingSubscriptions)[0].planSlug, "pro_ai");
  assert.equal(rows(billingSubscriptions)[0].pendingPlanSlug, null);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 1000);
  assert.deepEqual(rows(billingIntents)[0].paymentPolicy, next.paymentPolicy);
  next.definition.monthlyPrice = 999;
  assert.equal(await getPaidSubscriptionMrr(), 49);
});
test("different-product revision is rejected without replacing or cancelling the paid subscription", async t => {
  const { state, paid, calls } = fixture(t);
  await paid();
  globalThis.__paypalCatalog.set("agency:month", { versionId: 9, definition: getPlanDefinition("agency"), paypalPlanId: "P-OTHER", paypalProductId: "PROD-BBBBBBBBBBBBBBBBB" });
  await assert.rejects(changeBillingSubscription(7, "agency", "month", 9), /between products/);
  assert.equal(state.remote.status, "ACTIVE");
  assert.equal(calls.some(item => item.path.endsWith("/revise") || item.path.endsWith("/cancel")), false);
});
for (const status of ["ACTIVE", "CANCELLED"]) {
  test(`refresh remains idempotent for a settled ${status} subscription after its pending checkout clears`, async t => {
    const { rows, state, paid, calls } = fixture(t);
    await paid();
    state.remote.status = status;
    assert.equal(rows(billingSubscriptions)[0].pendingIntentId, null);
    const balance = rows(workspaces)[0].aiCreditsBalance;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await billingRoute.POST(new Request("https://app.example.test/api/billing", {
        method: "POST", body: JSON.stringify({ action: "refresh_subscription" }),
      }));
      assert.equal(response.status, 200);
    }
    assert.equal(rows(billingSubscriptions)[0].status, status);
    assert.equal(rows(billingPayments).length, 1);
    assert.equal(rows(billingGrants).length, 1);
    assert.equal(rows(workspaces)[0].aiCreditsBalance, balance);
    assert.equal(calls.filter(call => call.method === "POST" && call.path.startsWith("/v1/billing/subscriptions")).length, 1);
  });
}
test("refresh still rejects unapproved and abandoned purchases without granting paid access", async t => {
  const { rows } = fixture(t);
  await createBillingCheckout(7, "starter_ai", "month", 7);
  await assert.rejects(confirmBillingCheckout(7), /approval or payment is still pending/);
  rows(billingSubscriptions)[0].paypalSubscriptionId = "I-SUB001";
  rows(billingSubscriptions)[0].pendingIntentId = null;
  rows(billingIntents)[0].state = "abandoned";
  await assert.rejects(confirmBillingCheckout(7), /No authorized PayPal purchase/);
  assert.equal(rows(billingPayments).length, 0);
  assert.equal(rows(billingGrants).length, 0);
  assert.equal((await getWorkspaceEntitlements(7)).paid, false);
});
test("refresh cannot use another workspace's authorization when no checkout is pending", async t => {
  const { rows, paid, calls } = fixture(t);
  await paid();
  rows(billingIntents)[0].workspaceId = 8;
  const count = calls.length;
  await assert.rejects(confirmBillingCheckout(7), /No authorized PayPal purchase/);
  assert.equal(calls.length, count);
});
test("billing reports retryable contention under the actual action without logging request secrets", async t => {
  const { paid } = fixture(t);
  await paid();
  const logs = [];
  t.mock.method(console, "warn", (...args) => logs.push(args));
  let release;
  const held = db.withLease("billing:7", () => new Promise(resolve => { release = resolve; }), null);
  try {
    const response = await billingRoute.POST(new Request("https://app.example.test/api/billing", {
      method: "POST", body: JSON.stringify({ action: "refresh_subscription", apiKey: "private-request-marker" }),
    }));
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("Retry-After"), "2");
    assert.equal((await response.json()).code, "BILLING_BUSY");
    assert.equal(logs[0][0], "Billing operation deferred");
    assert.equal(logs[0][1].action, "refresh_subscription");
    assert.match(logs[0][1].reason, /Another billing operation/);
    assert.doesNotMatch(JSON.stringify(logs), /private-request-marker|offline-secret/);
  } finally { release(); await held; }
});
for (const leaseKey of ["billing:7", "billing-event:sandbox:WH-BUSY"]) {
  test(`webhook waits for ${leaseKey} and processes exactly once`, async t => {
    const { rows, paid } = fixture(t);
    await paid();
    const headers = Object.fromEntries(["auth-algo", "cert-url", "transmission-id", "transmission-sig", "transmission-time"].map(key => [`paypal-${key}`, "offline"]));
    const event = { id: "WH-BUSY", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-SUB001" } };
    const request = () => new Request("https://app.example.test/api/billing/webhook", { method: "POST", headers, body: JSON.stringify(event) });
    let release;
    const held = db.withLease(leaseKey, () => new Promise(resolve => { release = resolve; }), null);
    let response;
    try {
      const waiting = webhookRoute.POST(request());
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.notEqual(rows(billingEvents)[0].status, "processed");
      release();
      await held;
      response = await waiting;
    } finally { release(); await held; }
    assert.equal(response.status, 200);
    assert.equal((await webhookRoute.POST(request())).status, 200);
    assert.equal(rows(billingEvents)[0].status, "processed");
    assert.equal(rows(billingPayments).length, 1);
    assert.equal(rows(billingGrants).length, 1);
  });
  test(`webhook contention on ${leaseKey} remains retryable if the wait expires`, async t => {
    const { rows, paid } = fixture(t);
    await paid();
    const event = { id: "WH-BUSY", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-SUB001" } };
    let release;
    const held = db.withLease(leaseKey, () => new Promise(resolve => { release = resolve; }), null);
    try {
      await assert.rejects(processBillingEvent(event, { lockDeadline: Date.now() }), { name: "BillingBusyError" });
      assert.notEqual(rows(billingEvents)[0].status, "processed");
    } finally { release(); await held; }
    await processBillingEvent(event);
    assert.equal(rows(billingEvents)[0].status, "processed");
    assert.equal(rows(billingPayments).length, 1);
    assert.equal(rows(billingGrants).length, 1);
  });
}
test("webhook binding conflicts are not disguised as retryable lock contention", async t => {
  const { state, paid } = fixture(t);
  await paid();
  state.getOverrides = { quantity: "2" };
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const headers = Object.fromEntries(["auth-algo", "cert-url", "transmission-id", "transmission-sig", "transmission-time"].map(key => [`paypal-${key}`, "offline"]));
  const response = await webhookRoute.POST(new Request("https://app.example.test/api/billing/webhook", {
    method: "POST", headers,
    body: JSON.stringify({ id: "WH-MISMATCH", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-SUB001" } }),
  }));
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("Retry-After"), null);
  assert.equal((await response.json()).code, undefined);
  assert.match(logs[0][1].reason, /does not match its workspace purchase authorization/);
});
test("durable webhook inbox retries failures and deduplicates successfully reconciled events", async t => {
  const { rows, state, paid, calls } = fixture(t);
  await paid();
  const event = { id: "WH-OFFLINE", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-SUB001" } };
  state.failGet = true;
  await assert.rejects(processBillingEvent(event));
  assert.equal(rows(billingEvents)[0].status, "failed");
  state.failGet = false;
  await processBillingEvent(event);
  const count = calls.length;
  await processBillingEvent(event);
  assert.equal(calls.length, count);
  assert.equal(rows(billingEvents)[0].attempts, 2);
});
test("Sandbox paid evidence cannot grant Live entitlements or mix provider identities", async t => {
  const { paid } = fixture(t);
  await paid();
  process.env.PAYPAL_ENVIRONMENT = "live";
  assert.equal((await getWorkspaceEntitlements(7)).paid, false);
  assert.equal(await getPaidSubscriptionMrr(), 0);
  await assert.rejects(createBillingCheckout(7, "starter_ai", "month", 7), /original PayPal environment/);
});

const lifecycleOptions = Object.values(SUBSCRIPTION_PLANS).filter(plan => plan.slug !== "free")
  .flatMap(plan => ["month", "year"].map(interval => ({ slug: plan.slug, interval })));
function lifecycleCatalog(productId) {
  globalThis.__paypalCatalog.clear();
  return lifecycleOptions.map((option, index) => {
    const mapping = { ...option, versionId: 100 + index, definition: structuredClone(getPlanDefinition(option.slug)),
      paypalPlanId: `P-LIFECYCLE-${index}`, paypalProductId: productId };
    globalThis.__paypalCatalog.set(`${option.slug}:${option.interval}`, mapping);
    return mapping;
  });
}
function lifecyclePayment(state, mapping, time, id) {
  const amount = (mapping.interval === "year" ? mapping.definition.annualMonthlyPrice * 12 : mapping.definition.monthlyPrice).toFixed(2);
  const end = billingAnniversary(time, 1, mapping.interval);
  state.remote.status = "ACTIVE";
  state.remote.billing_info = { last_payment: { amount: { currency_code: "USD", value: amount }, time: time.toISOString() },
    next_billing_time: end.toISOString() };
  state.transactions = [{ id, status: "COMPLETED", time: time.toISOString(), amount_with_breakdown: { gross_amount: { currency_code: "USD", value: amount } } }];
  return end;
}
async function assertLifecycleAccess(rows, mapping, preferredMode = "byok") {
  const entitlements = await getWorkspaceEntitlements(7);
  assert.equal(entitlements.paid, true);
  assert.deepEqual(entitlements.plan, { ...mapping.definition, catalogVersionId: mapping.versionId });
  const workspace = rows(workspaces)[0];
  assert.equal(workspace.planSlug, mapping.slug);
  assert.equal(workspace.aiBillingMode, mapping.definition.allowsConfigurableAiMode ? preferredMode : mapping.definition.defaultAiMode);
  assert.equal(workspace.aiCreditsMonthlyAllowance, mapping.definition.includedMonthlyCredits);
  assert.equal(workspace.aiCreditsBalance, mapping.definition.includedMonthlyCredits);
}
async function lifecycleWebhook(id, state) {
  const event = { id, event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: state.remote.id } };
  const headers = Object.fromEntries(["auth-algo", "cert-url", "transmission-id", "transmission-sig", "transmission-time"].map(key => [`paypal-${key}`, "offline"]));
  const response = await webhookRoute.POST(new Request("https://app.example.test/api/billing/webhook", { method: "POST", headers, body: JSON.stringify(event) }));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
}
for (const option of lifecycleOptions) {
  test(`full lifecycle ${option.slug}/${option.interval}: payment, renewal, cancellation and expiry`, async t => {
    const { rows, state, calls } = fixture(t);
    const mapping = lifecycleCatalog(state.mapping.paypalProductId).find(plan => plan.slug === option.slug && plan.interval === option.interval);
    t.mock.timers.enable({ apis: ["Date"], now: state.start.getTime() + 1000 });
    await createBillingCheckout(7, mapping.slug, mapping.interval, mapping.versionId);
    assert.equal((await getWorkspaceEntitlements(7)).paid, false);
    state.remote.status = "ACTIVE";
    await reconcilePayPalSubscription(state.remote.id);
    assert.equal((await getWorkspaceEntitlements(7)).paid, false, "Provider activation alone must never grant a paid plan.");
    const end = lifecyclePayment(state, mapping, state.start, "SALE-LIFECYCLE-INITIAL");
    await lifecycleWebhook("WH-LIFECYCLE-INITIAL", state);
    await assertLifecycleAccess(rows, mapping);
    assert.equal(rows(billingPayments).length, 1);
    assert.equal(rows(billingGrants).length, 1);
    const consumed = Math.max(0, mapping.definition.includedMonthlyCredits - 1);
    rows(workspaces)[0].aiCreditsBalance = consumed;
    await lifecycleWebhook("WH-LIFECYCLE-INITIAL", state);
    assert.equal(rows(workspaces)[0].aiCreditsBalance, consumed, "A webhook replay must not restore consumed credits.");
    if (mapping.interval === "year") {
      t.mock.timers.setTime(billingAnniversary(state.start, 1, "month").getTime() + 1000);
      await refreshSubscriptionAllowances({ reconcile: false });
      await assertLifecycleAccess(rows, mapping);
      assert.equal(rows(billingPayments).length, 1, "Annual credit refresh must not invent another payment.");
      assert.equal(rows(billingGrants).length, 2, "Annual billing grants one allowance per anniversary month, not twelve upfront.");
    }
    t.mock.timers.setTime(end.getTime() + 1000);
    await refreshSubscriptionAllowances({ reconcile: false });
    assert.equal((await getWorkspaceEntitlements(7)).paid, false, "Unpaid renewals must expire even when PayPal status is ACTIVE.");
    const renewedEnd = lifecyclePayment(state, mapping, end, "SALE-LIFECYCLE-RENEWAL");
    await lifecycleWebhook("WH-LIFECYCLE-RENEWAL", state);
    await assertLifecycleAccess(rows, mapping);
    assert.equal(rows(billingPayments).length, 2);
    assert.equal(rows(billingGrants).length, mapping.interval === "year" ? 3 : 2);
    await changeBillingSubscription(7, "free", mapping.interval);
    assert.equal(state.remote.status, "CANCELLED");
    assert.equal(rows(billingSubscriptions)[0].paidThrough.toISOString(), renewedEnd.toISOString());
    await assertLifecycleAccess(rows, mapping);
    await changeBillingSubscription(7, "free", mapping.interval);
    assert.equal(calls.filter(call => call.path.endsWith("/cancel")).length, 1);
    await assert.rejects(createBillingCheckout(7, mapping.slug, mapping.interval, mapping.versionId), /paid access/);
    t.mock.timers.setTime(renewedEnd.getTime());
    await refreshSubscriptionAllowances({ reconcile: false });
    const expired = await getWorkspaceEntitlements(7);
    assert.equal(expired.paid, false);
    assert.equal(expired.plan.slug, "free");
    assert.equal(rows(workspaces)[0].aiBillingMode, "byok");
    assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
    assert.equal(rows(workspaces).length, 1, "Cancellation and expiry must retain the customer's workspace.");
  });
}
for (const source of lifecycleOptions) {
  for (const target of lifecycleOptions) {
    if (source.slug === target.slug && source.interval === target.interval) continue;
    test(`paid revision ${source.slug}/${source.interval} -> ${target.slug}/${target.interval}: approval, paid activation and renewal`, async t => {
      const { rows, state, calls } = fixture(t);
      const catalog = lifecycleCatalog(state.mapping.paypalProductId);
      const from = catalog.find(plan => plan.slug === source.slug && plan.interval === source.interval);
      const to = catalog.find(plan => plan.slug === target.slug && plan.interval === target.interval);
      t.mock.timers.enable({ apis: ["Date"], now: state.start.getTime() + 1000 });
      await createBillingCheckout(7, from.slug, from.interval, from.versionId);
      const effectiveAt = lifecyclePayment(state, from, state.start, "SALE-REVISION-INITIAL");
      await reconcilePayPalSubscription(state.remote.id);
      const consumed = Math.max(0, from.definition.includedMonthlyCredits - 1);
      rows(workspaces)[0].aiCreditsBalance = consumed;
      const preferredMode = rows(workspaces)[0].aiBillingMode;
      const result = await changeBillingSubscription(7, to.slug, to.interval, to.versionId);
      assert.match(result.url, /^https:\/\/www\.sandbox\.paypal\.com\//);
      assert.equal(rows(billingSubscriptions)[0].pendingEffectiveAt.toISOString(), effectiveAt.toISOString());
      assert.equal((await getWorkspaceEntitlements(7)).plan.slug, from.slug);
      state.remote.plan_id = to.paypalPlanId;
      await reconcilePayPalSubscription(state.remote.id);
      assert.equal(rows(billingSubscriptions)[0].planSnapshot.catalogVersionId, from.versionId);
      assert.equal(rows(workspaces)[0].aiCreditsBalance, consumed, "Approval must preserve the current paid plan and consumed credits.");
      t.mock.timers.setTime(effectiveAt.getTime() + 1000);
      assert.equal((await getWorkspaceEntitlements(7)).paid, false, "Approval must not grant an unpaid revised period.");
      const next = lifecyclePayment(state, to, effectiveAt, "SALE-REVISION-PAID");
      await reconcilePayPalSubscription(state.remote.id);
      await assertLifecycleAccess(rows, to, preferredMode);
      assert.equal(rows(billingSubscriptions)[0].pendingPlanSlug, null);
      assert.equal(rows(billingIntents)[0].pendingRevision, null);
      assert.equal(rows(billingIntents).length, 1, "Revisions must retain the same subscription authorization.");
      assert.equal(calls.filter(call => call.path === "/v1/billing/subscriptions").length, 1);
      const spentAfterRevision = Math.max(0, to.definition.includedMonthlyCredits - 1);
      rows(workspaces)[0].aiCreditsBalance = spentAfterRevision;
      await reconcilePayPalSubscription(state.remote.id);
      assert.equal(rows(workspaces)[0].aiCreditsBalance, spentAfterRevision);
      t.mock.timers.setTime(next.getTime() + 1000);
      lifecyclePayment(state, to, next, "SALE-REVISION-RENEWED");
      await reconcilePayPalSubscription(state.remote.id);
      await assertLifecycleAccess(rows, to, preferredMode);
      assert.equal(rows(billingPayments).length, 3);
      assert.equal(rows(billingGrants).length, 3);
    });
  }
}
