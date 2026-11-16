import "./register-ts.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
const { allowanceWindow, invoicePaymentVerified } = await import("../src/lib/billing-policy.ts");
const { billingPriceMap, billingRequestOptions, getBillingReadiness, validateBillingConfig, trustedStripeUrl, verifiedPrice } = await import("../src/lib/stripe.ts");
const { db } = await import("../src/db/index.ts");
const { billingSubscriptions, billingInvoices, billingGrants, billingEvents } = await import("../src/db/billing-schema.ts");
const { workspaces } = await import("../src/db/schema.ts");
const { refreshSubscriptionAllowances, processBillingEvent, verifySubscriptionInvoice, getCreditEpoch, changeBillingSubscription, billingChangePhases, invalidateReversedPayment } = await import("../src/lib/subscriptions.ts");

const start = new Date("2024-01-31T12:15:00Z");
const end = new Date("2025-01-31T12:15:00Z");
test("annual subscriptions get anniversary-month windows without date drift", () => {
  const feb = allowanceWindow(start, end, new Date("2024-03-01T00:00:00Z"));
  assert.equal(feb.start.toISOString(), "2024-02-29T12:15:00.000Z");
  assert.equal(feb.end.toISOString(), "2024-03-31T12:15:00.000Z");
  const march = allowanceWindow(start, end, new Date("2024-03-31T12:15:00Z"));
  assert.equal(march.start.toISOString(), "2024-03-31T12:15:00.000Z");
  assert.equal(march.end.toISOString(), "2024-04-30T12:15:00.000Z");
});
test("no grant before payment period or at expiry; final month is clipped", () => {
  assert.equal(allowanceWindow(start, end, new Date("2024-01-31T12:14:59Z")), null);
  assert.equal(allowanceWindow(start, end, end), null);
  const earlyEnd = new Date("2024-03-15T00:00:00Z");
  assert.equal(allowanceWindow(start, earlyEnd, new Date("2024-03-01")).end.toISOString(), earlyEnd.toISOString());
});
const invoice = {
  status: "paid", currency: "usd", amount_due: 1900, amount_paid: 1900,
  subtotal: 1900, total: 1900, starting_balance: 0, total_discount_amounts: [],
};
test("only settled full USD catalog invoices qualify", () => {
  assert.equal(invoicePaymentVerified(invoice, 1900), true);
  for (const change of [
    { status: "open" }, { status: "void" }, { amount_paid: 1899 }, { currency: "eur" },
    { subtotal: 1800 }, { total: 0 }, { paid_out_of_band: true }, { total_discount_amounts: [{}] },
  ]) assert.equal(invoicePaymentVerified({ ...invoice, ...change }, 1900), false);
});
test("zero-due is valid only when positive catalog value is covered by preexisting customer balance", () => {
  const zeroDue = { ...invoice, amount_due: 0, amount_paid: 0 };
  assert.equal(invoicePaymentVerified(zeroDue, 1900), false);
  assert.equal(invoicePaymentVerified({ ...zeroDue, starting_balance: -1900 }, 1900), true);
  assert.equal(invoicePaymentVerified({ ...zeroDue, starting_balance: -1899 }, 1900), false);
  assert.equal(invoicePaymentVerified({ ...zeroDue, subtotal: 0, total: 0 }, 1900), false);
});
test("configuration is explicitly disabled/missing and never contains secret values", () => {
  const state = getBillingReadiness({});
  assert.equal(state.ready, false);
  assert.equal(state.enabled, false);
  assert.doesNotThrow(() => validateBillingConfig({ BILLING_ENABLED: "false" }));
  assert.throws(() => validateBillingConfig({ BILLING_ENABLED: "true" }), /STRIPE_SECRET_KEY/);
  assert.ok(state.missing.includes("STRIPE_WEBHOOK_SECRET"));
  const env = {
    BILLING_ENABLED: "true", BILLING_APP_URL: "https://postif.example",
    STRIPE_SECRET_KEY: "sk_test_offline", STRIPE_WEBHOOK_SECRET: "whsec_offline",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_offline",
  };
  billingPriceMap({}).forEach((entry, i) => { env[entry.envName] = `price_${i}`; });
  assert.equal(getBillingReadiness(env).ready, true);
  assert.doesNotThrow(() => validateBillingConfig(env));
  assert.throws(() => validateBillingConfig({ ...env, BILLING_APP_URL: "http://localhost:3000" }), /BILLING_APP_URL/);
  assert.throws(() => validateBillingConfig({ ...env, STRIPE_PRICE_PRO_AI_MONTHLY: "not-a-price" }), /STRIPE_PRICE_PRO_AI_MONTHLY/);
  assert.equal(JSON.stringify(getBillingReadiness(env)).includes("sk_test_offline"), false);
  assert.equal(getBillingReadiness({ ...env, BILLING_APP_URL: "https://evil.example/redirect" }).ready, false);
  env.STRIPE_PRICE_AGENCY_MONTHLY = env.STRIPE_PRICE_AGENCY_ANNUAL;
  assert.equal(getBillingReadiness(env).ready, false);
});
test("only server Stripe hosts are accepted for redirects", () => {
  assert.equal(trustedStripeUrl("https://checkout.stripe.com/c/pay/offline", "checkout"), "https://checkout.stripe.com/c/pay/offline");
  for (const url of ["https://checkout.stripe.com.evil.example", "http://checkout.stripe.com", "javascript:alert(1)", null]) {
    assert.throws(() => trustedStripeUrl(url, "checkout"));
  }
  assert.throws(() => trustedStripeUrl("https://checkout.stripe.com/pay", "portal"));
});
test("worker Stripe requests disable retry and honor the remaining deadline", () => {
  const options = billingRequestOptions(Date.now() + 1500);
  assert.equal(options.maxNetworkRetries, 0);
  assert.ok(options.timeout > 0 && options.timeout <= 1500);
  assert.throws(() => billingRequestOptions(Date.now() - 1), /deadline/);
});
test("Price mapping is catalog-only and checks exact annual USD total and recurrence", async () => {
  const entry = billingPriceMap({}).find(p => p.plan.slug === "starter_ai" && p.interval === "year");
  const previous = process.env[entry.envName];
  process.env[entry.envName] = "price_offline";
  const price = { id: "price_offline", active: true, currency: "usd", unit_amount: 18000,
    recurring: { interval: "year", interval_count: 1, usage_type: "licensed" }, type: "recurring", billing_scheme: "per_unit" };
  try {
    assert.equal((await verifiedPrice({ prices: { retrieve: async () => price } }, "starter_ai", "year")).amount, 18000);
    for (const change of [{ unit_amount: 1500 }, { currency: "eur" }, { active: false }, { recurring: { interval: "month", interval_count: 1 } }]) {
      await assert.rejects(verifiedPrice({ prices: { retrieve: async () => ({ ...price, ...change }) } }, "starter_ai", "year"));
    }
    await assert.rejects(verifiedPrice({}, "arbitrary_client_price", "month"));
    await assert.rejects(verifiedPrice({}, "free", "month"));
  } finally { if (previous === undefined) delete process.env[entry.envName]; else process.env[entry.envName] = previous; }
});
test("webhook signatures bind the exact raw body and reject replay outside tolerance", () => {
  const stripe = new Stripe("sk_test_offline");
  const secret = "whsec_offline_fixture_not_a_real_secret";
  const payload = JSON.stringify({ id: "evt_offline", type: "invoice.paid", object: "event", data: { object: {} } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, "evt_offline");
  assert.throws(() => stripe.webhooks.constructEvent(`${payload} `, header, secret));
  const stale = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 1000 });
  assert.throws(() => stripe.webhooks.constructEvent(payload, stale, secret));
});
test("a paid invoice status alone cannot activate access without matching succeeded Stripe settlement", async () => {
  const entry = billingPriceMap({}).find(p => p.plan.slug === "starter_ai" && p.interval === "month");
  const previous = process.env[entry.envName];
  process.env[entry.envName] = "price_offline";
  const subscription = {
    id: "sub_offline", customer: "cus_offline", trial_start: null,
    items: { data: [{ id: "si_offline", price: { id: "price_offline" } }] },
  };
  const paidInvoice = {
    ...invoice, id: "in_offline", created: 1706703300, billing_reason: "subscription_cycle",
    customer: "cus_offline", parent: { subscription_details: { subscription: "sub_offline" } },
  };
  const line = {
    quantity: 1, amount: 1900, pricing: { price_details: { price: "price_offline" } },
    parent: { subscription_item_details: { proration: false, subscription_item: "si_offline" } },
    period: { start: 1706703300, end: 1709208900 },
  };
  let payments = [];
  let intentStatus = "succeeded";
  let refunded = 0, disputed = false;
  const provider = {
    invoices: { listLineItems: async () => ({ has_more: false, data: [line] }) },
    prices: { retrieve: async () => ({
      active: true, currency: "usd", unit_amount: 1900, type: "recurring", billing_scheme: "per_unit",
      recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    }) },
    invoicePayments: { list: async () => ({ has_more: false, data: payments }) },
    paymentIntents: { retrieve: async () => ({ status: intentStatus, currency: "usd", customer: "cus_offline", amount_received: 1900, latest_charge: "ch_offline" }) },
    charges: { retrieve: async () => ({ id: "ch_offline", status: "succeeded", paid: true, captured: true, currency: "usd", customer: "cus_offline", amount: 1900, amount_refunded: refunded, disputed }) },
  };
  try {
    assert.equal(await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7), null);
    payments = [{ status: "paid", currency: "usd", amount_paid: 1900, payment: { type: "payment_record" } }];
    assert.equal(await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7), null);
    payments = [{ status: "paid", currency: "usd", amount_paid: 1900, payment: { type: "payment_intent", payment_intent: "pi_offline" } }];
    intentStatus = "processing";
    assert.equal(await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7), null);
    intentStatus = "succeeded";
    assert.equal((await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7)).planSlug, "starter_ai");
    refunded = 1;
    assert.equal(await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7), null);
    refunded = 0; disputed = true;
    assert.equal(await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7), null);
    disputed = false;
    line.parent.subscription_item_details.proration = true;
    assert.equal(await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7), null);
    line.parent.subscription_item_details.proration = false;
    subscription.trial_start = 1706703300;
    assert.equal(await verifySubscriptionInvoice(provider, paidInvoice, subscription, 7), null);
  } finally { if (previous === undefined) delete process.env[entry.envName]; else process.env[entry.envName] = previous; }
});

