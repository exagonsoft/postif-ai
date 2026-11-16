import type Stripe from "stripe";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { billingSubscriptions, billingInvoices, billingGrants, billingEvents, type BillingInvoice } from "@/db/billing-schema";
import { SUBSCRIPTION_PLANS } from "./plans";
import { allowanceWindow, invoicePaymentVerified } from "./billing-policy";
import { BillingError, billingPriceMap, billingRequestOptions, billingReturnUrl, getBillingReadiness, requireBilling, trustedStripeUrl, verifiedPrice, type BillingInterval } from "./stripe";

type Connection = typeof db;
export async function getCreditEpoch(workspaceId: number, connection: Connection = db) {
  const [record] = await connection.find(billingSubscriptions, { workspaceId }, connection === db ? {} : { lock: true });
  if (!record?.paidThrough || record.paidThrough.getTime() <= Date.now()) return `expired:${record?.paidThrough?.toISOString() || "never"}`;
  return record.creditEpoch || "initial";
}
function stripeId(value: string | { id: string } | null | undefined) { return typeof value === "string" ? value : value?.id; }
async function subscriptionRecord(workspaceId: number) {
  const [record] = await db.upsert(billingSubscriptions, "workspaceId", { workspaceId }, {});
  return record;
}
async function locked<T>(workspaceId: number, run: () => Promise<T>): Promise<T> {
  const result = await db.withLease(`billing:${workspaceId}`, async () => ({ value: await run() }), null);
  if (!result) throw new BillingError("Another billing operation is in progress. Please retry.", 409);
  return result.value;
}
export async function createBillingCheckout(workspaceId: number, planSlug: string, interval: BillingInterval) {
  const stripe = requireBilling();
  return locked(workspaceId, async () => {
    const mapping = await verifiedPrice(stripe, planSlug, interval);
    let record = await subscriptionRecord(workspaceId);
    if (record.stripeSubscriptionId) {
      let current = await stripe.subscriptions.retrieve(record.stripeSubscriptionId);
      const [reversed] = record.latestInvoiceId
        ? await db.find(billingInvoices, { stripeInvoiceId: record.latestInvoiceId, invalidatedAt: { $ne: null } })
        : [];
      if (!record.paidThrough && reversed?.invalidatedAt && !["canceled", "incomplete_expired"].includes(current.status)) {
        // A refunded/disputed term cannot be reused. Owner-initiated Checkout
        // replaces that non-entitled subscription with a genuinely new paid term.
        current = await stripe.subscriptions.cancel(current.id, { invoice_now: false, prorate: false });
      }
      if (!["canceled", "incomplete_expired"].includes(current.status)) throw new BillingError("Use the app plan selector to schedule changes at the paid-through boundary, or the portal to manage payment methods.", 409);
      if (record.paidThrough && record.paidThrough > new Date()) throw new BillingError("Your current paid period has not ended. Manage billing in the portal.", 409);
    }
    if (!record.stripeCustomerId) {
      if (record.customerIntentAt && Date.now() - record.customerIntentAt.getTime() > 23 * 3600000) throw new BillingError("Customer creation needs operator reconciliation before retrying safely.", 409);
      const customerKey = record.customerIntentKey || crypto.randomUUID();
      if (!record.customerIntentAt) await db.update(billingSubscriptions, { workspaceId }, { customerIntentAt: new Date(), customerIntentKey: customerKey });
      const customer = await stripe.customers.create({ metadata: { workspaceId: String(workspaceId) } }, { idempotencyKey: `postif-customer-${customerKey}` });
      [record] = await db.update(billingSubscriptions, { workspaceId }, { stripeCustomerId: customer.id, updatedAt: new Date() });
    }
    if (record.checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(record.checkoutSessionId);
      if (session.status === "open") {
        if (record.checkoutPlan !== planSlug || record.checkoutInterval !== interval) throw new BillingError("A checkout is already open for another plan. Complete it or wait for it to expire.", 409);
        return trustedStripeUrl(session.url, "checkout");
      }
      if (session.status === "complete") {
        const id = stripeId(session.subscription);
        const current = id ? await stripe.subscriptions.retrieve(id) : null;
        if (!current || !["canceled", "incomplete_expired"].includes(current.status)) throw new BillingError("Checkout is awaiting payment reconciliation. Please retry shortly.", 409);
      }
      [record] = await db.update(billingSubscriptions, { workspaceId }, { checkoutKey: null, checkoutSessionId: null, checkoutIntentAt: null });
    }
    // Persist the key before any provider call: retry after an uncertain network result
    // reuses the same Checkout Session, rather than creating a second subscription.
    if (record.checkoutKey && (record.checkoutPlan !== planSlug || record.checkoutInterval !== interval)) throw new BillingError("Retry the pending checkout using the original plan.", 409);
    if (record.checkoutKey && record.checkoutIntentAt && Date.now() - record.checkoutIntentAt.getTime() > 23 * 3600000) throw new BillingError("Pending checkout needs operator reconciliation before retrying safely.", 409);
    const key = record.checkoutKey || crypto.randomUUID();
    await db.update(billingSubscriptions, { workspaceId }, { checkoutKey: key, checkoutPlan: planSlug, checkoutInterval: interval, checkoutIntentAt: record.checkoutIntentAt || new Date() });
    const session = await stripe.checkout.sessions.create({
      customer: record.stripeCustomerId!, mode: "subscription", line_items: [{ price: mapping.priceId, quantity: 1 }],
      client_reference_id: String(workspaceId), metadata: { workspaceId: String(workspaceId) },
      subscription_data: { metadata: { workspaceId: String(workspaceId) } },
      success_url: `${billingReturnUrl()}?checkout=returned`, cancel_url: billingReturnUrl(),
      allow_promotion_codes: false, payment_method_collection: "always",
    }, { idempotencyKey: `postif-checkout-${key}` });
    await db.update(billingSubscriptions, { workspaceId }, { checkoutSessionId: session.id, updatedAt: new Date() });
    return trustedStripeUrl(session.url, "checkout");
  });
}
export async function createBillingPortal(workspaceId: number) {
  const stripe = requireBilling();
  const [record] = await db.find(billingSubscriptions, { workspaceId });
  if (!record?.stripeCustomerId) throw new BillingError("No billing customer exists for this workspace.", 409);
  // Configure the Stripe portal to cancel at period end and disable plan/quantity
  // changes, coupons, trials and prorations. Plan changes require a fresh paid term.
  const configurationId = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (!configurationId) throw new BillingError("The billing portal configuration is missing.");
  const config = await stripe.billingPortal.configurations.retrieve(configurationId);
  if (!config.active || config.features.subscription_update.enabled ||
    !config.features.payment_method_update.enabled || !config.features.subscription_cancel.enabled ||
    config.features.subscription_cancel.mode !== "at_period_end") {
    throw new BillingError("The portal must enable payment-method updates and period-end cancellation, and disable plan changes.");
  }
  const session = await stripe.billingPortal.sessions.create({ customer: record.stripeCustomerId, configuration: configurationId, return_url: billingReturnUrl() });
  return trustedStripeUrl(session.url, "portal");
}

