import { defineCollection } from "./model";
import type { PlanDefinition } from "../lib/plans";
import type { BillingInterval, PayPalEnvironment, PayPalPaymentPolicy } from "../lib/paypal";

export interface BillingSubscription {
  id: number; workspaceId: number; environment: PayPalEnvironment;
  planSlug: string; planSnapshot: PlanDefinition | null; paidThrough: Date | null;
  paypalSubscriptionId: string | null; paypalPayerId: string | null;
  status: string; interval: BillingInterval; cancelAtPeriodEnd: boolean; canceledAt: Date | null;
  latestPaymentId: string | null; latestPaymentTime: Date | null;
  allowancePeriod: Date | null; creditEpoch: string;
  pendingIntentId: number | null; pendingPlanSlug: string | null;
  pendingInterval: BillingInterval | null; pendingEffectiveAt: Date | null; updatedAt: Date;
}
export interface BillingIntent {
  id: number; workspaceId: number; environment: PayPalEnvironment;
  requestKey: string; bindingKey: string; planVersionId: number; planSnapshot: PlanDefinition;
  paypalPlanId: string; paypalProductId: string; interval: BillingInterval;
  paymentPolicy?: PayPalPaymentPolicy;
  paypalSubscriptionId: string | null; approvalUrl: string | null;
  replacesSubscriptionId: string | null; expectedStart: Date | null;
  replacementPaymentKey?: string;
  billingAnchor: Date | null;
  pendingRevision: {
    versionId: number; definition: PlanDefinition; paypalPlanId: string; paypalProductId: string;
    interval: BillingInterval; effectiveAt: Date; requestKey: string; approvalUrl: string | null; createdAt: Date;
    paymentPolicy?: PayPalPaymentPolicy;
  } | null;
  state: string; createdAt: Date; updatedAt: Date;
}
export interface BillingPayment {
  id: number; paymentKey: string; paypalTransactionId: string; workspaceId: number;
  environment: PayPalEnvironment; paypalSubscriptionId: string; planVersionId: number;
  planSlug: string; planSnapshot: PlanDefinition; interval: BillingInterval; currency: string;
  periodStart: Date; periodEnd: Date; paymentTime: Date; amountPaid: number; verifiedAt: Date;
  invalidatedAt: Date | null; invalidationReason: string | null;
}
export interface BillingGrant {
  id: number; grantKey: string; workspaceId: number; paymentKey: string;
  periodStart: Date; periodEnd: Date; credits: number; createdAt: Date;
}
export interface BillingEvent {
  id: number; eventKey: string; type: string; status: string;
  attempts: number; createdAt: Date; processedAt: Date | null;
}
export interface BillingReversal {
  id: number; paymentKey: string; reason: string; createdAt: Date;
}
export interface BillingCreditLot {
  id: number; workspaceId: number; key: string; paymentKey: string | null;
  carriedEpoch: string | null; remaining: number; held?: boolean; revokedAt: Date | null; createdAt: Date;
}
const base = {
  primaryKey: "id", autoId: true, indexes: [],
  references: [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }],
};
const validator = {
  bsonType: "object", required: ["id", "workspaceId"],
  properties: { id: { bsonType: ["int", "long", "double"] }, workspaceId: { bsonType: ["int", "long", "double"] } },
};
export const billingSubscriptions = defineCollection<BillingSubscription>("paypal_subscriptions", {
  ...base, unique: ["id", "workspaceId"], validator,
  defaults: () => ({
    environment: "sandbox", planSlug: "free", planSnapshot: null, paidThrough: null,
    paypalSubscriptionId: null, paypalPayerId: null, status: "inactive", interval: "month",
    cancelAtPeriodEnd: false, canceledAt: null, latestPaymentId: null, latestPaymentTime: null,
    allowancePeriod: null, creditEpoch: "initial", pendingIntentId: null,
    pendingPlanSlug: null, pendingInterval: null, pendingEffectiveAt: null, updatedAt: new Date(),
  }),
});
export const billingIntents = defineCollection<BillingIntent>("paypal_subscription_intents", {
  ...base, unique: ["id", "requestKey", "bindingKey"], indexes: [{ workspaceId: 1, environment: 1 }], validator,
  defaults: () => ({ paypalSubscriptionId: null, approvalUrl: null, replacesSubscriptionId: null, expectedStart: null, billingAnchor: null, pendingRevision: null, state: "creating", createdAt: new Date(), updatedAt: new Date() }),
});
export const billingPayments = defineCollection<BillingPayment>("paypal_payments", {
  ...base, unique: ["id", "paymentKey"], indexes: [{ workspaceId: 1, periodEnd: 1 }], validator,
  defaults: () => ({ verifiedAt: new Date(), invalidatedAt: null, invalidationReason: null }),
});
export const billingGrants = defineCollection<BillingGrant>("paypal_credit_grants", {
  ...base, unique: ["id", "grantKey"], validator, defaults: () => ({ createdAt: new Date() }),
});
export const billingEvents = defineCollection<BillingEvent>("paypal_billing_events", {
  ...base, references: [], unique: ["id", "eventKey"],
  defaults: () => ({ status: "pending", attempts: 0, createdAt: new Date(), processedAt: null }),
  validator: { bsonType: "object", required: ["eventKey", "status"] },
});
export const billingReversals = defineCollection<BillingReversal>("paypal_payment_reversals", {
  ...base, references: [], unique: ["id", "paymentKey"], defaults: () => ({ createdAt: new Date() }),
  validator: { bsonType: "object", required: ["paymentKey", "reason"] },
});
export const billingCreditLots = defineCollection<BillingCreditLot>("paypal_credit_lots", {
  ...base, unique: ["id", "key"], indexes: [{ workspaceId: 1 }, { paymentKey: 1 }],
  defaults: () => ({ carriedEpoch: null, revokedAt: null, createdAt: new Date() }), validator,
});
export const billingCollections = [billingSubscriptions, billingIntents, billingPayments, billingGrants, billingEvents, billingReversals, billingCreditLots];
