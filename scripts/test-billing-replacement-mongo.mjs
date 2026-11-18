import "./register-ts.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

process.env.BILLING_ENABLED = "true";
process.env.BILLING_APP_URL = "https://billing.example.test";
process.env.PAYPAL_CLIENT_ID = "offline-client";
process.env.PAYPAL_CLIENT_SECRET = "offline-secret";
process.env.PAYPAL_WEBHOOK_ID = "offline-webhook";
const { getPlanDefinition } = await import("../src/lib/plans.ts");
const nextPlan = getPlanDefinition("pro_ai");
registerHooks({
  load(url, context, next) {
    if (url.endsWith("/src/lib/billing-catalog.ts")) return { format: "module", shortCircuit: true, source: `
      export async function getPurchasablePlan() {
        return { versionId: 8, definition: globalThis.replacementPlan, paypalPlanId: "P-NEXT", paypalProductId: "PROD-BBBBBBBBBBBBBBBBB" };
      }
      export async function getFreePlan() { return globalThis.replacementFree; }
    ` };
    return next(url, context);
  },
});
globalThis.replacementPlan = nextPlan;
globalThis.replacementFree = getPlanDefinition("free");
const { db, closeDatabase } = await import("../src/db/index.ts");
const { users, workspaces } = await import("../src/db/schema.ts");
const { billingSubscriptions, billingIntents, billingPayments, billingGrants, billingEvents, billingCreditLots } = await import("../src/db/billing-schema.ts");
const { createBillingCheckout, reconcilePayPalSubscription, invalidatePayPalPayment, processBillingEvent } = await import("../src/lib/subscriptions.ts");
const { replacementCreditAmount, billingAnniversary } = await import("../src/lib/billing-policy.ts");
const { getWorkspaceEntitlements } = await import("../src/lib/entitlements.ts");

const start = new Date(Date.now() - 86400000);
const end = billingAnniversary(start, 1, "month");
const paymentTime = new Date();
const old = { id: "I-OLD001", status: "CANCELLED", plan_id: "P-OLD", custom_id: "mongo-old-binding", quantity: "1",
  start_time: start.toISOString(), billing_info: { last_payment: { time: start.toISOString() } } };
let remote;
let transactions = [];
let transactionGate;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  if (parsed.pathname === "/v1/oauth2/token") return Response.json({ access_token: "offline-token", expires_in: 3600 });
  if (parsed.pathname === "/v1/billing/plans/P-NEXT") return Response.json({
    id: "P-NEXT", status: "ACTIVE", product_id: "PROD-BBBBBBBBBBBBBBBBB",
    billing_cycles: [{ tenure_type: "REGULAR", sequence: 1, total_cycles: 0, frequency: { interval_unit: "MONTH", interval_count: 1 },
      pricing_scheme: { fixed_price: { currency_code: "USD", value: nextPlan.monthlyPrice.toFixed(2) } } }],
    payment_preferences: { auto_bill_outstanding: false, payment_failure_threshold: 1, setup_fee: { currency_code: "USD", value: "0.00" } },
  });
  if (parsed.pathname === "/v1/billing/subscriptions" && options.method === "POST") {
    const body = JSON.parse(options.body);
    remote = { id: "I-NEW001", status: "APPROVAL_PENDING", plan_id: body.plan_id, custom_id: body.custom_id, quantity: "1",
      start_time: paymentTime.toISOString(), links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/approve?token=OFFLINE" }] };
    return Response.json({ id: remote.id });
  }
  if (parsed.pathname === "/v1/billing/subscriptions/I-OLD001") return Response.json(old);
  if (parsed.pathname === "/v1/billing/subscriptions/I-NEW001/transactions") {
    if (transactionGate) {
      const gate = transactionGate;
      transactionGate = undefined;
      gate.reached();
      await gate.released;
    }
    return Response.json({ transactions });
  }
  if (parsed.pathname === "/v1/billing/subscriptions/I-NEW001") return Response.json(remote);
  throw new Error(`Unexpected mocked PayPal request: ${parsed.pathname}`);
};

