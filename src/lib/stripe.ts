import Stripe from "stripe";
import { SUBSCRIPTION_PLANS } from "./plans";

export class BillingError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export type BillingInterval = "month" | "year";
export function billingRequestOptions(deadline?: number): Stripe.RequestOptions | undefined {
  if (!deadline) return undefined;
  const remaining = deadline - Date.now();
  if (remaining < 100) throw new BillingError("Billing reconciliation deadline reached.");
  return { timeout: Math.min(remaining, 20000), maxNetworkRetries: 0 };
}
export function billingPriceMap(env: NodeJS.ProcessEnv = process.env) {
  const entries = Object.values(SUBSCRIPTION_PLANS).filter(p => p.slug !== "free").flatMap(plan =>
    (["month", "year"] as const).map(interval => ({
      plan, interval,
      envName: `STRIPE_PRICE_${plan.slug.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}`,
      priceId: env[`STRIPE_PRICE_${plan.slug.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}`],
      amount: Math.round((interval === "month" ? plan.monthlyPrice : plan.annualMonthlyPrice * 12) * 100),
    })));
  return entries;
}
export function getBillingReadiness(env: NodeJS.ProcessEnv = process.env) {
  const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BILLING_APP_URL", "STRIPE_PORTAL_CONFIGURATION_ID",
    ...billingPriceMap(env).filter(p => !p.priceId).map(p => p.envName)].filter(name => !env[name]);
  const invalid: string[] = [];
  if (env.BILLING_APP_URL) {
    try {
      const url = new URL(env.BILLING_APP_URL);
      if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        url.protocol !== "https:") invalid.push("BILLING_APP_URL");
    } catch { invalid.push("BILLING_APP_URL"); }
  }
  const ids = billingPriceMap(env).map(p => p.priceId).filter(Boolean);
  if (new Set(ids).size !== ids.length) invalid.push("STRIPE_PRICE_* (duplicate mapping)");
  for (const [name, pattern] of [
    ["STRIPE_SECRET_KEY", /^sk_(live|test)_[A-Za-z0-9]+$/],
    ["STRIPE_WEBHOOK_SECRET", /^whsec_[A-Za-z0-9]+$/],
    ["STRIPE_PORTAL_CONFIGURATION_ID", /^bpc_[A-Za-z0-9]+$/],
    ...billingPriceMap(env).map(p => [p.envName, /^price_[A-Za-z0-9]+$/] as const),
  ] as const) {
    if (env[name] && !pattern.test(env[name]!)) invalid.push(name);
  }
  return { enabled: env.BILLING_ENABLED === "true", ready: env.BILLING_ENABLED === "true" && !missing.length && !invalid.length, missing, invalid };
}
export function validateBillingConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.BILLING_ENABLED !== "true") return;
  const result = getBillingReadiness(env);
  const invalid = [...result.invalid];
  if (env.BILLING_APP_URL && !env.BILLING_APP_URL.startsWith("https://")) invalid.push("BILLING_APP_URL (HTTPS required)");
  if (result.missing.length || invalid.length) {
    throw new BillingError(`Invalid billing configuration. Missing: ${result.missing.join(", ") || "none"}. Invalid: ${invalid.join(", ") || "none"}.`);
  }
}
export function requireBilling() {
  const readiness = getBillingReadiness();
  if (!readiness.ready) throw new BillingError("Billing is unavailable. The operator must enable and configure Stripe.");
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 20000 });
}
export function billingReturnUrl() { requireBilling(); return new URL("/app/billing", process.env.BILLING_APP_URL!).toString(); }
export function trustedStripeUrl(value: string | null, kind: "checkout" | "portal") {
  if (!value) throw new BillingError("Stripe did not return a redirect URL.", 502);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    url.hostname !== (kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com")) {
    throw new BillingError("Stripe returned an unexpected redirect URL.", 502);
  }
  return url.toString();
}
export async function verifiedPrice(stripe: Stripe, planSlug: string, interval: BillingInterval, deadline?: number) {
  const mapping = billingPriceMap().find(p => p.plan.slug === planSlug && p.interval === interval);
  if (!mapping) throw new BillingError("Choose a paid catalog plan and valid billing interval.", 400);
  if (!mapping.priceId) throw new BillingError("This plan's Stripe Price is not configured.");
  const price = await stripe.prices.retrieve(mapping.priceId, {}, billingRequestOptions(deadline));
  if (!price.active || price.currency !== "usd" || price.unit_amount !== mapping.amount ||
    price.recurring?.interval !== interval || price.recurring.interval_count !== 1 ||
    price.type !== "recurring" || price.billing_scheme !== "per_unit" ||
    price.recurring.usage_type !== "licensed") throw new BillingError("Stripe Price does not match the USD catalog.");
  return mapping;
}