export function billingChangePhases(current: { priceId: string; start: number; end: number }, next: { priceId: string; interval: BillingInterval }): Stripe.SubscriptionScheduleUpdateParams.Phase[] {
  if (!Number.isSafeInteger(current.start) || !Number.isSafeInteger(current.end) || current.end <= current.start) throw new BillingError("Invalid paid billing period.", 409);
  return [
    { start_date: current.start, end_date: current.end, items: [{ price: current.priceId, quantity: 1 }], proration_behavior: "none" },
    { start_date: current.end, duration: { interval: next.interval, interval_count: 1 },
      items: [{ price: next.priceId, quantity: 1 }], billing_cycle_anchor: "phase_start", proration_behavior: "none" },
  ];
}

export async function changeBillingSubscription(workspaceId: number, planSlug: string, interval: BillingInterval, options: { stripe?: Stripe } = {}) {
  const stripe = options.stripe || requireBilling();
  return locked(workspaceId, async () => {
    let [record] = await db.find(billingSubscriptions, { workspaceId });
    if (!record?.stripeSubscriptionId) throw new BillingError("Use Checkout to start a paid subscription.", 409);
    let subscription = await stripe.subscriptions.retrieve(record.stripeSubscriptionId);
    if (stripeId(subscription.customer) !== record.stripeCustomerId || subscription.metadata.workspaceId !== String(workspaceId)) throw new BillingError("Subscription ownership does not match.", 409);
    if (subscription.status !== "active" || !record.paidThrough || record.paidThrough <= new Date()) {
      throw new BillingError("Changes require a currently paid active subscription. Settle the outstanding invoice or start a new Checkout after expiry.", 409);
    }
    const effectiveAt = record.paidThrough;
    const item = subscription.items.data[0];
    if (!item || subscription.items.data.length !== 1 || item.quantity !== 1 ||
      item.current_period_end * 1000 !== record.paidThrough.getTime()) throw new BillingError("Subscription requires payment reconciliation before it can change.", 409);
    const next = planSlug === "free" ? null : await verifiedPrice(stripe, planSlug, interval);
    const target = next ? `${planSlug}:${interval}` : "free";
    if (record.changeIntentKey && record.changeIntentTarget !== target) throw new BillingError("Retry the pending billing change before requesting another.", 409);
    const key = record.changeIntentKey || crypto.randomUUID();
    [record] = await db.update(billingSubscriptions, { workspaceId }, { changeIntentKey: key, changeIntentTarget: target });
    const scheduleId = stripeId(subscription.schedule);
    if (!next || next.priceId === item.price.id) {
      if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId, { preserve_cancel_date: false }, { idempotencyKey: `postif-release-${key}` });
      subscription = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: !next, proration_behavior: "none" }, { idempotencyKey: `postif-renewal-${key}` });
      await db.update(billingSubscriptions, { workspaceId }, {
        cancelAtPeriodEnd: subscription.cancel_at_period_end, stripeScheduleId: null,
        pendingPlanSlug: next ? null : "free", pendingInterval: null,
        pendingEffectiveAt: next ? null : effectiveAt, changeIntentKey: null, changeIntentTarget: null, updatedAt: new Date(),
      });
      return { message: next ? "Renewal reactivated on your existing paid plan. Any scheduled plan change was removed." : "Cancellation scheduled for the paid-through date. Your data and paid access remain until then." };
    }
    if (subscription.cancel_at_period_end) {
      subscription = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false }, { idempotencyKey: `postif-resume-${key}` });
    }
    const schedule = scheduleId
      ? await stripe.subscriptionSchedules.retrieve(scheduleId)
      : await stripe.subscriptionSchedules.create({ from_subscription: subscription.id }, { idempotencyKey: `postif-schedule-${key}` });
    const phases = billingChangePhases({
      priceId: item.price.id, start: schedule.current_phase?.start_date || item.current_period_start, end: item.current_period_end,
    }, { priceId: next.priceId!, interval });
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release", proration_behavior: "none", phases,
      metadata: { workspaceId: String(workspaceId), managedBy: "postif" },
    }, { idempotencyKey: `postif-schedule-update-${key}` });
    await db.update(billingSubscriptions, { workspaceId }, {
      stripeScheduleId: schedule.id, pendingPlanSlug: planSlug, pendingInterval: interval,
      pendingEffectiveAt: effectiveAt, cancelAtPeriodEnd: false,
      changeIntentKey: null, changeIntentTarget: null, updatedAt: new Date(),
    });
    return { message: `${next.plan.name} (${interval === "year" ? "annual" : "monthly"}) is scheduled for ${effectiveAt.toISOString()}. New access requires its invoice to be paid; no proration is charged now.` };
  });
}

