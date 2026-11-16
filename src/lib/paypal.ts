import type { PlanDefinition } from "./plans";
import { createHash } from "node:crypto";
import { getWorkerDeadline } from "./worker-network";
import { hasPayPalPlanLineBreaks } from "./paypal-catalog-text";

export type BillingInterval = "month" | "year";
export type PayPalEnvironment = "sandbox" | "live";
export interface PayPalFailure {
  operation: string; name?: string; debugId?: string;
  details: Array<{ issue: string; field?: string }>;
  responseFormat: "json" | "unavailable";
}
export class BillingError extends Error {
  constructor(message: string, public status = 503, public providerStatus?: number, public providerFailure?: PayPalFailure) { super(message); this.name = "BillingError"; }
}
export class BillingBusyError extends BillingError {
  readonly code = "BILLING_BUSY";
  readonly retryAfter = 2;
  constructor(message = "Another billing operation is in progress. Retry the original action.", status = 409) {
    super(message, status);
    this.name = "BillingBusyError";
  }
}
export interface PayPalMoney { currency_code: string; value: string }
export interface PayPalPaymentPolicy { autoBillOutstanding: boolean; paymentFailureThreshold: number }
export const DEFAULT_PAYPAL_PAYMENT_POLICY: Readonly<PayPalPaymentPolicy> = { autoBillOutstanding: false, paymentFailureThreshold: 1 };
export interface PayPalPlan {
  id: string; name?: string; description?: string; status: string; product_id: string;
  billing_cycles: Array<{
    tenure_type: string; sequence: number; total_cycles: number;
    frequency: { interval_unit: string; interval_count: number };
    pricing_scheme: { fixed_price?: PayPalMoney; pricing_model?: string; tiers?: unknown[] };
  }>;
  payment_preferences?: { auto_bill_outstanding?: boolean; payment_failure_threshold?: number; setup_fee?: PayPalMoney };
  quantity_supported?: boolean;
  taxes?: { percentage?: string; inclusive?: boolean };
}
export interface PayPalSubscription {
  id: string; plan_id: string; status: string; custom_id?: string; start_time: string;
  quantity?: string; plan_overridden?: boolean;
  subscriber?: { payer_id?: string };
  billing_info?: {
    last_payment?: { amount: PayPalMoney; time: string };
    next_billing_time?: string;
    cycle_executions?: Array<{ tenure_type: string; cycles_completed: number; sequence: number }>;
    outstanding_balance?: PayPalMoney;
  };
  links?: Array<{ href: string; rel: string }>;
}
export interface PayPalTransaction {
  id: string; status: string; time: string;
  amount_with_breakdown: { gross_amount: PayPalMoney };
}
export interface PayPalDispute {
  dispute_id: string; status: string;
  dispute_outcome?: { outcome_code: string };
  disputed_transactions: Array<{ seller_transaction_id?: string }>;
}
export interface PayPalEvent { id: string; event_type: string; resource: Record<string, unknown> }

