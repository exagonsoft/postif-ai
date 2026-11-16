import { defineCollection } from "./model";

export interface BillingSubscription {
  id: number;
  workspaceId: number;
  planSlug: string;
  paidThrough: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currency: string;
  interval: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  latestInvoiceId: string | null;
  latestInvoiceCreated: number;
  checkoutKey: string | null;
  checkoutSessionId: string | null;
  checkoutPlan: string | null;
  checkoutInterval: string | null;
  customerIntentAt: Date | null;
  customerIntentKey: string | null;
  checkoutIntentAt: Date | null;
  allowancePeriod: Date | null;
  creditEpoch: string;
  stripeScheduleId: string | null;
  pendingPlanSlug: string | null;
  pendingInterval: string | null;
  pendingEffectiveAt: Date | null;
  changeIntentKey: string | null;
  changeIntentTarget: string | null;
  updatedAt: Date;
}
export interface BillingInvoice {
  id: number; stripeInvoiceId: string; workspaceId: number; stripeSubscriptionId: string;
  planSlug: string; stripePriceId: string; currency: string; interval: string;
  periodStart: Date; periodEnd: Date; invoiceCreated: number; amountPaid: number; verifiedAt: Date;
  invalidatedAt: Date | null; invalidationReason: string | null;
  stripeChargeIds: string[];
}
export interface BillingGrant {
  id: number; grantKey: string; workspaceId: number; stripeInvoiceId: string;
  periodStart: Date; periodEnd: Date; credits: number; createdAt: Date;
}
export interface BillingEvent {
  id: number; stripeEventId: string; type: string; status: string;
  attempts: number; createdAt: Date; processedAt: Date | null;
}
const base = {
  primaryKey: "id", autoId: true, indexes: [],
  references: [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }],
};
const workspaceValidator = {
  bsonType: "object", required: ["id", "workspaceId"],
  properties: { id: { bsonType: ["int", "long", "double"] }, workspaceId: { bsonType: ["int", "long", "double"] } },
};
export const billingSubscriptions = defineCollection<BillingSubscription>("billing_subscriptions", {
  ...base, unique: ["id", "workspaceId"],
  defaults: () => ({
    planSlug: "free", paidThrough: null, stripeCustomerId: null, stripeSubscriptionId: null,
    stripePriceId: null, currency: "usd", interval: "month", status: "inactive",
    cancelAtPeriodEnd: false, canceledAt: null, latestInvoiceId: null, latestInvoiceCreated: 0,
    checkoutKey: null, checkoutSessionId: null, checkoutPlan: null, checkoutInterval: null,
    customerIntentAt: null, customerIntentKey: null, checkoutIntentAt: null,
    allowancePeriod: null, creditEpoch: "initial", stripeScheduleId: null, pendingPlanSlug: null,
    pendingInterval: null, pendingEffectiveAt: null, changeIntentKey: null, changeIntentTarget: null, updatedAt: new Date(),
  }), validator: workspaceValidator,
});
export const billingInvoices = defineCollection<BillingInvoice>("billing_invoices", {
  ...base, unique: ["id", "stripeInvoiceId"], indexes: [{ workspaceId: 1, periodEnd: 1 }],
  defaults: () => ({ verifiedAt: new Date(), invalidatedAt: null, invalidationReason: null, stripeChargeIds: [] }), validator: workspaceValidator,
});
export const billingGrants = defineCollection<BillingGrant>("billing_grants", {
  ...base, unique: ["id", "grantKey"], defaults: () => ({ createdAt: new Date() }), validator: workspaceValidator,
});
export const billingEvents = defineCollection<BillingEvent>("billing_events", {
  ...base, references: [], unique: ["id", "stripeEventId"],
  defaults: () => ({ status: "pending", attempts: 0, createdAt: new Date(), processedAt: null }),
  validator: { bsonType: "object", required: ["stripeEventId", "status"] },
});
export const billingCollections = [billingSubscriptions, billingInvoices, billingGrants, billingEvents];