async function grantAllowance(tx: Connection, evidence: BillingInvoice, now: Date) {
  const plan = SUBSCRIPTION_PLANS[evidence.planSlug as keyof typeof SUBSCRIPTION_PLANS];
  if (!plan || plan.slug === "free" || evidence.invalidatedAt) return false;
  const window = evidence.interval === "month"
    ? (evidence.periodStart <= now && now < evidence.periodEnd ? { start: evidence.periodStart, end: evidence.periodEnd } : null)
    : allowanceWindow(evidence.periodStart, evidence.periodEnd, now);
  if (!window) return false;
  const [subscription] = await tx.find(billingSubscriptions, { workspaceId: evidence.workspaceId }, { lock: true });
  if (!subscription?.paidThrough || subscription.paidThrough <= now || subscription.planSlug !== plan.slug ||
    subscription.stripeSubscriptionId !== evidence.stripeSubscriptionId ||
    (subscription.allowancePeriod && subscription.allowancePeriod >= window.start)) return false;
  const grantKey = `${evidence.workspaceId}:${window.start.toISOString()}`;
  const [existing] = await tx.find(billingGrants, { grantKey });
  if (existing) return false;
  await tx.insert(billingGrants, {
    grantKey, workspaceId: evidence.workspaceId, stripeInvoiceId: evidence.stripeInvoiceId,
    periodStart: window.start, periodEnd: window.end, credits: plan.includedMonthlyCredits,
  });
  await tx.update(workspaces, { id: evidence.workspaceId }, {
    aiCreditsBalance: plan.includedMonthlyCredits, aiCreditsMonthlyAllowance: plan.includedMonthlyCredits,
  });
  await tx.update(billingSubscriptions, { workspaceId: evidence.workspaceId }, { allowancePeriod: window.start, creditEpoch: grantKey, updatedAt: now });
  return true;
}

