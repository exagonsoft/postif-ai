import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { billingSubscriptions, billingIntents, billingPayments, billingGrants, billingEvents, billingReversals, type BillingIntent, type BillingPayment } from "@/db/billing-schema";
import { allowanceWindow, paidTransactionWindow } from "./billing-policy";
import { getPurchasablePlan } from "./billing-catalog";
import { BillingError, DEFAULT_PAYPAL_PAYMENT_POLICY, billingReturnUrl, catalogAmount, getBillingReadiness, getPayPalDispute, getPayPalEnvironment, getPayPalPaymentPolicy, getPayPalPlan, moneyCents, paypalRequest, providerId, requireBilling, trustedPayPalUrl, verifyPayPalPlan, type BillingInterval, type PayPalEvent, type PayPalSubscription, type PayPalTransaction } from "./paypal";

type Connection = typeof db;
const approved = new Set(["APPROVED", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]);
const canceled = new Set(["CANCELLED", "EXPIRED"]);
async function locked<T>(workspaceId: number, operation: () => Promise<T>) {
  const result = await db.withLease(`billing:${workspaceId}`, async () => ({ value: await operation() }), null);
  if (!result) throw new BillingError("Another billing operation is in progress. Retry the original action.", 409);
  return result.value;
}
export async function getCreditEpoch(workspaceId: number, connection: Connection = db) {
  const [record] = await connection.find(billingSubscriptions, { workspaceId }, connection === db ? {} : { lock: true });
  if (record?.environment !== getPayPalEnvironment() || !record?.paidThrough || record.paidThrough <= new Date()) return `expired:${record?.paidThrough?.toISOString() || "never"}`;
  return record.creditEpoch;
}
function subscription(id: string, deadline?: number) {
  return paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${providerId(id)}`, { deadline });
}
function checkBinding(intent: BillingIntent, remote: PayPalSubscription) {
  providerId(remote.id);
  if (intent.environment !== getPayPalEnvironment() || remote.custom_id !== intent.bindingKey ||
    (remote.plan_id !== intent.paypalPlanId && remote.plan_id !== intent.pendingRevision?.paypalPlanId) || (intent.paypalSubscriptionId && intent.paypalSubscriptionId !== remote.id) ||
    (remote.quantity && remote.quantity !== "1") || remote.plan_overridden ||
    (intent.expectedStart && Math.abs(new Date(remote.start_time).getTime() - intent.expectedStart.getTime()) > 1000)) {
    throw new BillingError("PayPal subscription does not match its workspace purchase authorization.", 409);
  }
}
async function stopRenewal(id: string, deadline?: number) {
  const current = await subscription(id, deadline);
  if (canceled.has(current.status)) return current;
  await paypalRequest<void>(`/v1/billing/subscriptions/${providerId(id)}/cancel`, { method: "POST", deadline, body: { reason: "Workspace owner requested cancellation of future renewals." } });
  const stopped = await subscription(id, deadline);
  if (!canceled.has(stopped.status)) throw new BillingError("PayPal cancellation is awaiting reconciliation.", 409);
  return stopped;
}
async function checkoutLocked(workspaceId: number, planSlug: string, interval: BillingInterval, expectedVersionId?: number) {
  const environment = getPayPalEnvironment();
  let [record] = await db.upsert(billingSubscriptions, "workspaceId", { workspaceId, environment }, {});
  if (record.environment !== environment && record.paypalSubscriptionId) throw new BillingError("Cancel the subscription in its original PayPal environment before changing environments.", 409);
  if (record.pendingIntentId) {
    const [intent] = await db.find(billingIntents, { id: record.pendingIntentId, workspaceId, environment });
    if (!intent || intent.planSnapshot.slug !== planSlug || intent.interval !== interval ||
      (expectedVersionId !== undefined && intent.planVersionId !== expectedVersionId)) throw new BillingError("Complete or withdraw the pending approval before choosing another plan.", 409);
    return issueApproval(intent);
  }
  const mapping = await getPurchasablePlan(planSlug, interval, expectedVersionId);
  const providerPlan = await getPayPalPlan(mapping.paypalPlanId);
  verifyPayPalPlan(providerPlan, mapping.definition, interval, mapping.paypalProductId, false, mapping.paymentPolicy);
  const paymentPolicy = getPayPalPaymentPolicy(providerPlan);
  const paid = record.environment === environment && record.paidThrough && record.paidThrough > new Date();
  if (paid) throw new BillingError("Use a same-product plan change, or cancel and wait for paid access to expire before purchasing another product.", 409);
  if (record.paypalSubscriptionId) {
    const stopped = await stopRenewal(record.paypalSubscriptionId);
    const lastPayment = stopped.billing_info?.last_payment?.time;
    if (lastPayment && (!record.latestPaymentTime || new Date(lastPayment) > record.latestPaymentTime)) {
      throw new BillingError("An existing PayPal payment needs reconciliation before another purchase.", 409);
    }
  }
  const [intent] = await db.transaction(async tx => {
    await tx.find(workspaces, { id: workspaceId }, { lock: true });
    const [created] = await tx.insert(billingIntents, {
      workspaceId, environment, requestKey: crypto.randomUUID(), bindingKey: crypto.randomUUID(),
      planVersionId: mapping.versionId, planSnapshot: { ...mapping.definition, catalogVersionId: mapping.versionId }, paypalPlanId: mapping.paypalPlanId,
      paypalProductId: mapping.paypalProductId, paymentPolicy, interval, expectedStart: paid ? record.paidThrough : null,
      replacesSubscriptionId: record.paypalSubscriptionId,
    });
    [record] = await tx.update(billingSubscriptions, { workspaceId }, {
      environment, pendingIntentId: created.id, pendingPlanSlug: planSlug,
      pendingInterval: interval, pendingEffectiveAt: created.expectedStart, updatedAt: new Date(),
    });
    return [created];
  });
  return issueApproval(intent);
}
async function issueApproval(intent: BillingIntent) {
  if (intent.approvalUrl) return trustedPayPalUrl(intent.approvalUrl);
  let id = intent.paypalSubscriptionId;
  if (!id) {
    if (Date.now() - intent.createdAt.getTime() > 71 * 3600000) throw new BillingError("Uncertain PayPal purchase requires operator reconciliation before retrying.", 409);
    const created = await paypalRequest<{ id: string }>("/v1/billing/subscriptions", {
      method: "POST", requestId: intent.requestKey, body: {
        plan_id: intent.paypalPlanId, quantity: "1", custom_id: intent.bindingKey,
        ...(intent.expectedStart ? { start_time: intent.expectedStart.toISOString() } : {}),
        application_context: { user_action: "SUBSCRIBE_NOW", shipping_preference: "NO_SHIPPING",
          return_url: `${billingReturnUrl()}?paypal=returned`, cancel_url: `${billingReturnUrl()}?paypal=cancelled` },
      },
    });
    providerId(created.id);
    await db.update(billingIntents, { id: intent.id }, { paypalSubscriptionId: created.id, updatedAt: new Date() });
    id = created.id;
  }
  const remote = await subscription(id);
  checkBinding({ ...intent, paypalSubscriptionId: id }, remote);
  const url = trustedPayPalUrl(remote.links?.find(link => link.rel === "approve")?.href);
  await db.update(billingIntents, { id: intent.id }, { paypalSubscriptionId: remote.id, approvalUrl: url, state: "approval_pending", updatedAt: new Date() });
  return url;
}
export async function createBillingCheckout(workspaceId: number, planSlug: string, interval: BillingInterval, expectedVersionId?: number) {
  if (planSlug === "free") throw new BillingError("Free does not require PayPal checkout. Select Free to withdraw a pending purchase or stop renewals.", 400);
  requireBilling();
  const [current] = await db.find(billingSubscriptions, { workspaceId });
  if (current?.paypalSubscriptionId && current.environment === getPayPalEnvironment() && !current.pendingIntentId &&
    (!current.paidThrough || current.paidThrough <= new Date())) {
    await reconcilePayPalSubscription(current.paypalSubscriptionId);
  }
  return locked(workspaceId, () => checkoutLocked(workspaceId, planSlug, interval, expectedVersionId));
}
export async function changeBillingSubscription(workspaceId: number, planSlug: string, interval: BillingInterval, expectedVersionId?: number) {
  if (planSlug !== "free") requireBilling();
  return locked(workspaceId, async () => {
    const [record] = await db.find(billingSubscriptions, { workspaceId });
    const [pending] = planSlug === "free" && record?.pendingIntentId ? await db.find(billingIntents, {
      id: record.pendingIntentId, workspaceId, environment: record.environment,
    }) : [];
    if (planSlug === "free" && record?.pendingIntentId && !pending) throw new BillingError("Subscription purchase authorization is missing.", 409);
    const paid = !!record?.paidThrough && record.paidThrough > new Date();
    const unpaidCheckout = pending && !pending.pendingRevision && ["creating", "approval_pending"].includes(pending.state);
    if (planSlug === "free" && !paid && (unpaidCheckout || !record?.paypalSubscriptionId || ["inactive", "APPROVAL_PENDING"].includes(record.status))) {
      if (record && record.environment !== getPayPalEnvironment() && (record.paypalSubscriptionId || record.pendingIntentId)) {
        throw new BillingError("Withdraw the purchase in its original PayPal environment.", 409);
      }
      const filters = [
        ...(record?.pendingIntentId ? [{ id: record.pendingIntentId }] : []),
        ...(record?.paypalSubscriptionId ? [{ paypalSubscriptionId: record.paypalSubscriptionId }] : []),
      ];
      const authorizations = record && filters.length ? await db.find(billingIntents, {
        workspaceId, environment: record.environment, $or: filters,
      }) : [];
      if (record?.paypalSubscriptionId && !authorizations.some(intent => intent.paypalSubscriptionId === record.paypalSubscriptionId)) throw new BillingError("Subscription purchase authorization is missing.", 409);
      await db.transaction(async tx => {
        await tx.find(workspaces, { id: workspaceId }, { lock: true });
        for (const intent of authorizations) await tx.update(billingIntents, { id: intent.id }, {
          state: "abandoned", approvalUrl: null, pendingRevision: null, updatedAt: new Date(),
        });
        if (record) await tx.update(billingSubscriptions, { workspaceId }, {
          planSlug: "free", planSnapshot: null, paidThrough: null, paypalSubscriptionId: null, paypalPayerId: null,
          status: "inactive", cancelAtPeriodEnd: false, canceledAt: null, allowancePeriod: null,
          creditEpoch: `expired:${record.paidThrough?.toISOString() || "never"}`,
          pendingIntentId: null, pendingPlanSlug: null, pendingInterval: null, pendingEffectiveAt: null, updatedAt: new Date(),
        });
        await tx.update(workspaces, { id: workspaceId }, { planSlug: "free", aiBillingMode: "byok", aiCreditsBalance: 0, aiCreditsMonthlyAllowance: 0 });
      });
      return { message: record?.pendingIntentId ? "Pending checkout withdrawn. You remain on Free BYOK; no PayPal approval is required." : "You are on Free BYOK. No PayPal subscription or approval is required." };
    }
    requireBilling();
    if (!record?.paypalSubscriptionId || record.environment !== getPayPalEnvironment()) throw new BillingError("No subscription is available to cancel.", 409);
    const [intent] = await db.find(billingIntents, { paypalSubscriptionId: record.paypalSubscriptionId, workspaceId, environment: record.environment });
    if (!intent) throw new BillingError("Subscription purchase authorization is missing.", 409);
    const remote = await subscription(record.paypalSubscriptionId);
    checkBinding(intent, remote);
    if (planSlug === "free") {
      await stopRenewal(remote.id);
      await db.transaction(async tx => {
        await tx.find(billingSubscriptions, { workspaceId }, { lock: true });
        await tx.update(billingIntents, { id: intent.id }, { pendingRevision: null, updatedAt: new Date() });
        await tx.update(billingSubscriptions, { workspaceId }, { cancelAtPeriodEnd: true, status: "CANCELLED", canceledAt: new Date(),
          pendingIntentId: null, pendingPlanSlug: null, pendingInterval: null, pendingEffectiveAt: null, updatedAt: new Date() });
      });
      return { message: "PayPal renewals stopped. Verified paid access remains until the paid-through date." };
    }
    if (remote.status !== "ACTIVE" || !record.paidThrough || record.paidThrough <= new Date()) throw new BillingError("Plan changes require a currently paid active subscription. Cancelled subscriptions require a new purchase after expiry.", 409);
    const mapping = await getPurchasablePlan(planSlug, interval, expectedVersionId);
    if (mapping.paypalProductId !== intent.paypalProductId) throw new BillingError("PayPal cannot revise between products. Cancel, retain paid access, then purchase the new product after expiry.", 409);
    if (!intent.pendingRevision && mapping.paypalPlanId === intent.paypalPlanId) return { message: "This subscription already uses the selected terms." };
    if (intent.pendingRevision && (intent.pendingRevision.versionId !== mapping.versionId || intent.pendingRevision.interval !== interval)) throw new BillingError("Resolve the existing pending PayPal change before choosing another.", 409);
    const revision = intent.pendingRevision || { versionId: mapping.versionId, definition: { ...mapping.definition, catalogVersionId: mapping.versionId },
      paypalPlanId: mapping.paypalPlanId, paypalProductId: mapping.paypalProductId, paymentPolicy: mapping.paymentPolicy, interval,
      effectiveAt: record.paidThrough, requestKey: crypto.randomUUID(), approvalUrl: null, createdAt: new Date() };
    if (remote.plan_id === revision.paypalPlanId) return { message: "The approved PayPal change awaits its next verified paid renewal." };
    if (revision.approvalUrl) return { url: trustedPayPalUrl(revision.approvalUrl), message: "Complete the pending PayPal plan approval." };
    if (Date.now() - revision.createdAt.getTime() > 71 * 3600000) throw new BillingError("Uncertain PayPal revision needs operator reconciliation.", 409);
    const providerPlan = await getPayPalPlan(mapping.paypalPlanId);
    verifyPayPalPlan(providerPlan, mapping.definition, interval, mapping.paypalProductId, false, revision.paymentPolicy);
    revision.paymentPolicy ??= getPayPalPaymentPolicy(providerPlan);
    await db.transaction(async tx => {
      await tx.find(billingSubscriptions, { workspaceId }, { lock: true });
      await tx.update(billingIntents, { id: intent.id }, { pendingRevision: revision });
      await tx.update(billingSubscriptions, { workspaceId }, { pendingIntentId: intent.id, pendingPlanSlug: planSlug,
        pendingInterval: interval, pendingEffectiveAt: revision.effectiveAt, updatedAt: new Date() });
    });
    const result = await paypalRequest<{ links?: Array<{ rel: string; href: string }> }>(`/v1/billing/subscriptions/${providerId(remote.id)}/revise`, {
      method: "POST", requestId: revision.requestKey, body: { plan_id: mapping.paypalPlanId, quantity: "1",
        application_context: { return_url: `${billingReturnUrl()}?paypal=returned`, cancel_url: `${billingReturnUrl()}?paypal=cancelled` } },
    });
    const approval = result.links?.find(link => link.rel === "approve")?.href;
    if (approval) {
      const url = trustedPayPalUrl(approval);
      await db.update(billingIntents, { id: intent.id }, { pendingRevision: { ...revision, approvalUrl: url } });
      return { url, message: "Approve the change in PayPal. New terms begin only at the next verified paid renewal; no proration." };
    }
    return { message: "PayPal accepted the change. New terms begin only at the next verified paid renewal; no proration." };
  });
}
export async function createBillingPortal(workspaceId: number) {
  const [record] = await db.find(billingSubscriptions, { workspaceId });
  if (!record?.paypalSubscriptionId || record.environment !== getPayPalEnvironment()) throw new BillingError("No PayPal subscription exists for this workspace.", 409);
  return trustedPayPalUrl(`https://${getPayPalEnvironment() === "sandbox" ? "www.sandbox.paypal.com" : "www.paypal.com"}/myaccount/autopay/`);
}
export async function confirmBillingCheckout(workspaceId: number) {
  const id = await locked(workspaceId, async () => {
    const [record] = await db.find(billingSubscriptions, { workspaceId });
    const [intent] = record?.pendingIntentId ? await db.find(billingIntents, { id: record.pendingIntentId, workspaceId }) : [];
    if (!intent?.paypalSubscriptionId || intent.environment !== getPayPalEnvironment() || intent.state === "abandoned") throw new BillingError("No authorized PayPal purchase is pending.", 409);
    const remote = await subscription(intent.paypalSubscriptionId);
    checkBinding(intent, remote);
    if (!approved.has(remote.status)) throw new BillingError("PayPal approval or payment is still pending.", 409);
    return remote.id;
  });
  await reconcilePayPalSubscription(id);
  return { message: "PayPal status refreshed. Access activates only after its completed payment is verified." };
}
async function grantAllowance(tx: Connection, payment: BillingPayment, now: Date) {
  if (payment.invalidatedAt) return false;
  const window = payment.interval === "year" ? allowanceWindow(payment.periodStart, payment.periodEnd, now) :
    payment.periodStart <= now && now < payment.periodEnd ? { start: payment.periodStart, end: payment.periodEnd } : null;
  const [record] = await tx.find(billingSubscriptions, { workspaceId: payment.workspaceId }, { lock: true });
  if (!window || !record?.paidThrough || record.paidThrough <= now ||
    record.paypalSubscriptionId !== payment.paypalSubscriptionId || record.environment !== payment.environment ||
    (record.allowancePeriod && record.allowancePeriod >= window.start)) return false;
  const grantKey = `${payment.workspaceId}:${window.start.toISOString()}`;
  if ((await tx.find(billingGrants, { grantKey })).length) return false;
  await tx.insert(billingGrants, { grantKey, workspaceId: payment.workspaceId, paymentKey: payment.paymentKey,
    periodStart: window.start, periodEnd: window.end, credits: payment.planSnapshot.includedMonthlyCredits });
  await tx.update(workspaces, { id: payment.workspaceId }, { aiCreditsBalance: payment.planSnapshot.includedMonthlyCredits, aiCreditsMonthlyAllowance: payment.planSnapshot.includedMonthlyCredits });
  await tx.update(billingSubscriptions, { workspaceId: payment.workspaceId }, { allowancePeriod: window.start, creditEpoch: grantKey, updatedAt: now });
  return true;
}
async function applyPaidPeriod(tx: Connection, payment: BillingPayment, now: Date) {
  const [reversed] = await tx.find(billingReversals, { paymentKey: payment.paymentKey });
  if (payment.invalidatedAt || reversed || payment.periodStart > now || payment.periodEnd <= now) return false;
  const [record] = await tx.find(billingSubscriptions, { workspaceId: payment.workspaceId }, { lock: true });
  if (!record || record.environment !== payment.environment || (record.latestPaymentTime && record.latestPaymentTime > payment.paymentTime)) return false;
  const plan = payment.planSnapshot;
  await tx.update(billingSubscriptions, { workspaceId: payment.workspaceId }, {
    planSlug: plan.slug, planSnapshot: plan, paidThrough: payment.periodEnd,
    paypalSubscriptionId: payment.paypalSubscriptionId, interval: payment.interval,
    latestPaymentId: payment.paymentKey, latestPaymentTime: payment.paymentTime, updatedAt: now,
  });
  await tx.update(workspaces, { id: payment.workspaceId }, { planSlug: plan.slug,
    billingCycle: payment.interval === "year" ? "annual" : "monthly", paypalSubscriptionId: payment.paypalSubscriptionId,
    aiCreditsMonthlyAllowance: plan.includedMonthlyCredits, ...(!plan.allowsConfigurableAiMode ? { aiBillingMode: plan.defaultAiMode } : {}) });
  return grantAllowance(tx, payment, now);
}
export async function invalidatePayPalPayment(transactionId: string, reason: string) {
  const paymentKey = `${getPayPalEnvironment()}:${providerId(transactionId)}`;
  await db.insert(billingReversals, { paymentKey, reason }, { ignoreDuplicates: true });
  const [payment] = await db.find(billingPayments, { paymentKey });
  if (!payment) return;
  await db.transaction(async tx => {
    const [record] = await tx.find(billingSubscriptions, { workspaceId: payment.workspaceId }, { lock: true });
    await tx.update(billingPayments, { paymentKey }, { invalidatedAt: new Date(), invalidationReason: reason });
    if (record?.latestPaymentId === paymentKey) {
      await tx.update(billingSubscriptions, { workspaceId: payment.workspaceId }, { paidThrough: null, planSnapshot: null, creditEpoch: `reversal:${paymentKey}`, updatedAt: new Date() });
      await tx.update(workspaces, { id: payment.workspaceId }, { planSlug: "free", aiBillingMode: "byok", aiCreditsBalance: 0, aiCreditsMonthlyAllowance: 0 });
    }
  });
}
export async function reconcilePayPalSubscription(id: string, deadline?: number) {
  const initial = await subscription(id, deadline);
  if (typeof initial.custom_id !== "string") throw new BillingError("PayPal subscription has no purchase binding.");
  const [authorization] = await db.find(billingIntents, { bindingKey: initial.custom_id, environment: getPayPalEnvironment() });
  if (!authorization) return false;
  return locked(authorization.workspaceId, async () => {
    const [intent] = await db.find(billingIntents, { id: authorization.id });
    if (!intent) throw new BillingError("PayPal purchase authorization disappeared.", 409);
    const remote = await subscription(id, deadline);
    checkBinding(intent, remote);
    if (intent.state === "abandoned") {
      if (remote.status !== "APPROVAL_PENDING") await stopRenewal(remote.id, deadline);
      return false;
    }
    const revision = remote.plan_id === intent.pendingRevision?.paypalPlanId ? intent.pendingRevision : null;
    const definition = revision?.definition || intent.planSnapshot;
    const billingInterval = revision?.interval || intent.interval;
    const providerPlan = await getPayPalPlan(remote.plan_id, deadline);
    // Older purchase authorizations were issued only under the original default policy.
    const expectedPolicy = (revision ? revision.paymentPolicy : intent.paymentPolicy) ?? DEFAULT_PAYPAL_PAYMENT_POLICY;
    verifyPayPalPlan(providerPlan, definition, billingInterval, intent.paypalProductId, true, expectedPolicy);
    const paymentPolicy = getPayPalPaymentPolicy(providerPlan);
    await db.update(billingIntents, { id: intent.id }, { paypalSubscriptionId: remote.id, state: approved.has(remote.status) ? remote.status.toLowerCase() : "approval_pending", updatedAt: new Date() });
    const paymentTime = remote.billing_info?.last_payment?.time;
    const evidence: Array<Omit<BillingPayment, "id">> = [];
    if (paymentTime && Number.isFinite(new Date(paymentTime).getTime())) {
      const time = new Date(paymentTime);
      const from = new Date(time.getTime() - 86400000).toISOString();
      const until = new Date(Math.min(Date.now() + 1000, time.getTime() + 86400000)).toISOString();
      const result = await paypalRequest<{ transactions: PayPalTransaction[]; links?: Array<{ rel: string }> }>(`/v1/billing/subscriptions/${providerId(id)}/transactions?start_time=${encodeURIComponent(from)}&end_time=${encodeURIComponent(until)}`, { deadline });
      if (!Array.isArray(result.transactions) || result.links?.some(link => link.rel === "next")) throw new BillingError("PayPal payment history requires reconciliation.");
      for (const transaction of result.transactions) {
        if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(transaction.status)) {
          await invalidatePayPalPayment(transaction.id, "refund");
          continue;
        }
        if (transaction.status !== "COMPLETED") continue;
        const amountPaid = moneyCents(transaction.amount_with_breakdown?.gross_amount);
        const regularAmount = catalogAmount(definition, billingInterval);
        const paidAt = new Date(transaction.time);
        if (revision && paidAt < revision.effectiveAt) continue;
        const next = paidAt.getTime() === time.getTime() && remote.billing_info?.next_billing_time ? new Date(remote.billing_info.next_billing_time) : undefined;
        const anchor = revision?.effectiveAt || intent.billingAnchor || new Date(remote.start_time);
        const window = paidTransactionWindow(anchor, paidAt, billingInterval, next);
        if (!window) continue;
        if (amountPaid !== regularAmount) {
          if (!paymentPolicy.autoBillOutstanding || paidAt.getTime() !== time.getTime()) continue;
          const elapsedMonths = (window.start.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + window.start.getUTCMonth() - anchor.getUTCMonth();
          const elapsedPeriods = Math.floor(elapsedMonths / (billingInterval === "year" ? 12 : 1)) + 1;
          if (amountPaid === null || amountPaid <= regularAmount || amountPaid % regularAmount !== 0 ||
            amountPaid / regularAmount > elapsedPeriods || remote.status !== "ACTIVE" || !next ||
            moneyCents(remote.billing_info?.outstanding_balance) !== 0 ||
            moneyCents(remote.billing_info?.last_payment?.amount) !== amountPaid || revision) {
            throw new BillingError("PayPal overdue collection requires reconciliation: only fully settled whole-period arrears on the current unchanged plan can activate access.");
          }
        }
        evidence.push({ paymentKey: `${intent.environment}:${providerId(transaction.id)}`, paypalTransactionId: transaction.id,
          workspaceId: intent.workspaceId, environment: intent.environment, paypalSubscriptionId: remote.id,
          planVersionId: revision?.versionId || intent.planVersionId, planSlug: definition.slug, planSnapshot: definition,
          interval: billingInterval, currency: "USD", periodStart: window.start, periodEnd: window.end,
          paymentTime: paidAt, amountPaid,
          verifiedAt: new Date(), invalidatedAt: null, invalidationReason: null });
      }
    }
    return db.transaction(async tx => {
      const [record] = await tx.find(billingSubscriptions, { workspaceId: intent.workspaceId }, { lock: true });
      if (!record || record.environment !== intent.environment) throw new BillingError("Workspace PayPal environment does not match.", 409);
      if (record.paypalSubscriptionId && record.paypalSubscriptionId !== remote.id &&
        (!Number.isFinite(new Date(remote.start_time).getTime()) ||
          (record.paidThrough && new Date(remote.start_time) < record.paidThrough))) throw new BillingError("Replacement cannot overlap a paid subscription.", 409);
      if (!record.paypalSubscriptionId || record.paypalSubscriptionId === remote.id) {
        await tx.update(billingSubscriptions, { workspaceId: intent.workspaceId }, { paypalSubscriptionId: remote.id,
          paypalPayerId: remote.subscriber?.payer_id || null, status: remote.status, cancelAtPeriodEnd: canceled.has(remote.status), updatedAt: new Date() });
      }
      for (const item of evidence) await tx.insert(billingPayments, item, { ignoreDuplicates: true });
      const now = new Date();
      const latest = evidence.filter(item => item.periodStart <= now && now < item.periodEnd).sort((a, b) => b.paymentTime.getTime() - a.paymentTime.getTime())[0];
      if (!latest) return false;
      const [saved] = await tx.find(billingPayments, { paymentKey: latest.paymentKey });
      const granted = await applyPaidPeriod(tx, saved, now);
      if (!saved.invalidatedAt && !(await tx.find(billingReversals, { paymentKey: saved.paymentKey })).length) {
        if (revision) await tx.update(billingIntents, { id: intent.id }, { planVersionId: revision.versionId, planSnapshot: revision.definition,
          paypalPlanId: revision.paypalPlanId, paymentPolicy: revision.paymentPolicy ?? paymentPolicy, interval: revision.interval, billingAnchor: revision.effectiveAt, pendingRevision: null, updatedAt: now });
        await tx.update(billingSubscriptions, { workspaceId: intent.workspaceId }, {
          status: remote.status, paypalPayerId: remote.subscriber?.payer_id || null,
          cancelAtPeriodEnd: canceled.has(remote.status),
          ...(record.pendingIntentId === intent.id && (!intent.pendingRevision || revision) ? { pendingIntentId: null, pendingPlanSlug: null, pendingInterval: null, pendingEffectiveAt: null } : {}),
        });
      }
      return granted;
    });
  });
}
export async function refreshSubscriptionAllowances(options: { now?: Date; limit?: number; deadline?: number; reconcile?: boolean } = {}) {
  const now = options.now || new Date(), limit = Math.max(1, Math.min(options.limit || 100, 500));
  const records = await db.find(billingSubscriptions, { environment: getPayPalEnvironment() }, { limit, sort: { updatedAt: 1 } });
  let granted = 0, expired = 0, failed = 0;
  for (const record of records) {
    if (options.deadline && Date.now() >= options.deadline) break;
    if (options.reconcile !== false && getBillingReadiness().configured) {
      try {
        const [pending] = record.pendingIntentId ? await db.find(billingIntents, { id: record.pendingIntentId }) : [];
        for (const id of new Set([record.paypalSubscriptionId, pending?.paypalSubscriptionId].filter((value): value is string => !!value))) {
          if (await reconcilePayPalSubscription(id, options.deadline)) granted++;
        }
      } catch { failed++; console.error("PayPal subscription reconciliation failed", { workspaceId: record.workspaceId }); }
    }
    const result = await db.transaction(async tx => {
      const [current] = await tx.find(billingSubscriptions, { workspaceId: record.workspaceId }, { lock: true });
      const [payment] = await tx.find(billingPayments, { workspaceId: record.workspaceId, environment: getPayPalEnvironment(),
        paypalSubscriptionId: current?.paypalSubscriptionId, periodStart: { $lte: now }, periodEnd: { $gt: now }, invalidatedAt: null }, { limit: 1, sort: { paymentTime: -1 } });
      if (payment) return await applyPaidPeriod(tx, payment, now) ? "granted" : undefined;
      if (!current?.paidThrough || current.paidThrough <= now) {
        await tx.update(workspaces, { id: record.workspaceId }, { planSlug: "free", aiBillingMode: "byok", aiCreditsBalance: 0, aiCreditsMonthlyAllowance: 0 });
        await tx.update(billingSubscriptions, { workspaceId: record.workspaceId }, { creditEpoch: `expired:${current?.paidThrough?.toISOString() || "never"}`, updatedAt: now });
        return current?.planSlug !== "free" ? "expired" : undefined;
      }
      await tx.update(billingSubscriptions, { workspaceId: record.workspaceId }, { updatedAt: now });
    });
    if (result === "granted") granted++;
    if (result === "expired") expired++;
  }
  return { scanned: records.length, granted, expired, failed };
}
export async function processBillingEvent(event: PayPalEvent) {
  const eventKey = `${getPayPalEnvironment()}:${event.id}`;
  await db.insert(billingEvents, { eventKey, type: event.event_type }, { ignoreDuplicates: true });
  const handled = await db.withLease(`billing-event:${eventKey}`, async () => {
    const [inbox] = await db.find(billingEvents, { eventKey });
    if (inbox.status === "processed") return true;
    await db.update(billingEvents, { eventKey }, { status: "processing", attempts: inbox.attempts + 1 });
    try {
      const resource = event.resource;
      if (["PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED"].includes(event.event_type)) {
        const id = typeof resource.sale_id === "string" ? resource.sale_id :
          event.event_type === "PAYMENT.SALE.REVERSED" || resource.state === "refunded" || resource.state === "partially_refunded" ? resource.id : undefined;
        if (typeof id !== "string") throw new BillingError("PayPal reversal lacks its original transaction identifier.");
        await invalidatePayPalPayment(id, "refund_or_reversal");
      }

      if (event.event_type.startsWith("CUSTOMER.DISPUTE.")) {
        if (typeof resource.dispute_id !== "string") throw new BillingError("PayPal dispute lacks its identifier.");
        const dispute = await getPayPalDispute(resource.dispute_id);
        for (const transaction of dispute.disputed_transactions) {
          const transactionId = transaction.seller_transaction_id;
          if (!transactionId) throw new BillingError("PayPal dispute lacks its seller transaction identifier.");
          if (dispute.status === "RESOLVED" && dispute.dispute_outcome?.outcome_code === "RESOLVED_BUYER_FAVOUR") {
            await invalidatePayPalPayment(transactionId, "dispute_lost");
          }
          const [payment] = await db.find(billingPayments, { paymentKey: `${getPayPalEnvironment()}:${providerId(transactionId)}` });
          if (payment) await reconcilePayPalSubscription(payment.paypalSubscriptionId);
        }
      }
      const id = event.event_type.startsWith("BILLING.SUBSCRIPTION.") ? resource.id : resource.billing_agreement_id;
      if (typeof id === "string") await reconcilePayPalSubscription(id);
      await db.update(billingEvents, { eventKey }, { status: "processed", processedAt: new Date() });
      return true;
    } catch (error) { await db.update(billingEvents, { eventKey }, { status: "failed" }); throw error; }
  }, false);
  if (!handled) throw new BillingError("PayPal webhook processing is in progress. Retry delivery.", 503);
}

export async function getPaidSubscriptionMrr() {
  const now = new Date();
  const records = await db.find(billingSubscriptions, { environment: getPayPalEnvironment(), paidThrough: { $gt: now } });
  return Math.round(records.reduce((sum, record) => sum + (record.planSnapshot ?
    record.interval === "year" ? record.planSnapshot.annualMonthlyPrice : record.planSnapshot.monthlyPrice : 0), 0) * 100) / 100;
}