export function getPayPalEnvironment(env: NodeJS.ProcessEnv = process.env): PayPalEnvironment {
  const value = env.PAYPAL_ENVIRONMENT || "sandbox";
  if (value !== "sandbox" && value !== "live") throw new BillingError("PAYPAL_ENVIRONMENT must be sandbox or live.");
  return value;
}
export function getPayPalCatalogIdentity() {
  const { environment, clientId } = configuration();
  return createHash("sha256").update(`${environment}:${clientId}`).digest("hex");
}
export function getBillingReadiness(env: NodeJS.ProcessEnv = process.env) {
  const values = { PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID, BILLING_APP_URL: env.BILLING_APP_URL };
  const missing = Object.entries(values).filter(([, value]) => !value?.trim()).map(([name]) => name);
  const invalid: string[] = [];
  if (env.PAYPAL_ENVIRONMENT && !["sandbox", "live"].includes(env.PAYPAL_ENVIRONMENT)) invalid.push("PAYPAL_ENVIRONMENT");
  for (const [name, value] of Object.entries(values)) {
    if (value && (/[\r\n\0]/.test(value) || value.length > 2048)) invalid.push(name);
  }
  if (env.BILLING_APP_URL) {
    try {
      const url = new URL(env.BILLING_APP_URL);
      if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) invalid.push("BILLING_APP_URL");
    } catch { invalid.push("BILLING_APP_URL"); }
  }
  const configured = !missing.length && !invalid.length;
  return { enabled: env.BILLING_ENABLED === "true", configured, ready: env.BILLING_ENABLED === "true" && configured, missing, invalid };
}
export function validateBillingConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.BILLING_ENABLED !== "true") return;
  const readiness = getBillingReadiness(env);
  if (!readiness.configured) throw new BillingError(`Invalid PayPal billing configuration. Missing: ${readiness.missing.join(", ") || "none"}. Invalid: ${readiness.invalid.join(", ") || "none"}.`);
}
export function requireBilling() {
  const readiness = getBillingReadiness();
  if (!readiness.ready) throw new BillingError("PayPal billing is unavailable. The operator must enable and configure PayPal.");
}
export function billingReturnUrl() {
  const url = process.env.BILLING_APP_URL;
  if (!url || getBillingReadiness().invalid.includes("BILLING_APP_URL")) throw new BillingError("Configure BILLING_APP_URL as an HTTPS origin.");
  return new URL("/app/billing", url).href;
}
function configuration() {
  const environment = getPayPalEnvironment();
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId?.trim() || !secret?.trim()) throw new BillingError("Configure PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  if (/[\r\n\0]/.test(clientId + secret) || clientId.length + secret.length > 4096) throw new BillingError("Invalid PayPal credentials configuration.");
  return { environment, clientId, secret, origin: environment === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com" };
}
function signal(deadline?: number) {
  const remaining = deadline ? deadline - Date.now() : 15000;
  if (remaining < 100) throw new BillingError("PayPal reconciliation deadline reached.");
  return AbortSignal.timeout(Math.min(15000, remaining));
}
let tokenCache: { identity: string; token: string; expiresAt: number } | undefined;
let tokenRequest: { identity: string; promise: Promise<string> } | undefined;
async function accessToken(deadline?: number) {
  const config = configuration();
  const identity = `${config.environment}:${config.clientId}:${config.secret}`;
  if (tokenCache?.identity === identity && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  if (tokenRequest?.identity === identity) {
    if (deadline === undefined) return tokenRequest.promise;
    const pending = tokenRequest.promise, timeout = signal(deadline);
    return new Promise<string>((resolve, reject) => {
      const abort = () => reject(new BillingError("PayPal reconciliation deadline reached."));
      timeout.addEventListener("abort", abort, { once: true });
      pending.then(value => { timeout.removeEventListener("abort", abort); resolve(value); },
        error => { timeout.removeEventListener("abort", abort); reject(error); });
    });
  }
  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(`${config.origin}/v1/oauth2/token`, {
        method: "POST", redirect: "error", cache: "no-store", signal: signal(deadline),
        headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
    } catch { throw new BillingError("PayPal authentication could not be reached."); }
    if (!response.ok) throw new BillingError(`PayPal authentication failed (HTTP ${response.status}).`);
    let body: unknown;
    try { body = await response.json(); } catch { throw new BillingError("PayPal returned an invalid authentication response."); }
    if (!body || typeof body !== "object" || !("access_token" in body) || typeof body.access_token !== "string" || !body.access_token.trim() ||
      !("expires_in" in body) || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in < 60) throw new BillingError("PayPal returned an invalid authentication response.");
    tokenCache = { identity, token: body.access_token, expiresAt: Date.now() + (body.expires_in - 30) * 1000 };
    return body.access_token;
  })();
  tokenRequest = { identity, promise };
  try { return await promise; } finally { if (tokenRequest?.promise === promise) tokenRequest = undefined; }
}
const errorCodes = new Set(["INVALID_REQUEST", "VALIDATION_ERROR", "UNPROCESSABLE_ENTITY", "AUTHENTICATION_FAILURE", "NOT_AUTHORIZED", "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND", "INTERNAL_SERVER_ERROR", "SERVICE_UNAVAILABLE", "INVALID_PARAMETER_VALUE", "INVALID_PARAMETER_SYNTAX",
  "MISSING_REQUIRED_PARAMETER", "INVALID_STRING_LENGTH", "INVALID_ARRAY_MIN_ITEMS", "INVALID_ARRAY_MAX_ITEMS", "INVALID_INTEGER_MIN_VALUE",
  "INVALID_INTEGER_MAX_VALUE", "INVALID_RESOURCE_ID", "PRODUCT_NOT_FOUND", "DUPLICATE_REQUEST_ID", "BUSINESS_VALIDATION_ERROR", "RESOURCE_ALREADY_EXISTS",
  "INVALID_STRING_MIN_LENGTH", "INVALID_STRING_MAX_LENGTH", "INVALID_STRING_PATTERN", "INVALID_PATCH_PATH", "UNSUPPORTED_PATCH_OPERATION", "PLAN_STATUS_INACTIVE"]);
const errorFields = new Set(["id", "name", "description", "type", "category", "product_id", "billing_cycles", "tenure_type", "sequence",
  "total_cycles", "frequency", "interval_unit", "interval_count", "pricing_scheme", "fixed_price", "currency_code", "value", "payment_preferences",
  "auto_bill_outstanding", "payment_failure_threshold", "setup_fee", "setup_fee_failure_action", "quantity_supported", "plan_id", "start_time", "custom_id", "op", "path", "from"]);
async function payPalFailure(response: Response, path: string, method: string): Promise<PayPalFailure> {
  const operation = path.startsWith("/v1/catalogs/products") ? `${method === "POST" ? "create" : "read"}_product`
    : path.startsWith("/v1/billing/plans") ? method === "PATCH" ? "rename_plan" : `${method === "POST" ? "create" : "read"}_plan` : "provider_request";
  const result: PayPalFailure = { operation, details: [], responseFormat: "unavailable" };
  const debug = response.headers.get("paypal-debug-id");
  if (debug && /^[a-f0-9]{6,32}$/i.test(debug)) result.debugId = debug;
  let body: unknown;
  try { body = await response.json(); }
  catch { return result; }
  if (!body || typeof body !== "object") return result;
  result.responseFormat = "json";
  if ("name" in body && typeof body.name === "string" && errorCodes.has(body.name)) result.name = body.name;
  if ("debug_id" in body && typeof body.debug_id === "string" && /^[a-f0-9]{6,32}$/i.test(body.debug_id)) result.debugId = body.debug_id;
  if ("details" in body && Array.isArray(body.details)) {
    result.details = body.details.slice(0, 5).flatMap(detail => {
      if (!detail || typeof detail !== "object") return [];
      const issue = typeof detail.issue === "string" && errorCodes.has(detail.issue) ? detail.issue : "UNRECOGNIZED_PROVIDER_ISSUE";
      const field = typeof detail.field === "string" && detail.field.length <= 160 && detail.field.startsWith("/") &&
        detail.field.slice(1).split("/").every((part: string) => errorFields.has(part) || /^\d{1,2}$/.test(part)) ? detail.field : undefined;
      return [{ issue, ...(field ? { field } : {}) }];
    });
  }
  return result;
}
export async function paypalRequest<T>(path: string, options: { method?: string; body?: unknown; requestId?: string; deadline?: number } = {}): Promise<T> {
  const config = configuration();
  const deadlines = [options.deadline, getWorkerDeadline()].filter((value): value is number => value !== undefined);
  const deadline = deadlines.length ? Math.min(...deadlines) : undefined;
  const token = await accessToken(deadline);
  let response: Response;
  try {
    response = await fetch(config.origin + path, {
      method: options.method || "GET", redirect: "error", cache: "no-store", signal: signal(deadline),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.requestId ? { "PayPal-Request-Id": options.requestId } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    console.error("PayPal operation failed", { operation: options.method || "GET", code: "NETWORK" });
    throw new BillingError("PayPal could not be reached. The operation may be pending; retry the original action.");
  }
  if (!response.ok) {
    if (response.status === 401) tokenCache = undefined;
    const failure = await payPalFailure(response, path, options.method || "GET");
    console.error("PayPal operation failed", { status: response.status, ...failure });
    const issues = failure.details.map(detail => `${detail.issue}${detail.field ? ` at ${detail.field}` : ""}`).join("; ");
    throw new BillingError(`PayPal rejected ${failure.operation} (HTTP ${response.status}).${failure.name ? ` ${failure.name}.` : ""}${issues ? ` ${issues}.` : ""}${failure.debugId ? ` PayPal debug ID: ${failure.debugId}.` : ""}`,
      response.status >= 500 ? 503 : 502, response.status, failure);
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; } catch { throw new BillingError("PayPal returned an invalid operation response."); }
}
export function providerId(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new BillingError("Invalid PayPal resource identifier.", 400);
  return encodeURIComponent(value);
}
export function catalogAmount(plan: PlanDefinition, interval: BillingInterval) {
  const amount = Math.round((interval === "year" ? plan.annualMonthlyPrice * 12 : plan.monthlyPrice) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new BillingError("Paid plans require a positive USD price.", 400);
  return amount;
}
export async function createPayPalProduct(input: { id?: string; name: string; description: string }, requestId: string) {
  return paypalRequest<{ id: string }>("/v1/catalogs/products", { method: "POST", requestId, body: { ...input, type: "SERVICE", category: "SOFTWARE" } });
}
export async function getPayPalProduct(id: string, deadline?: number) {
  return paypalRequest<{ id: string; name: string; description?: string }>(`/v1/catalogs/products/${providerId(id)}`, { deadline });
}
export async function checkPayPalCatalogConnection() {
  const environment = getPayPalEnvironment(), deadline = Date.now() + 20000;
  const products = await paypalRequest<{ products: Array<{ id: string }>; total_items: number }>("/v1/catalogs/products?page_size=20&page=1&total_required=true", { deadline });
  const plans = await paypalRequest<{ plans: Array<{ id: string }>; total_items: number }>("/v1/billing/plans?page_size=20&page=1&total_required=true", { deadline });
  for (const [items, total] of [[products?.products, products?.total_items], [plans?.plans, plans?.total_items]] as const) {
    if (!Array.isArray(items) || !Number.isSafeInteger(total) || total < items.length ||
      items.some(item => !item || typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id))) {
      throw new BillingError("PayPal returned an invalid catalog listing.");
    }
  }
  return { environment, checkedAt: new Date().toISOString(), products: products.total_items, plans: plans.total_items };
}
export type PayPalCatalogConnection = Awaited<ReturnType<typeof checkPayPalCatalogConnection>>;
export function getPayPalPlanName(planName: string, interval: BillingInterval) {
  const name = `POSTIF-AI ${planName} \u2014 ${interval === "year" ? "Yearly" : "Monthly"}`;
  if (hasPayPalPlanLineBreaks(name)) throw new BillingError("PayPal plan names must not contain line breaks.", 400);
  if (name.length > 127) throw new BillingError("PayPal plan names must not exceed 127 characters including the POSTIF-AI prefix and billing interval. Shorten the local plan name.", 400);
  return name;
}
export async function createPayPalPlan(input: { productId: string; plan: PlanDefinition; interval: BillingInterval; paymentPolicy?: PayPalPaymentPolicy; name?: string }, requestId: string) {
  const policy = input.paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY;
  const name = input.name ?? getPayPalPlanName(input.plan.name, input.interval);
  if (hasPayPalPlanLineBreaks(name)) throw new BillingError("PayPal plan names must not contain line breaks.", 400);
  if (input.plan.description !== undefined && (!input.plan.description.trim() || input.plan.description.length > 127)) throw new BillingError("PayPal plan descriptions require 1-127 characters.", 400);
  if (input.plan.description !== undefined && hasPayPalPlanLineBreaks(input.plan.description)) throw new BillingError("PayPal plan descriptions must not contain line breaks. Replace line breaks with spaces.", 400);
  return paypalRequest<{ id: string }>("/v1/billing/plans", {
    method: "POST", requestId, body: {
      product_id: input.productId, name, status: "ACTIVE",
      ...(input.plan.description !== undefined ? { description: input.plan.description } : {}),
      billing_cycles: [{ tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
        frequency: { interval_unit: input.interval === "year" ? "YEAR" : "MONTH", interval_count: 1 },
        pricing_scheme: { fixed_price: { currency_code: "USD", value: (catalogAmount(input.plan, input.interval) / 100).toFixed(2) } } }],
      payment_preferences: { auto_bill_outstanding: policy.autoBillOutstanding, payment_failure_threshold: policy.paymentFailureThreshold,
        setup_fee: { currency_code: "USD", value: "0.00" }, setup_fee_failure_action: "CANCEL" },
    },
  });
}
export async function getPayPalPlan(id: string, deadline?: number) {
  return paypalRequest<PayPalPlan>(`/v1/billing/plans/${providerId(id)}`, { deadline });
}
export async function renamePayPalPlan(id: string, name: string, description?: string, currentPlan?: Pick<PayPalPlan, "id" | "description">) {
  if (!name.trim() || name.length > 127) throw new BillingError("PayPal plan names require 1-127 characters.", 400);
  if (hasPayPalPlanLineBreaks(name)) throw new BillingError("PayPal plan names must not contain line breaks.", 400);
  if (description !== undefined && (!description.trim() || description.length > 127)) throw new BillingError("PayPal plan descriptions require 1-127 characters.", 400);
  if (description !== undefined && hasPayPalPlanLineBreaks(description)) throw new BillingError("PayPal plan descriptions must not contain line breaks. Replace line breaks with spaces.", 400);
  let descriptionOperation: "add" | "replace" = "replace";
  if (description !== undefined) {
    const remote = currentPlan ?? await getPayPalPlan(id);
    if (!remote || remote.id !== id || (remote.description !== undefined && typeof remote.description !== "string")) {
      throw new BillingError("PayPal returned invalid plan metadata. No details were updated.", 502);
    }
    // Older plans can omit description; JSON Patch replace requires an existing field.
    descriptionOperation = remote.description === undefined ? "add" : "replace";
  }
  await paypalRequest<void>(`/v1/billing/plans/${providerId(id)}`, {
    method: "PATCH", body: [{ op: "replace", path: "/name", value: name },
      ...(description !== undefined ? [{ op: descriptionOperation, path: "/description", value: description }] : [])],
  });
}
export async function getPayPalDispute(id: string) {
  const dispute = await paypalRequest<PayPalDispute>(`/v1/customer/disputes/${providerId(id)}`);
  if (dispute.dispute_id !== id || typeof dispute.status !== "string" || !dispute.status ||
    !Array.isArray(dispute.disputed_transactions) || !dispute.disputed_transactions.length ||
    dispute.disputed_transactions.some(transaction => typeof transaction?.seller_transaction_id !== "string") ||
    (dispute.status === "RESOLVED" && typeof dispute.dispute_outcome?.outcome_code !== "string")) {
    throw new BillingError("PayPal dispute requires transaction and outcome reconciliation.");
  }
  return dispute;
}
export function moneyCents(amount: PayPalMoney | undefined) {
  if (!amount || amount.currency_code !== "USD" || typeof amount.value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount.value)) return null;
  const [whole, fraction = ""] = amount.value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}
export function getPayPalPaymentPolicy(provider: PayPalPlan): PayPalPaymentPolicy {
  const preferences = provider.payment_preferences;
  if (typeof preferences?.auto_bill_outstanding !== "boolean" || !Number.isInteger(preferences.payment_failure_threshold) ||
    preferences.payment_failure_threshold === undefined || preferences.payment_failure_threshold < 0 || preferences.payment_failure_threshold > 999) {
    throw new BillingError("PayPal plan must report a valid overdue-collection setting and a payment failure threshold from 0 to 999.");
  }
  return { autoBillOutstanding: preferences.auto_bill_outstanding, paymentFailureThreshold: preferences.payment_failure_threshold };
}
export function verifyPayPalPlan(provider: PayPalPlan, plan: PlanDefinition, interval: BillingInterval, productId: string, allowInactive = false, expectedPolicy?: PayPalPaymentPolicy) {
  const cycle = provider.billing_cycles?.[0];
  const mismatches: string[] = [];
  if (provider.status !== "ACTIVE" && !(allowInactive && provider.status === "INACTIVE")) mismatches.push("ACTIVE status required");
  if (provider.product_id !== productId) mismatches.push("wrong PayPal product");
  if (provider.billing_cycles?.length !== 1 || !cycle || cycle.tenure_type !== "REGULAR" || cycle.sequence !== 1 || cycle.total_cycles !== 0) mismatches.push("one unlimited REGULAR billing cycle required");
  if (cycle?.frequency?.interval_count !== 1 || cycle?.frequency?.interval_unit !== (interval === "year" ? "YEAR" : "MONTH")) mismatches.push(`billing interval must be one ${interval}`);
  if (moneyCents(cycle?.pricing_scheme?.fixed_price) !== catalogAmount(plan, interval)) mismatches.push(`price must be USD ${(catalogAmount(plan, interval) / 100).toFixed(2)}`);
  if (provider.payment_preferences?.setup_fee !== undefined && moneyCents(provider.payment_preferences.setup_fee) !== 0) mismatches.push("setup fee must be zero USD");
  const policy = getPayPalPaymentPolicy(provider);
  if (expectedPolicy && (policy.autoBillOutstanding !== expectedPolicy.autoBillOutstanding || policy.paymentFailureThreshold !== expectedPolicy.paymentFailureThreshold)) {
    mismatches.push("payment policy changed from the locally published PayPal snapshot");
  }
  if (cycle?.pricing_scheme?.pricing_model !== undefined || cycle?.pricing_scheme?.tiers !== undefined) mismatches.push("tiered or volume pricing is not supported");
  if (provider.quantity_supported !== undefined && provider.quantity_supported !== false) mismatches.push("variable subscription quantity is not supported");
  if (provider.taxes !== undefined && (!provider.taxes || typeof provider.taxes.percentage !== "string" || !/^0(?:\.0+)?$/.test(provider.taxes.percentage))) mismatches.push("additional plan taxes are not supported");
  if (mismatches.length) throw new BillingError(`PayPal plan does not match the published USD subscription terms: ${mismatches.join("; ")}.`);
}
export function trustedPayPalUrl(value: string | undefined) {
  if (!value) throw new BillingError("PayPal did not return an approval URL.", 502);
  let url: URL;
  try { url = new URL(value); } catch { throw new BillingError("PayPal returned an invalid approval URL.", 502); }
  const host = getPayPalEnvironment() === "sandbox" ? "www.sandbox.paypal.com" : "www.paypal.com";
  if (url.protocol !== "https:" || url.hostname !== host || url.username || url.password || url.port) throw new BillingError("PayPal returned an unexpected approval URL.", 502);
  return url.href;
}
export async function verifyPayPalWebhook(headers: Headers, event: PayPalEvent) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId?.trim()) throw new BillingError("PAYPAL_WEBHOOK_ID must be configured.");
  const names = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  if (names.some(name => !headers.get(name))) throw new BillingError("Missing PayPal webhook signature headers.", 400);
  const result = await paypalRequest<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST", body: {
      auth_algo: headers.get("paypal-auth-algo"), cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"), transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"), webhook_id: webhookId, webhook_event: event,
    },
  });
  if (result.verification_status !== "SUCCESS") throw new BillingError("Invalid PayPal webhook signature.", 400);
}