async function applyPaidPeriod(tx: Connection, evidence: BillingInvoice, now: Date) {
  const plan = SUBSCRIPTION_PLANS[evidence.planSlug as keyof typeof SUBSCRIPTION_PLANS];
  if (!plan || plan.slug === "free" || evidence.invalidatedAt || evidence.periodStart > now || evidence.periodEnd <= now) return false;
  await tx.update(billingSubscriptions, { workspaceId: evidence.workspaceId }, {
    planSlug: plan.slug, paidThrough: evidence.periodEnd, stripePriceId: evidence.stripePriceId,
    currency: evidence.currency, interval: evidence.interval, latestInvoiceId: evidence.stripeInvoiceId,
    latestInvoiceCreated: evidence.invoiceCreated,
  });
  const [record] = await tx.find(billingSubscriptions, { workspaceId: evidence.workspaceId });
  await tx.update(workspaces, { id: evidence.workspaceId }, {
    planSlug: plan.slug, billingCycle: evidence.interval === "year" ? "annual" : "monthly",
    subscriptionStatus: record.status, stripeCustomerId: record.stripeCustomerId,
    stripeSubscriptionId: record.stripeSubscriptionId, aiCreditsMonthlyAllowance: plan.includedMonthlyCredits,
    ...(!plan.allowsConfigurableAiMode ? { aiBillingMode: plan.defaultAiMode } : {}),
  });
  return grantAllowance(tx, evidence, now);
}