function fakeRepository(t, initial) {
  const rows = new Map(initial.map(([model, records]) => [model.name, records]));
  const table = model => {
    if (!rows.has(model.name)) rows.set(model.name, []);
    return rows.get(model.name);
  };
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([op, operand]) => op === "$lte" ? doc[key] <= operand : op === "$gt" ? doc[key] > operand : false);
    }
    return value === null ? doc[key] == null : Array.isArray(doc[key]) ? doc[key].includes(value) : doc[key] === value;
  });
  t.mock.method(db, "find", async (model, filter = {}, options = {}) => {
    let result = table(model).filter(row => matches(row, filter));
    if (options.sort) for (const [field, direction] of Object.entries(options.sort).reverse()) result.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * direction);
    if (options.limit) result = result.slice(0, options.limit);
    return structuredClone(result);
  });
  t.mock.method(db, "update", async (model, filter, changes) => table(model).filter(row => matches(row, filter)).map(row => Object.assign(row, structuredClone(changes))));
  t.mock.method(db, "insert", async (model, values, options = {}) => {
    const duplicate = table(model).some(row => model.unique.some(key => values[key] !== undefined && row[key] === values[key]));
    if (duplicate) { if (options.ignoreDuplicates) return []; throw new Error("duplicate"); }
    const row = { ...model.defaults(), ...structuredClone(values), id: table(model).length + 1 };
    table(model).push(row);
    return [structuredClone(row)];
  });
  t.mock.method(db, "transaction", async callback => callback(db));
  t.mock.method(db, "withLease", async (_name, callback) => callback());
  return table;
}
function fixture(periodStart = new Date("2024-01-31T12:15:00Z"), periodEnd = new Date("2025-01-31T12:15:00Z")) {
  return [
    [billingSubscriptions, [{ ...billingSubscriptions.defaults(), id: 1, workspaceId: 7, planSlug: "starter_ai", paidThrough: periodEnd, stripeSubscriptionId: "sub_offline" }]],
    [billingInvoices, [{ id: 1, workspaceId: 7, stripeInvoiceId: "in_offline", stripeSubscriptionId: "sub_offline",
      planSlug: "starter_ai", stripePriceId: "price_offline", currency: "usd", interval: "year",
      periodStart, periodEnd, invoiceCreated: 1706703300, amountPaid: 18000, invalidatedAt: null, stripeChargeIds: [] }]],
    [workspaces, [{ id: 7, aiCreditsBalance: 0, aiCreditsMonthlyAllowance: 0 }]],
  ];
}
test("annual paid credits refresh monthly once and never overwrite consumption on retry", async t => {
  const rows = fakeRepository(t, fixture());
  const now = new Date("2024-02-29T12:15:00Z");
  t.mock.method(Date, "now", () => now.getTime());
  const initialEpoch = await getCreditEpoch(7);
  assert.equal((await refreshSubscriptionAllowances({ now, reconcile: false })).granted, 1);
  const epoch = await getCreditEpoch(7);
  assert.notEqual(epoch, initialEpoch);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 300);
  rows(workspaces)[0].aiCreditsBalance = 275;
  assert.equal((await refreshSubscriptionAllowances({ now, reconcile: false })).granted, 0);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 275);
  assert.equal(await getCreditEpoch(7), epoch);
  assert.equal((await refreshSubscriptionAllowances({ now: new Date("2024-03-31T12:15:00Z"), reconcile: false })).granted, 1);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 300);
  assert.equal(rows(billingGrants).length, 2);
  assert.notEqual(await getCreditEpoch(7), epoch);
});
test("unpaid subscription status never grants credits; expiry resets compatibility balances without deleting invoices", async t => {
  const rows = fakeRepository(t, fixture());
  rows(billingSubscriptions)[0].paidThrough = null;
  rows(billingSubscriptions)[0].status = "active";
  rows(billingInvoices).length = 0;
  rows(workspaces)[0].aiCreditsBalance = 900;
  const now = new Date("2024-03-01");
  assert.equal((await refreshSubscriptionAllowances({ now, reconcile: false })).granted, 0);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal(rows(workspaces)[0].planSlug, "free");
  assert.equal(rows(billingGrants).length, 0);
});
test("a clamped monthly Stripe term cannot receive a second grant before the next paid invoice", async t => {
  const rows = fakeRepository(t, fixture(new Date("2025-02-28T12:15:00Z"), new Date("2025-03-31T12:15:00Z")));
  rows(billingInvoices)[0].interval = "month";
  assert.equal((await refreshSubscriptionAllowances({ now: new Date("2025-02-28T12:15:00Z"), reconcile: false })).granted, 1);
  rows(workspaces)[0].aiCreditsBalance = 275;
  assert.equal((await refreshSubscriptionAllowances({ now: new Date("2025-03-29T12:15:00Z"), reconcile: false })).granted, 0);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 275);
  assert.equal(rows(billingGrants).length, 1);
});
test("future verified periods activate only at their start; canceled paid terms retain allowances until expiry", async t => {
  const rows = fakeRepository(t, fixture());
  rows(billingSubscriptions)[0].paidThrough = null;
  rows(billingSubscriptions)[0].planSlug = "free";
  rows(billingSubscriptions)[0].status = "canceled";
  assert.equal((await refreshSubscriptionAllowances({ now: new Date("2024-01-01"), reconcile: false })).granted, 0);
  assert.equal((await refreshSubscriptionAllowances({ now: start, reconcile: false })).granted, 1);
  assert.equal(rows(billingSubscriptions)[0].paidThrough.toISOString(), end.toISOString());
  t.mock.method(Date, "now", () => end.getTime());
  assert.equal(await getCreditEpoch(7), `expired:${end.toISOString()}`);
  await refreshSubscriptionAllowances({ now: end, reconcile: false });
  assert.equal(rows(workspaces)[0].planSlug, "free");
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal(rows(billingInvoices).length, 1);
});
test("durable webhook inbox retries failures and deduplicates completed replay", async t => {
  const rows = fakeRepository(t, []);
  const env = {
    BILLING_ENABLED: "true", BILLING_APP_URL: "https://postif.example",
    STRIPE_SECRET_KEY: "sk_test_offline", STRIPE_WEBHOOK_SECRET: "whsec_offline",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_offline",
  };
  billingPriceMap({}).forEach((entry, i) => { env[entry.envName] = `price_${i}`; });
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  process.env.BILLING_ENABLED = "false";
  const event = { id: "evt_offline_inbox", type: "ignored.event", data: { object: {} } };
  try {
    await assert.rejects(processBillingEvent(event));
    assert.equal(rows(billingEvents)[0].status, "failed");
    Object.assign(process.env, env);
    await processBillingEvent(event);
    assert.equal(rows(billingEvents)[0].status, "processed");
    process.env.BILLING_ENABLED = "false";
    await processBillingEvent(event);
    assert.equal(rows(billingEvents).length, 1);
    assert.equal(rows(billingEvents)[0].attempts, 2);
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

function paidChangeFixture(t) {
  const periodStart = Math.floor(Date.now() / 1000) - 86400;
  const periodEnd = periodStart + 30 * 86400;
  const rows = fakeRepository(t, fixture(new Date(periodStart * 1000), new Date(periodEnd * 1000)));
  const local = rows(billingSubscriptions)[0];
  Object.assign(local, { status: "active", stripeCustomerId: "cus_offline", interval: "month", latestInvoiceId: "in_offline" });
  const variables = billingPriceMap({});
  const previous = Object.fromEntries(variables.map(e => [e.envName, process.env[e.envName]]));
  variables.forEach((entry, i) => { process.env[entry.envName] = `price_offline${i}`; });
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const currentPrice = billingPriceMap().find(e => e.plan.slug === "starter_ai" && e.interval === "month").priceId;
  const current = {
    id: "sub_offline", customer: "cus_offline", status: "active", metadata: { workspaceId: "7" },
    cancel_at_period_end: false, schedule: null,
    items: { data: [{ id: "si_offline", quantity: 1, price: { id: currentPrice }, current_period_start: periodStart, current_period_end: periodEnd }] },
  };
  const calls = { creates: 0, updates: [], releases: 0 };
  const schedule = { id: "sub_sched_offline", current_phase: { start_date: periodStart, end_date: periodEnd } };
  const stripe = {
    prices: { retrieve: async id => {
      const mapping = billingPriceMap().find(e => e.priceId === id);
      return { id, active: true, currency: "usd", unit_amount: mapping.amount, type: "recurring", billing_scheme: "per_unit",
        recurring: { interval: mapping.interval, interval_count: 1, usage_type: "licensed" } };
    } },
    subscriptions: {
      retrieve: async () => structuredClone(current),
      update: async (_id, changes) => { Object.assign(current, changes); return structuredClone(current); },
    },
    subscriptionSchedules: {
      retrieve: async () => structuredClone(schedule),
      create: async () => { calls.creates++; current.schedule = schedule.id; return structuredClone(schedule); },
      update: async (_id, params, options) => { calls.updates.push({ params, options }); return structuredClone(schedule); },
      release: async () => { calls.releases++; current.schedule = null; return structuredClone(schedule); },
    },
  };
  return { rows, current, calls, stripe, periodStart, periodEnd };
}
test("all paid tier and monthly/annual transitions schedule a no-proration term without changing current entitlements", async t => {
  const { rows, current, calls, stripe, periodEnd } = paidChangeFixture(t);
  const paidThrough = rows(billingSubscriptions)[0].paidThrough.toISOString();
  for (const mapping of billingPriceMap()) {
    await changeBillingSubscription(7, mapping.plan.slug, mapping.interval, { stripe });
    const record = rows(billingSubscriptions)[0];
    assert.equal(record.planSlug, "starter_ai");
    assert.equal(record.paidThrough.toISOString(), paidThrough);
    if (mapping.priceId !== current.items.data[0].price.id) {
      assert.equal(record.pendingPlanSlug, mapping.plan.slug);
      assert.equal(record.pendingInterval, mapping.interval);
      const { params } = calls.updates.at(-1);
      assert.equal(params.phases[1].start_date, periodEnd);
      assert.equal(params.phases[1].items[0].price, mapping.priceId);
      assert.equal(params.phases[1].duration.interval, mapping.interval);
      assert.equal(params.proration_behavior, "none");
      assert.equal(params.end_behavior, "release");
    }
  }
  assert.equal(rows(billingGrants).length, 0);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  assert.equal(rows(billingSubscriptions)[0].changeIntentKey, null);
});
test("cancellation, resumption and removal of pending changes preserve the paid-through date", async t => {
  const { rows, current, calls, stripe } = paidChangeFixture(t);
  const paidThrough = rows(billingSubscriptions)[0].paidThrough.toISOString();
  await changeBillingSubscription(7, "pro_ai", "year", { stripe });
  await changeBillingSubscription(7, "free", "month", { stripe });
  assert.equal(calls.releases, 1);
  assert.equal(current.cancel_at_period_end, true);
  assert.equal(rows(billingSubscriptions)[0].pendingPlanSlug, "free");
  await changeBillingSubscription(7, "starter_ai", "month", { stripe });
  assert.equal(current.cancel_at_period_end, false);
  assert.equal(rows(billingSubscriptions)[0].pendingPlanSlug, null);
  assert.equal(rows(billingSubscriptions)[0].paidThrough.toISOString(), paidThrough);
  assert.equal(rows(billingSubscriptions)[0].planSlug, "starter_ai");
});
test("uncertain schedule updates retry the durable key and cannot duplicate subscription schedules", async t => {
  const { rows, calls, stripe } = paidChangeFixture(t);
  const update = stripe.subscriptionSchedules.update;
  let first = true;
  stripe.subscriptionSchedules.update = async (...args) => {
    const result = await update(...args);
    if (first) { first = false; throw new Error("uncertain provider response"); }
    return result;
  };
  await assert.rejects(changeBillingSubscription(7, "pro_ai", "year", { stripe }));
  const key = rows(billingSubscriptions)[0].changeIntentKey;
  assert.ok(key);
  await assert.rejects(changeBillingSubscription(7, "agency", "month", { stripe }), /pending billing change/);
  await changeBillingSubscription(7, "pro_ai", "year", { stripe });
  assert.equal(calls.creates, 1);
  assert.equal(calls.updates[0].options.idempotencyKey, calls.updates[1].options.idempotencyKey);
});
test("schedule phases retain the paid phase and reject invalid period boundaries", () => {
  const phases = billingChangePhases({ priceId: "price_old", start: 100, end: 200 }, { priceId: "price_new", interval: "year" });
  assert.equal(phases[0].end_date, phases[1].start_date);
  assert.equal(phases[1].proration_behavior, "none");
  assert.throws(() => billingChangePhases({ priceId: "price_old", start: 200, end: 100 }, { priceId: "price_new", interval: "month" }));
});
test("refund/dispute invalidations cannot replay a paid invoice into fresh access or monthly credits", async t => {
  const { rows, periodStart, periodEnd } = paidChangeFixture(t);
  rows(billingInvoices)[0].stripeChargeIds = ["ch_reversed"];
  const provider = {
    charges: { retrieve: async () => ({ id: "ch_reversed", amount_refunded: 1, disputed: false, payment_intent: "pi_offline" }) },
    invoicePayments: { list: async () => ({ has_more: false, data: [{ invoice: "in_offline" }] }) },
  };
  assert.equal(await invalidateReversedPayment(provider, "ch_reversed"), 1);
  assert.equal(rows(billingInvoices)[0].invalidationReason, "refund");
  assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
  assert.equal(rows(workspaces)[0].planSlug, "free");
  await refreshSubscriptionAllowances({ now: new Date((periodStart + 86400) * 1000), reconcile: false });
  assert.equal(rows(billingGrants).length, 0);
  assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
  assert.equal(rows(workspaces)[0].aiCreditsBalance, 0);
  rows(billingSubscriptions)[0].paidThrough = new Date(periodEnd * 1000);
  provider.charges.retrieve = async () => ({ id: "ch_reversed", amount_refunded: 0, disputed: true, payment_intent: "pi_offline" });
  await invalidateReversedPayment(provider, "ch_reversed");
  assert.equal(rows(billingInvoices)[0].invalidationReason, "dispute");
  assert.equal(rows(billingSubscriptions)[0].paidThrough, null);
});