try {
  const [user] = await db.insert(users, { email: "billing-replacement@example.test", name: "Billing", passwordHash: "test" });
  const [workspace] = await db.insert(workspaces, { name: "Billing replacement", slug: "billing-replacement", ownerId: user.id, aiCreditsBalance: 137 });
  const oldPlan = getPlanDefinition("starter_ai");
  await db.insert(billingIntents, { workspaceId: workspace.id, environment: "sandbox", requestKey: "mongo-old-request", bindingKey: old.custom_id,
    planVersionId: 7, planSnapshot: oldPlan, paypalPlanId: old.plan_id, paypalProductId: "PROD-AAAAAAAAAAAAAAAAA", interval: "month",
    paypalSubscriptionId: old.id, state: "cancelled" });
  await db.insert(billingPayments, { workspaceId: workspace.id, paymentKey: "sandbox:SALE-OLD", paypalTransactionId: "SALE-OLD",
    environment: "sandbox", paypalSubscriptionId: old.id, planVersionId: 7, planSlug: oldPlan.slug, planSnapshot: oldPlan,
    interval: "month", currency: "USD", periodStart: start, periodEnd: end, paymentTime: start, amountPaid: oldPlan.monthlyPrice * 100 });
  await db.insert(billingSubscriptions, { workspaceId: workspace.id, environment: "sandbox", planSlug: oldPlan.slug, planSnapshot: oldPlan,
    paidThrough: end, paypalSubscriptionId: old.id, status: "CANCELLED", latestPaymentId: "sandbox:SALE-OLD", latestPaymentTime: start,
    creditEpoch: "old-credit-epoch", allowancePeriod: start, cancelAtPeriodEnd: true });

  await createBillingCheckout(workspace.id, nextPlan.slug, "month", 8, true);
  assert.equal((await getWorkspaceEntitlements(workspace.id)).plan.slug, oldPlan.slug);
  assert.equal((await db.find(workspaces, { id: workspace.id }))[0].aiCreditsBalance, 137);
  assert.equal(await reconcilePayPalSubscription(remote.id), false);
  remote.status = "ACTIVE";
  remote.billing_info = { last_payment: { time: paymentTime.toISOString(), amount: { currency_code: "USD", value: nextPlan.monthlyPrice.toFixed(2) } },
    next_billing_time: billingAnniversary(paymentTime, 1, "month").toISOString() };
  transactions = [{ id: "SALE-NEW", status: "COMPLETED", time: paymentTime.toISOString(),
    amount_with_breakdown: { gross_amount: { currency_code: "USD", value: nextPlan.monthlyPrice.toFixed(2) } } }];
  const compensation = replacementCreditAmount(oldPlan.monthlyPrice * 100, start, end, paymentTime);
  let release;
  let reached;
  transactionGate = { released: new Promise(resolve => { release = resolve; }), reached: () => reached() };
  const firstReached = new Promise(resolve => { reached = resolve; });
  const activation = { id: "WH-MONGO-ACTIVE", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: remote.id } };
  const sale = { id: "WH-MONGO-SALE", event_type: "PAYMENT.SALE.COMPLETED", resource: { billing_agreement_id: remote.id } };
  const first = processBillingEvent(activation);
  await firstReached;
  const others = [processBillingEvent(activation), processBillingEvent(sale)];
  try { await new Promise(resolve => setTimeout(resolve, 100)); }
  finally { release(); }
  await Promise.all([first, ...others]);
  await reconcilePayPalSubscription(remote.id);
  assert.equal((await getWorkspaceEntitlements(workspace.id)).plan.slug, nextPlan.slug);
  assert.equal((await db.find(workspaces, { id: workspace.id }))[0].aiCreditsBalance, 137 + compensation + nextPlan.includedMonthlyCredits);
  assert.equal((await db.find(billingPayments, { workspaceId: workspace.id, paypalSubscriptionId: remote.id })).length, 1);
  assert.equal((await db.find(billingGrants, { workspaceId: workspace.id })).length, 1);
  assert.deepEqual((await db.find(billingEvents, { eventKey: { $in: ["sandbox:WH-MONGO-ACTIVE", "sandbox:WH-MONGO-SALE"] } })).map(event => event.status).sort(), ["processed", "processed"]);
  await invalidatePayPalPayment("SALE-OLD", "refund");
  await invalidatePayPalPayment("SALE-OLD", "refund");
  assert.equal((await db.find(workspaces, { id: workspace.id }))[0].aiCreditsBalance, 137 + nextPlan.includedMonthlyCredits);
  assert.equal((await db.find(billingCreditLots, { workspaceId: workspace.id })).length, 2);
  console.log("MongoDB replacement checks passed: pending payment, concurrent webhooks, idempotent activation, carried credits and refund.");
} finally {
  await closeDatabase();
}