export async function refreshSubscriptionAllowances(options: { now?: Date; limit?: number; deadline?: number; reconcile?: boolean } = {}) {
  const now = options.now || new Date();
  const limit = Math.max(1, Math.min(options.limit || 100, 500));
  // Oldest-updated first prevents a fixed first page starving later workspaces.
  const records = await db.find(billingSubscriptions, {}, { limit, sort: { updatedAt: 1 } });
  const stripe = options.reconcile !== false && getBillingReadiness().ready ? requireBilling() : null;
  let granted = 0, expired = 0, failed = 0;
  for (const record of records) {
    if (options.deadline && Date.now() >= options.deadline) break;
    if (stripe) {
      try {
        let subscriptionId = record.stripeSubscriptionId;
        if (record.checkoutSessionId && (record.checkoutKey || !subscriptionId)) {
          subscriptionId = stripeId((await stripe.checkout.sessions.retrieve(record.checkoutSessionId, {}, billingRequestOptions(options.deadline))).subscription) || subscriptionId;
        }
        if (subscriptionId && await reconcileSubscription(stripe, subscriptionId, options.deadline)) granted++;
      } catch {
        // Keep existing paid-through evidence, surface failure to the runner, and
        // retry next tick. A provider outage cannot extend an unpaid term.
        failed++;
      }
    }
    const outcome = await db.transaction(async tx => {
      const [current] = await tx.find(billingSubscriptions, { workspaceId: record.workspaceId }, { lock: true });
      if (!current) return;
      const [invoice] = await tx.find(billingInvoices, {
        workspaceId: current.workspaceId, stripeSubscriptionId: current.stripeSubscriptionId,
        periodStart: { $lte: now }, periodEnd: { $gt: now }, invalidatedAt: null,
      }, { sort: { invoiceCreated: -1 }, limit: 1 });
      if (invoice && invoice.invoiceCreated >= current.latestInvoiceCreated) {
        if (await applyPaidPeriod(tx, invoice, now)) return "granted";
      } else if (!current.paidThrough || current.paidThrough <= now) {
        await tx.update(workspaces, { id: current.workspaceId }, {
          planSlug: "free", aiBillingMode: "byok", aiCreditsBalance: 0, aiCreditsMonthlyAllowance: 0,
          subscriptionStatus: current.status,
        });
        await tx.update(billingSubscriptions, { workspaceId: current.workspaceId }, { creditEpoch: `expired:${current.paidThrough?.toISOString() || "never"}`, updatedAt: now });
        return current.planSlug !== "free" ? "expired" : undefined;
      }
      await tx.update(billingSubscriptions, { workspaceId: current.workspaceId }, { updatedAt: now });
    });
    if (outcome === "granted") granted++;
    if (outcome === "expired") expired++;
  }
  return { scanned: records.length, granted, expired, failed };
}

