import { z } from "zod";
import { BillingError, getPayPalEnvironment, paypalRequest, providerId } from "./paypal";

const resourceId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const summary = z.object({
  id: resourceId,
  name: z.string().min(1).max(127),
  description: z.string().max(4000).optional(),
  status: z.string().min(1).max(40).optional(),
  product_id: resourceId.optional(),
});
const total = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const money = z.object({ currency_code: z.string().regex(/^[A-Z]{3}$/), value: z.string().regex(/^\d+(?:\.\d+)?$/).max(64) });
const planDetail = summary.extend({
  status: z.string().min(1).max(40),
  product_id: resourceId,
  billing_cycles: z.array(z.object({
    tenure_type: z.string().min(1).max(40),
    sequence: z.number().int().positive(),
    total_cycles: z.number().int().nonnegative(),
    frequency: z.object({ interval_unit: z.string().min(1).max(40), interval_count: z.number().int().positive() }),
    pricing_scheme: z.object({ fixed_price: money.optional() }).optional(),
  })).max(12),
  payment_preferences: z.object({
    auto_bill_outstanding: z.boolean().optional(), payment_failure_threshold: z.number().int().nonnegative().optional(),
    setup_fee: money.optional(),
  }).optional(),
});
export type PayPalResourceKind = "products" | "plans";
export async function listPayPalCatalog(kind: PayPalResourceKind, page = 1, deadline = Date.now() + 20000) {
  if (!["products", "plans"].includes(kind) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
    throw new BillingError("Invalid PayPal resource kind or page.", 400);
  }
  const environment = getPayPalEnvironment();
  const path = kind === "products" ? "/v1/catalogs/products" : "/v1/billing/plans";
  const response = await paypalRequest<unknown>(`${path}?page_size=20&page=${page}&total_required=true`, { deadline });
  const schema = kind === "products" ? z.object({ products: z.array(summary).max(20), total_items: total }) :
    z.object({ plans: z.array(summary).max(20), total_items: total });
  const parsed = schema.safeParse(response);
  if (!parsed.success) throw new BillingError("PayPal returned an invalid catalog listing.");
  const items = "products" in parsed.data ? parsed.data.products : parsed.data.plans;
  if (!Array.isArray(items) || parsed.data.total_items < items.length || new Set(items.map(item => item.id)).size !== items.length ||
    (kind === "plans" && items.some(item => !item.status))) {
    throw new BillingError("PayPal returned an invalid catalog listing.");
  }
  return { environment, checkedAt: new Date().toISOString(), kind, page, pages: Math.max(1, Math.ceil(parsed.data.total_items / 20)),
    total: parsed.data.total_items, items: items.map(item => ({
      id: item.id, name: item.name, description: item.description ?? null, status: item.status ?? null, productId: item.product_id ?? null,
    })) };
}
export type PayPalCatalogPage = Omit<Awaited<ReturnType<typeof listPayPalCatalog>>, "items"> & {
  items: Array<Awaited<ReturnType<typeof listPayPalCatalog>>["items"][number] & { observedAt?: string }>;
};
export async function readPayPalCatalogPlan(id: string, deadline = Date.now() + 20000) {
  const environment = getPayPalEnvironment();
  const response = await paypalRequest<unknown>(`/v1/billing/plans/${providerId(id)}`, { deadline });
  const parsed = planDetail.safeParse(response);
  if (!parsed.success || parsed.data.id !== id) throw new BillingError("PayPal returned invalid plan details.");
  const plan = parsed.data;
  return { environment, checkedAt: new Date().toISOString(), id: plan.id, name: plan.name, status: plan.status, productId: plan.product_id,
    description: plan.description ?? null, paymentPreferences: plan.payment_preferences ?? null,
    cycles: plan.billing_cycles.map(cycle => ({
      type: cycle.tenure_type, sequence: cycle.sequence, totalCycles: cycle.total_cycles,
      interval: cycle.frequency.interval_unit, intervalCount: cycle.frequency.interval_count,
      price: cycle.pricing_scheme?.fixed_price ?? null,
    })) };
}
export async function readPayPalCatalogProduct(id: string, deadline = Date.now() + 20000) {
  const parsed = summary.safeParse(await paypalRequest<unknown>(`/v1/catalogs/products/${providerId(id)}`, { deadline }));
  if (!parsed.success || parsed.data.id !== id) throw new BillingError("PayPal returned invalid product details.");
  return { id: parsed.data.id, name: parsed.data.name, description: parsed.data.description ?? null };
}
export type PayPalCatalogPlan = Awaited<ReturnType<typeof readPayPalCatalogPlan>>;