export async function verifySubscriptionInvoice(stripe: Stripe, invoice: Stripe.Invoice, subscription: Stripe.Subscription, workspaceId: number, options: { now?: Date; deadline?: number; onReversal?: (reason: string) => void } = {}): Promise<Omit<BillingInvoice, "id"> | null> {
  if (invoice.status !== "paid" || !["subscription_create", "subscription_cycle", "subscription_update"].includes(invoice.billing_reason || "")) return null;
  // No trials, proration, metering, discounts or multi-item subscriptions.
  // Fully settled invoices using preexisting Stripe balance are accepted; a
  // zero-price/discounted invoice is not proof of a paid catalog subscription.
  const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 }, billingRequestOptions(options.deadline));
  if (lines.has_more || lines.data.length !== 1 || subscription.items.data.length !== 1 || subscription.trial_start) return null;
  const line = lines.data[0];
  const start = new Date(line.period.start * 1000), end = new Date(line.period.end * 1000);
  if (end <= start || (options.now && end <= options.now)) return null;
  const priceId = line.pricing?.price_details?.price;
  const id = stripeId(priceId);
  const mapping = billingPriceMap().find(p => p.priceId && p.priceId === id);
  if (!mapping) throw new BillingError("The invoice Stripe Price has no configured catalog mapping.");
  if (line.quantity !== 1 || line.amount !== mapping.amount ||
    line.parent?.subscription_item_details?.proration ||
    line.parent?.subscription_item_details?.subscription_item !== subscription.items.data[0].id ||
    stripeId(invoice.parent?.subscription_details?.subscription) !== subscription.id ||
    stripeId(invoice.customer) !== stripeId(subscription.customer) ||
    subscription.items.data[0].price.id !== id ||
    !invoicePaymentVerified(invoice, mapping.amount)) return null;
  const stripeChargeIds: string[] = [];
  if (invoice.amount_due > 0) {
    let settled = 0;
    const payments = await stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 }, billingRequestOptions(options.deadline));
    if (payments.has_more) throw new BillingError("Invoice settlement requires operator reconciliation.");
    for (const payment of payments.data) {
      if (payment.currency !== "usd" || !payment.amount_paid) continue;
      if (payment.payment.type === "payment_intent") {
        const id = stripeId(payment.payment.payment_intent);
        const intent = id ? await stripe.paymentIntents.retrieve(id, {}, billingRequestOptions(options.deadline)) : null;
        const chargeId = stripeId(intent?.latest_charge);
        const charge = chargeId ? await stripe.charges.retrieve(chargeId, {}, billingRequestOptions(options.deadline)) : null;
        if (charge && (charge.amount_refunded > 0 || charge.disputed)) options.onReversal?.(charge.amount_refunded > 0 ? "refund" : "dispute");
        if (intent?.status === "succeeded" && intent.currency === "usd" && charge &&
          charge.paid && charge.captured && !charge.disputed && charge.amount_refunded === 0 &&
          stripeId(intent.customer) === stripeId(subscription.customer) &&
          stripeId(charge.customer) === stripeId(subscription.customer) &&
          charge.currency === "usd" && charge.amount >= payment.amount_paid &&
          intent.amount_received >= payment.amount_paid) {
          settled += payment.amount_paid;
          stripeChargeIds.push(charge.id);
        }
      } else if (payment.payment.type === "charge") {
        const id = stripeId(payment.payment.charge);
        const charge = id ? await stripe.charges.retrieve(id, {}, billingRequestOptions(options.deadline)) : null;
        if (charge && (charge.amount_refunded > 0 || charge.disputed)) options.onReversal?.(charge.amount_refunded > 0 ? "refund" : "dispute");
        if (charge?.paid && charge.captured && !charge.disputed && charge.amount_refunded === 0 && charge.status === "succeeded" && charge.currency === "usd" &&
          stripeId(charge.customer) === stripeId(subscription.customer) &&
          charge.amount >= payment.amount_paid) {
          settled += payment.amount_paid;
          stripeChargeIds.push(charge.id);
        }
      }
      // External/manual payment records are deliberately not payment evidence.
    }
    if (settled < invoice.amount_due) return null;
  }
  await verifiedPrice(stripe, mapping.plan.slug, mapping.interval, options.deadline);
  if (end.getTime() - start.getTime() > (mapping.interval === "year" ? 366 : 31) * 86400000) return null;
  return {
    stripeInvoiceId: invoice.id, workspaceId, stripeSubscriptionId: subscription.id,
    planSlug: mapping.plan.slug, stripePriceId: id!, currency: "usd", interval: mapping.interval,
    periodStart: start, periodEnd: end, invoiceCreated: invoice.created, amountPaid: invoice.amount_paid, verifiedAt: new Date(),
    invalidatedAt: null, invalidationReason: null, stripeChargeIds,
  };
}

async function invalidateStoredInvoice(tx: Connection, workspaceId: number, invoiceId: string, reason: string) {
  const [record] = await tx.find(billingSubscriptions, { workspaceId }, { lock: true });
  await tx.update(billingInvoices, { stripeInvoiceId: invoiceId }, { invalidatedAt: new Date(), invalidationReason: reason });
  if (record?.latestInvoiceId === invoiceId) {
    await tx.update(billingSubscriptions, { workspaceId }, { paidThrough: null, creditEpoch: `reversal:${invoiceId}`, updatedAt: new Date() });
    await tx.update(workspaces, { id: workspaceId }, { planSlug: "free", aiBillingMode: "byok", aiCreditsBalance: 0, aiCreditsMonthlyAllowance: 0 });
  }
}

export async function invalidateReversedPayment(stripe: Stripe, chargeId: string) {
  const charge = await stripe.charges.retrieve(chargeId);
  const reason = charge.amount_refunded > 0 ? "refund" : charge.disputed ? "dispute" : null;
  if (!reason) return 0;
  const invoiceIds = new Set((await db.find(billingInvoices, { stripeChargeIds: charge.id })).map(i => i.stripeInvoiceId));
  const intentId = stripeId(charge.payment_intent);
  if (intentId) {
    const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intentId }, limit: 100 });
    if (payments.has_more) throw new BillingError("Reversed payment requires operator reconciliation.");
    for (const payment of payments.data) {
      const invoiceId = stripeId(payment.invoice);
      if (invoiceId) invoiceIds.add(invoiceId);
    }
  }
  let affected = 0;
  for (const invoiceId of invoiceIds) {
    const [evidence] = await db.find(billingInvoices, { stripeInvoiceId: invoiceId });
    if (!evidence) continue;
    await locked(evidence.workspaceId, async () => db.transaction(tx => invalidateStoredInvoice(tx, evidence.workspaceId, invoiceId, reason)));
    affected++;
  }
  return affected;
}

async function reconcileSubscription(stripe: Stripe, subscriptionId: string, deadline?: number) {
  // Always retrieve current provider state, never apply a stale event payload.
  const initial = await stripe.subscriptions.retrieve(subscriptionId, {}, billingRequestOptions(deadline));
  const workspaceId = Number(initial.metadata.workspaceId);
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) return;
  return locked(workspaceId, async () => {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, billingRequestOptions(deadline));
    if (subscription.metadata.workspaceId !== String(workspaceId)) throw new BillingError("Subscription workspace changed unexpectedly.", 409);
    const [record] = await db.find(billingSubscriptions, { workspaceId });
    if (!record || record.stripeCustomerId !== stripeId(subscription.customer)) throw new BillingError("Subscription customer does not match the workspace.", 409);
    if (record.stripeSubscriptionId && record.stripeSubscriptionId !== subscription.id) {
      const old = await stripe.subscriptions.retrieve(record.stripeSubscriptionId, {}, billingRequestOptions(deadline));
      if (!["canceled", "incomplete_expired"].includes(old.status) || (record.paidThrough && record.paidThrough > new Date())) return;
    }
    if (record.stripeSubscriptionId !== subscription.id) {
      if (!record.checkoutKey) throw new BillingError("Subscription has no workspace checkout authorization.", 409);
      // The session is provider evidence binding this exact subscription to the
      // persisted checkout intent; metadata alone never authorizes activation.
      const sessions = record.checkoutSessionId
        ? [await stripe.checkout.sessions.retrieve(record.checkoutSessionId, {}, billingRequestOptions(deadline))]
        : (await stripe.checkout.sessions.list({ subscription: subscription.id, limit: 10 }, billingRequestOptions(deadline))).data;
      if (!sessions.some(s => s.mode === "subscription" && s.status === "complete" &&
        stripeId(s.subscription) === subscription.id && stripeId(s.customer) === record.stripeCustomerId &&
        s.client_reference_id === String(workspaceId))) throw new BillingError("Subscription checkout is not yet reconciled.", 409);
    }
    const evidence: Omit<BillingInvoice, "id">[] = [];
    const reversed = new Map<string, string>();
    const now = new Date();
    // Recent settled terms cover recovery after missed deliveries. Historical
    // expired invoices cannot grant anything, so bound provider work per tick.
    const invoices = await stripe.invoices.list({ subscription: subscription.id, status: "paid", limit: 12 }, billingRequestOptions(deadline));
    for (const invoice of invoices.data) {
      const verified = await verifySubscriptionInvoice(stripe, invoice, subscription, workspaceId, { now, deadline, onReversal: reason => reversed.set(invoice.id, reason) });
      if (verified) {
        evidence.push(verified);
        if (verified.periodStart <= now && verified.periodEnd > now) break;
      }
    }
    return db.transaction(async tx => {
      const [current] = await tx.find(billingSubscriptions, { workspaceId }, { lock: true });
      if (!current) throw new BillingError("Workspace billing record disappeared.", 409);
      await tx.update(billingSubscriptions, { workspaceId }, {
        stripeSubscriptionId: subscription.id, status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null, updatedAt: now,
        ...(current.stripeSubscriptionId !== subscription.id ? { checkoutKey: null } : {}),
        ...(subscription.cancel_at_period_end ? { pendingPlanSlug: "free", pendingInterval: null, pendingEffectiveAt: current.paidThrough } :
          current.pendingPlanSlug === "free" ? { pendingPlanSlug: null, pendingInterval: null, pendingEffectiveAt: null } : {}),
        ...(current.pendingEffectiveAt && current.pendingEffectiveAt <= now &&
          (subscription.items.data[0]?.price.id === billingPriceMap().find(p => p.plan.slug === current.pendingPlanSlug && p.interval === current.pendingInterval)?.priceId)
          ? { pendingPlanSlug: null, pendingInterval: null, pendingEffectiveAt: null } : {}),
      });
      for (const item of evidence.sort((a, b) => a.invoiceCreated - b.invoiceCreated)) {
        await tx.insert(billingInvoices, item, { ignoreDuplicates: true });
      }
      for (const [invoiceId, reason] of reversed) await invalidateStoredInvoice(tx, workspaceId, invoiceId, reason);
      const eligible = evidence.filter(item => item.periodStart <= now && item.periodEnd > now)
        .sort((a, b) => b.invoiceCreated - a.invoiceCreated)[0];
      if (eligible && (eligible.invoiceCreated >= current.latestInvoiceCreated || current.stripeSubscriptionId !== subscription.id)) {
        // paidThrough is derived exclusively from verified settled invoice lines,
        // not subscription status, Checkout return, or current_period_end.
        const [saved] = await tx.find(billingInvoices, { stripeInvoiceId: eligible.stripeInvoiceId });
        return applyPaidPeriod(tx, saved, now);
      }
      return false;
    });
  });
}

export async function processBillingEvent(event: Stripe.Event) {
  await db.insert(billingEvents, { stripeEventId: event.id, type: event.type }, { ignoreDuplicates: true });
  const handled = await db.withLease(`billing-event:${event.id}`, async () => {
    const [inbox] = await db.find(billingEvents, { stripeEventId: event.id });
    if (inbox.status === "processed") return true;
    await db.update(billingEvents, { stripeEventId: event.id }, { status: "processing", attempts: inbox.attempts + 1 });
    try {
      const stripe = requireBilling();
      const object = event.data.object;
      let id: string | undefined;
      if (["charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
        "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated", "refund.created", "refund.updated"].includes(event.type)) {
        const chargeId = event.type.startsWith("charge.dispute.")
          ? stripeId((object as Stripe.Dispute).charge)
          : event.type.startsWith("refund.") ? stripeId((object as Stripe.Refund).charge) : (object as Stripe.Charge).id;
        if (chargeId) await invalidateReversedPayment(stripe, chargeId);
      }
      if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
        "customer.subscription.paused", "customer.subscription.resumed",
        "customer.subscription.pending_update_applied", "customer.subscription.pending_update_expired"].includes(event.type)) id = (object as Stripe.Subscription).id;
      else if (["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.finalized",
        "invoice.updated", "invoice.voided", "invoice.marked_uncollectible"].includes(event.type)) {
        const invoice = await stripe.invoices.retrieve((object as Stripe.Invoice).id);
        id = stripeId(invoice.parent?.subscription_details?.subscription);
      }
      else if (["checkout.session.completed", "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed"].includes(event.type)) id = stripeId((object as Stripe.Checkout.Session).subscription);
      if (id) await reconcileSubscription(stripe, id);
      await db.update(billingEvents, { stripeEventId: event.id }, { status: "processed", processedAt: new Date() });
      return true;
    } catch (error) {
      await db.update(billingEvents, { stripeEventId: event.id }, { status: "failed" });
      throw error;
    }
  }, false);
  if (!handled) throw new BillingError("Webhook processing is in progress. Retry delivery.", 503);
}
