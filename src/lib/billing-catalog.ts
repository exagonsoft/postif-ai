import { z } from "zod";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { catalogProducts, catalogPlans, catalogVersions, type CatalogVersion, type ProviderRequest } from "@/db/catalog-schema";
import { SUBSCRIPTION_PLANS, type PlanDefinition } from "./plans";
import { BillingError, DEFAULT_PAYPAL_PAYMENT_POLICY, getPayPalEnvironment, getBillingReadiness, getPayPalCatalogIdentity, createPayPalProduct, createPayPalPlan, getPayPalPlanName, getPayPalProduct, getPayPalPlan, getPayPalPaymentPolicy, renamePayPalPlan, verifyPayPalPlan, type BillingInterval, type PayPalPaymentPolicy } from "./paypal";
import { withWorkerDeadline } from "./worker-network";
import { readPayPalCatalogPlan, readPayPalCatalogProduct } from "./paypal-catalog";
import { hasPayPalPlanLineBreaks, normalizePayPalPlanDescription } from "./paypal-catalog-text";

type Connection = typeof db;
type Actor = { user: { id: number; email: string; systemRole?: string } } | null;
const slug = z.string().min(1).max(64).regex(/^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/).refine(value => !["constructor", "prototype", "__proto__"].includes(value));
const text = z.string().trim().min(1).max(127);
const planName = text.refine(value => !hasPayPalPlanLineBreaks(value), "PayPal plan names must not contain line breaks.");
const planDescription = z.string().transform(normalizePayPalPlanDescription).pipe(text);
const price = z.number().finite().min(0).max(100000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Prices require at most two decimal places.");
const count = z.number().int().min(0).max(10000000);
export const catalogPlanDefinitionSchema = z.object({
  slug, name: planName, tagline: z.string().trim().min(1).max(500),
  description: planDescription.optional(),
  monthlyPrice: price, annualMonthlyPrice: price,
  defaultAiMode: z.enum(["managed", "byok"]), allowsConfigurableAiMode: z.boolean(),
  maxBrands: count.max(10000), maxChannels: count.max(100000), maxPostsPerMonth: count,
  includedMonthlyCredits: count, autopilotEnabled: z.boolean(), teamCollaboration: z.boolean(),
  campaignsEnabled: z.boolean(), advancedAnalytics: z.boolean(), popular: z.boolean().optional(),
  features: z.array(z.string().trim().min(1).max(240)).max(40),
}).strict().superRefine((plan, ctx) => {
  if (plan.slug === "free") {
    if (plan.monthlyPrice !== 0 || plan.annualMonthlyPrice !== 0 || plan.includedMonthlyCredits !== 0 || plan.defaultAiMode !== "byok" || plan.allowsConfigurableAiMode) ctx.addIssue({ code: "custom", message: "Free must have zero prices/credits and mandatory BYOK." });
  } else if (plan.monthlyPrice <= 0 || plan.annualMonthlyPrice <= 0) {
    ctx.addIssue({ code: "custom", message: "Paid plans require positive monthly and annual prices." });
  }
});
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const revision = id;
const paypalId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const paypalSetupSchema = z.object({
  productId: paypalId.optional(), monthPlanId: paypalId.optional(), yearPlanId: paypalId.optional(),
  replacePendingVersionId: id.optional(),
}).strict();
export type PayPalSetupSelection = z.infer<typeof paypalSetupSchema>;
export const catalogActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("initialize_defaults") }).strict(),
  z.object({ action: z.literal("create_product"), slug, name: text, description: z.string().trim().min(1).max(256) }).strict(),
  z.object({ action: z.literal("edit_product"), id, revision, name: text, description: z.string().trim().min(1).max(256) }).strict(),
  z.object({ action: z.literal("archive_product"), id, revision, archived: z.boolean() }).strict(),
  z.object({ action: z.literal("create_plan"), productId: id, definition: catalogPlanDefinitionSchema.refine(plan => !!plan.description, "Enter a plan description (1-127 characters).") }).strict(),
  z.object({ action: z.literal("edit_plan"), id, revision, definition: catalogPlanDefinitionSchema }).strict(),
  z.object({ action: z.literal("archive_plan"), id, revision, archived: z.boolean() }).strict(),
  z.object({ action: z.literal("publish_plan"), id, revision }).strict(),
  z.object({ action: z.literal("use_paypal_setup"), id, revision, setup: paypalSetupSchema }).strict(),
  z.object({ action: z.literal("rename_paypal_plans"), versionId: id, confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal("update_plan_details"), versionId: id, revision, name: planName, description: planDescription, confirm: z.literal(true) }).strict(),
]);
function fail(message: string, status = 409): never { throw new BillingError(message, status); }
export function requireCatalogOperator(actor: Actor) {
  if (actor?.user.systemRole !== "operator") fail("Operator authorization required.", 403);
  return actor.user;
}
function rejectPrototypeKeys(input: unknown, depth = 0): void {
  if (!input || typeof input !== "object") return;
  if (depth > 16) fail("Catalog input is nested too deeply.", 400);
  for (const key of Object.keys(input)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) fail("Invalid input key.", 400);
    rejectPrototypeKeys((input as Record<string, unknown>)[key], depth + 1);
  }
}
function defaults(): PlanDefinition[] {
  return Object.values(SUBSCRIPTION_PLANS).map(plan => ({ ...structuredClone(plan), purchasable: plan.slug === "free" }));
}
function displayDefinition(version: CatalogVersion): PlanDefinition {
  return { ...version.definition, ...version.presentation };
}
function displayRevision(version: CatalogVersion) {
  return version.presentationRevision ?? version.draftRevision;
}
export async function getFreePlan(connection: Connection = db): Promise<PlanDefinition> {
  const [plan] = await connection.find(catalogPlans, { slug: "free" });
  if (!plan?.currentVersions.local) return { ...structuredClone(SUBSCRIPTION_PLANS.free), purchasable: true };
  const [version] = await connection.find(catalogVersions, { id: plan.currentVersions.local, status: "published", environment: "local" });
  if (!version) fail("The Free catalog snapshot is missing.", 503);
  return { ...displayDefinition(version), catalogVersionId: version.id, purchasable: true };
}
export async function getCatalogPlans(): Promise<PlanDefinition[]> {
  return db.transaction(async tx => {
    const plans = await tx.find(catalogPlans);
    const products = await tx.find(catalogProducts);
    if (!plans.length && !products.length) return defaults();
    const environment = getPayPalEnvironment();
    const result = [await getFreePlan(tx)];
    for (const plan of plans) {
      if (plan.slug === "free" || plan.archived || !products.some(product => product.id === plan.productId && !product.archived)) continue;
      const versionId = plan.currentVersions[environment];
      if (!versionId) continue;
      const [version] = await tx.find(catalogVersions, { id: versionId, status: "published", environment });
      if (!version) fail("Published catalog snapshot is missing.", 503);
      result.push({ ...displayDefinition(version), catalogVersionId: version.id, purchasable: version.syncStatus !== "drift" });
    }
    return result;
  });
}
export async function getPurchasablePlan(planSlug: string, interval: BillingInterval, expectedVersionId?: number) {
  if (!slug.safeParse(planSlug).success || !["month", "year"].includes(interval)) fail("Invalid plan or billing interval.", 400);
  return db.transaction(async tx => {
    const environment = getPayPalEnvironment();
    const [plan] = await tx.find(catalogPlans, { slug: planSlug }, { lock: true });
    if (!plan || plan.slug === "free" || plan.archived) fail("Plan is not available for checkout.");
    const [product] = await tx.find(catalogProducts, { id: plan.productId }, { lock: true });
    if (!product || product.archived) fail("Product is not available for checkout.");
    const versionId = plan.currentVersions[environment];
    if (!versionId || (expectedVersionId !== undefined && versionId !== expectedVersionId)) fail("Catalog changed or plan is unpublished. Refresh the available plans.");
    const [version] = await tx.find(catalogVersions, { id: versionId, status: "published", environment });
    const paypalPlanId = interval === "month" ? version?.monthRequest.providerId : version?.yearRequest.providerId;
    if (!version || !paypalPlanId || !version.productRequest.providerId) fail("Published provider mapping is incomplete.", 503);
    if (version.syncStatus === "drift") fail("PayPal catalog drift must be reconciled before new purchases.", 503);
    const request = interval === "month" ? version.monthRequest : version.yearRequest;
    return { versionId: version.id, definition: { ...displayDefinition(version), catalogVersionId: version.id, purchasable: true }, paypalPlanId, paypalProductId: version.productRequest.providerId, paymentPolicy: request.paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY };
  });
}
export async function getAdminCatalog(actor: Actor) {
  requireCatalogOperator(actor);
  return db.transaction(async tx => ({
    readAt: new Date().toISOString(),
    environment: getPayPalEnvironment(),
    billing: getBillingReadiness(),
    products: (await tx.find(catalogProducts)).map(({ paypalProducts, ...product }) => ({
      ...product, paypalProductIds: { sandbox: paypalProducts?.sandbox?.id, live: paypalProducts?.live?.id },
    })),
    plans: await tx.find(catalogPlans),
    versions: (await tx.find(catalogVersions, {}, { sort: { id: -1 } })).map(version => ({
      id: version.id, planId: version.planId, environment: version.environment, status: version.status,
      draftRevision: displayRevision(version), productRevision: version.productRevision,
      definition: displayDefinition(version), createdAt: version.createdAt.toISOString(),
      publishedAt: version.publishedAt?.toISOString() ?? null,
      paypalProductId: version.productRequest.providerId,
      paypalMonthPlanId: version.monthRequest.providerId, paypalYearPlanId: version.yearRequest.providerId,
      paypalMonthName: storedProviderName(version.monthRequest), paypalYearName: storedProviderName(version.yearRequest),
      paypalMonthDescription: providerPlanDescription(version.monthRequest), paypalYearDescription: providerPlanDescription(version.yearRequest),
      pendingDetails: version.detailsUpdate && !version.detailsUpdate.confirmedAt ? { name: version.detailsUpdate.name, description: version.detailsUpdate.description } : null,
      nameUpdatePending: !!(version.detailsUpdate && !version.detailsUpdate.confirmedAt) || [version.monthRequest, version.yearRequest].some(request => request.nameCorrection && !request.nameCorrection.confirmedAt),
      nameUpdateError: [version.monthRequest, version.yearRequest].map(request => request.nameCorrection?.error).filter(Boolean).join(" "),
      monthPaymentPolicy: version.monthRequest.paymentPolicy ?? null, yearPaymentPolicy: version.yearRequest.paymentPolicy ?? null,
      publicationAttempts: version.publicationAttempts ?? 0, publicationError: version.publicationError ?? null,
      syncStatus: version.syncStatus ?? "unverified", syncCheckedAt: version.syncCheckedAt?.toISOString() ?? null, syncError: version.syncError ?? null,
    })),
  }));
}
export type AdminCatalog = Awaited<ReturnType<typeof getAdminCatalog>>;
function storedProviderName(request: ProviderRequest) {
  return request.nameCorrection?.confirmedAt ? request.nameCorrection.name : request.name ?? null;
}
function providerPlanName(version: CatalogVersion, request: ProviderRequest) {
  return storedProviderName(request) ?? version.definition.name;
}
function providerPlanDescription(request: ProviderRequest) {
  return request.nameCorrection?.confirmedAt && request.nameCorrection.description !== undefined ? request.nameCorrection.description : request.description;
}
export async function readCatalogVersionSources(actor: Actor, versionId: number) {
  requireCatalogOperator(actor);
  if (!id.safeParse(versionId).success) fail("Invalid catalog version identifier.", 400);
  const environment = getPayPalEnvironment(), accountKey = getPayPalCatalogIdentity(), deadline = Date.now() + 20000;
  const snapshot = await db.transaction(async tx => {
    const [version] = await tx.find(catalogVersions, { id: versionId });
    if (!version) fail("Catalog version not found.", 404);
    if (version.environment !== environment) fail("Read this mapping in its original PayPal environment.");
    const approvedAccount = version.approval?.accountKey ?? version.syncAccountKey;
    if (approvedAccount && approvedAccount !== accountKey) fail("Read this mapping using its originally approved PayPal app.");
    const [plan] = await tx.find(catalogPlans, { id: version.planId });
    const [product] = await tx.find(catalogProducts, { id: version.productId });
    if (!plan || !product) fail("The MongoDB plan or product record is missing.", 503);
    const savedPlan = (request: ProviderRequest) => ({
      id: request.providerId,
      name: storedProviderName(request),
      description: providerPlanDescription(request) ?? null,
      paymentPolicy: request.paymentPolicy ?? null,
      updatePending: !!(request.nameCorrection && !request.nameCorrection.confirmedAt),
    });
    return {
      readAt: new Date().toISOString(),
      planId: plan.id, slug: plan.slug, revision: plan.revision, draft: plan.draft,
      currentVersionId: plan.currentVersions[environment] ?? null,
      product: { id: product.id, name: product.name, description: product.description, revision: product.revision },
      publication: { id: version.id, status: version.status, definition: displayDefinition(version), publishedAt: version.publishedAt?.toISOString() ?? null },
      mappings: {
        product: { id: version.productRequest.providerId, name: version.product.name, description: version.product.description },
        month: savedPlan(version.monthRequest), year: savedPlan(version.yearRequest),
      },
    };
  });
  const read = async <T,>(resource: string, providerId: string | null, load: (id: string, deadline: number) => Promise<T>) => {
    if (!providerId) return { status: "unmapped" as const, id: null, error: "No PayPal ID is stored in MongoDB. No resource was guessed or created." };
    try {
      const data = await load(providerId, deadline);
      return { status: "loaded" as const, id: providerId, data };
    } catch (error) {
      if (!(error instanceof BillingError)) throw error;
      console.error("Linked PayPal catalog read failed", { resource, status: error.providerStatus ?? error.status });
      return { status: error.providerStatus === 404 ? "missing" as const : "error" as const, id: providerId,
        error: error.providerStatus === 404 ? "This stored ID was not found in the configured PayPal account." : error.message };
    }
  };
  const [product, month, year] = await Promise.all([
    read("product", snapshot.mappings.product.id, readPayPalCatalogProduct),
    read("monthly plan", snapshot.mappings.month.id, readPayPalCatalogPlan),
    read("yearly plan", snapshot.mappings.year.id, readPayPalCatalogPlan),
  ]);
  if (getPayPalEnvironment() !== environment || getPayPalCatalogIdentity() !== accountKey) fail("PayPal configuration changed while reading. Reload before comparing.");
  return { versionId, environment, checkedAt: new Date().toISOString(), mongo: snapshot, paypal: { product, month, year } };
}
export type CatalogSourceComparison = Awaited<ReturnType<typeof readCatalogVersionSources>>;
export async function verifyCatalogVersion(actor: Actor, versionId: number) {
  requireCatalogOperator(actor);
  if (!id.safeParse(versionId).success) fail("Invalid catalog version identifier.", 400);
  const [version] = await db.find(catalogVersions, { id: versionId }, { limit: 1, maxTimeMS: 5000 });
  if (!version) fail("Catalog version not found.", 404);
  if (version.status !== "published") fail("Publish or reconcile this version before verifying its complete provider mapping.");
  if (version.definition.slug === "free" && version.environment === "local") {
    return { versionId, status: "local_only" as const, environment: "local" as const, checkedAt: new Date().toISOString() };
  }
  if (version.environment !== getPayPalEnvironment()) fail("Verify this version in its original PayPal environment.");
  if (version.detailsUpdate && !version.detailsUpdate.confirmedAt) fail("A PayPal name update is incomplete. Retry the details update to reconcile it.");
  if (version.approval && version.approval.accountKey !== getPayPalCatalogIdentity()) fail("Verify this version using its originally approved PayPal app.");
  const productId = version.productRequest.providerId, monthPlanId = version.monthRequest.providerId, yearPlanId = version.yearRequest.providerId;
  if (!productId || !monthPlanId || !yearPlanId || monthPlanId === yearPlanId) fail("Published provider mapping is incomplete or ambiguous.", 503);
  const deadline = Date.now() + 20000;
  const product = await getPayPalProduct(productId, deadline);
  if (!product || product.id !== productId || product.name !== version.product.name || (product.description ?? "") !== version.product.description) {
    fail("PayPal product does not match the immutable catalog snapshot.", 502);
  }
  for (const [interval, planId] of [["month", monthPlanId], ["year", yearPlanId]] as const) {
    const plan = await getPayPalPlan(planId, deadline);
    const request = interval === "month" ? version.monthRequest : version.yearRequest;
    if (request.nameCorrection && !request.nameCorrection.confirmedAt) fail("A PayPal name update is incomplete. Retry the name update to reconcile it.");
    if (!plan || plan.id !== planId || plan.name !== providerPlanName(version, request)) fail(`PayPal ${interval} plan identity does not match the immutable snapshot.`, 502);
    if (providerPlanDescription(request) !== undefined && plan.description !== providerPlanDescription(request)) fail(`PayPal ${interval} description does not match the saved plan details.`, 502);
    verifyPayPalPlan(plan, version.definition, interval, productId, false, request.paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY);
  }
  return { versionId, status: "verified" as const, environment: version.environment, checkedAt: new Date().toISOString(),
    productId, monthPlanId, yearPlanId };
}
export type CatalogVerification = Awaited<ReturnType<typeof verifyCatalogVersion>>;
const newRequest = (product = false): ProviderRequest => ({
  requestId: crypto.randomUUID(), startedAt: null, providerId: null,
  ...(product ? { requestedId: `PROD-${crypto.randomUUID().replaceAll("-", "").slice(0, 17).toUpperCase()}` } : {}),
});
async function audit(tx: Connection, actor: NonNullable<Actor>["user"], action: string, resourceId: number | string) {
  await tx.insert(auditLogs, { workspaceId: null, actorEmail: actor.email, action: `admin.catalog.${action}`, resourceType: "billing_catalog", resourceId: String(resourceId), metadata: { actorId: actor.id } });
}
async function renamePublishedPlans(user: NonNullable<Actor>["user"], versionId: number, details?: { name: string; description: string; revision: number }) {
  const [version] = await db.find(catalogVersions, { id: versionId });
  if (!version) fail("Catalog version not found.", 404);
  if (version.status !== "published" || version.environment === "local" || version.definition.slug === "free") fail("Only published paid PayPal versions can have their names updated.");
  const [localPlan] = await db.find(catalogPlans, { id: version.planId });
  if (!localPlan || localPlan.publishingVersionId || (details && localPlan.revision !== details.revision)) fail("Plan changed or has a pending publication. Reload before updating details.");
  if (localPlan.detailsUpdatingVersionId && localPlan.detailsUpdatingVersionId !== version.id) fail("Retry the incomplete details update on the other version first.");
  const pendingDetails = version.detailsUpdate && !version.detailsUpdate.confirmedAt ? version.detailsUpdate : undefined;
  if (pendingDetails && details && (pendingDetails.name !== details.name || normalizePayPalPlanDescription(pendingDetails.description) !== details.description)) fail("Retry the original incomplete name and description before making another change.");
  const requestedDetails = details ?? pendingDetails;
  const desiredDetails = requestedDetails ? { ...requestedDetails, description: normalizePayPalPlanDescription(requestedDetails.description) } : undefined;
  const matchingDetails = desiredDetails && version.detailsUpdate?.name === desiredDetails.name &&
    normalizePayPalPlanDescription(version.detailsUpdate.description) === desiredDetails.description ? version.detailsUpdate : undefined;
  const environment = getPayPalEnvironment(), accountKey = getPayPalCatalogIdentity();
  const approvedAccount = version.approval?.accountKey ?? version.syncAccountKey;
  const checkConfiguration = () => {
    if (version.environment !== environment || environment !== getPayPalEnvironment()) fail("Update names in the publication's original PayPal environment.");
    if (getPayPalCatalogIdentity() !== accountKey || (approvedAccount && approvedAccount !== accountKey)) fail("Update names using the publication's originally approved PayPal app.");
  };
  checkConfiguration();
  const productId = version.productRequest.providerId;
  const monthId = version.monthRequest.providerId, yearId = version.yearRequest.providerId;
  if (!productId || !monthId || !yearId || monthId === yearId) fail("Published provider mapping is incomplete or ambiguous.", 503);
  const baseName = desiredDetails?.name ?? displayDefinition(version).name;
  const names = { month: getPayPalPlanName(baseName, "month"), year: getPayPalPlanName(baseName, "year") };
  const targets = await Promise.all((["month", "year"] as const).map(async interval => {
    const field = interval === "month" ? "monthRequest" as const : "yearRequest" as const;
    const request = version[field], id = interval === "month" ? monthId : yearId;
    const name = names[interval];
    const remote = await getPayPalPlan(id);
    if (!remote || remote.id !== id || typeof remote.name !== "string" || !remote.name.trim()) fail("PayPal returned an invalid mapped plan.", 502);
    if (remote.status === "INACTIVE") fail("PayPal does not allow renaming INACTIVE plans. No plan was activated or modified.");
    verifyPayPalPlan(remote, version.definition, interval, productId, false, request.paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY);
    return { id, name, description: desiredDetails?.description, interval, field, remote, previousName: remote.name };
  }));
  const references = { environment, $or: [
    { "monthRequest.providerId": { $in: [monthId, yearId] } }, { "yearRequest.providerId": { $in: [monthId, yearId] } },
  ] };
  await db.transaction(async tx => {
    checkConfiguration();
    const [lockedPlan] = await tx.find(catalogPlans, { id: version.planId }, { lock: true });
    if (!lockedPlan || lockedPlan.revision !== localPlan.revision || lockedPlan.publishingVersionId ||
      (lockedPlan.detailsUpdatingVersionId && lockedPlan.detailsUpdatingVersionId !== version.id)) fail("Plan changed. Reload before retrying the details update.");
    const versions = await tx.find(catalogVersions, references, { lock: true });
    if (!versions.some(row => row.id === version.id && row.status === "published")) fail("Publication changed before its name update.");
    let changed = false;
    for (const row of versions) {
      const relatedAccount = row.approval?.accountKey ?? row.syncAccountKey;
      if (row.planId !== version.planId || (relatedAccount && relatedAccount !== accountKey)) fail("A mapped PayPal plan is shared with another local plan or PayPal app. Resolve that mapping before renaming.");
      const updates: Partial<Pick<CatalogVersion, "monthRequest" | "yearRequest">> = {};
      for (const field of ["monthRequest", "yearRequest"] as const) {
        const request = row[field], target = targets.find(target => target.id === request.providerId);
        if (!target) continue;
        if (!row.productRequest.providerId) fail("A shared product mapping is incomplete.", 503);
        verifyPayPalPlan(target.remote, row.definition, field === "monthRequest" ? "month" : "year", row.productRequest.providerId, false, request.paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY);
        if (target.remote.name === target.name && providerPlanName(row, request) === target.name &&
          (target.description === undefined || (target.remote.description === target.description && providerPlanDescription(request) === target.description)) &&
          (!request.nameCorrection || request.nameCorrection.confirmedAt)) continue;
        const pending = request.nameCorrection?.name === target.name && !request.nameCorrection.confirmedAt ? request.nameCorrection : undefined;
        updates[field] = { ...request, nameCorrection: {
          name: target.name, previousName: pending?.previousName ?? target.previousName,
          ...(target.description !== undefined ? { description: target.description, previousDescription: pending?.previousDescription ?? target.remote.description ?? "" } : {}),
          requestedAt: pending?.requestedAt ?? new Date(), confirmedAt: null, error: null,
        } };
      }
      if (Object.keys(updates).length) { await tx.update(catalogVersions, { id: row.id }, updates); changed = true; }
    }
    if (desiredDetails) {
      await tx.update(catalogPlans, { id: lockedPlan.id }, { detailsUpdatingVersionId: version.id });
      await tx.update(catalogVersions, { id: version.id }, { detailsUpdate: {
        name: desiredDetails.name, description: desiredDetails.description, requestedAt: matchingDetails?.requestedAt ?? new Date(), confirmedAt: null,
        ...(matchingDetails?.originalDescription !== undefined ? { originalDescription: matchingDetails.originalDescription }
          : pendingDetails && pendingDetails.description !== desiredDetails.description ? { originalDescription: pendingDetails.description } : {}),
      } });
    }
    if (changed) await audit(tx, user, "plan_names_update_started", version.id);
  });
  for (const target of targets) {
    const record = async (error: string | null) => db.transaction(async tx => {
      checkConfiguration();
      let changed = false;
      for (const row of await tx.find(catalogVersions, references, { lock: true })) {
        const updates: Partial<Pick<CatalogVersion, "monthRequest" | "yearRequest">> = {};
        for (const field of ["monthRequest", "yearRequest"] as const) {
          const request = row[field], correction = request.nameCorrection;
          if (request.providerId !== target.id || !correction) continue;
          if (correction.name !== target.name || (target.description !== undefined && correction.description !== target.description)) fail("The name or description update changed. Reload before retrying.");
          if (correction.confirmedAt && !error) continue;
          updates[field] = { ...request, nameCorrection: { ...correction, confirmedAt: error ? null : new Date(), error } };
        }
        if (Object.keys(updates).length) { await tx.update(catalogVersions, { id: row.id }, updates); changed = true; }
      }
      if (!error && changed) await audit(tx, user, `plan_name_${target.interval}_confirmed`, version.id);
    });
    try {
      checkConfiguration();
      let remote = await getPayPalPlan(target.id);
      if (!remote || remote.id !== target.id) fail("PayPal returned an invalid mapped plan.", 502);
      verifyPayPalPlan(remote, version.definition, target.interval, productId, false, version[target.field].paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY);
      if (remote.name !== target.name || (target.description !== undefined && remote.description !== target.description)) {
        checkConfiguration();
        await renamePayPalPlan(target.id, target.name, target.description, remote);
        checkConfiguration();
        remote = await getPayPalPlan(target.id);
      }
      if (!remote || remote.id !== target.id || remote.name !== target.name) fail("PayPal has not confirmed the requested name. Retry the name update to reconcile it.", 502);
      if (target.description !== undefined && remote.description !== target.description) fail("PayPal has not confirmed the requested description. Retry the details update.", 502);
      verifyPayPalPlan(remote, version.definition, target.interval, productId, false, version[target.field].paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY);
      await record(null);
    } catch (error) {
      await record(error instanceof BillingError ? error.message : "The PayPal name update failed. Retry it to reconcile any partial changes.");
      throw error;
    }
  }
  if (desiredDetails) await db.transaction(async tx => {
    checkConfiguration();
    const [plan] = await tx.find(catalogPlans, { id: version.planId }, { lock: true });
    if (!plan || plan.detailsUpdatingVersionId !== version.id || plan.revision !== localPlan.revision) fail("Local plan changed. Retry to finish saving the verified PayPal details.");
    const related = await tx.find(catalogVersions, references, { lock: true });
    const complete = related.filter(row => row.monthRequest.providerId === monthId && row.yearRequest.providerId === yearId);
    const updatesCurrent = complete.some(row => row.id === plan.currentVersions[environment]);
    const changesDraft = updatesCurrent && (plan.draft.name !== desiredDetails.name || plan.draft.description !== desiredDetails.description);
    const nextRevision = plan.revision + (changesDraft ? 1 : 0);
    for (const row of complete) {
      if (row.monthRequest.nameCorrection && !row.monthRequest.nameCorrection.confirmedAt ||
        row.yearRequest.nameCorrection && !row.yearRequest.nameCorrection.confirmedAt) fail("Provider details are still incomplete. Retry before saving locally.");
      await tx.update(catalogVersions, { id: row.id }, {
        presentation: { name: desiredDetails.name, description: desiredDetails.description },
        ...(row.id === version.id && row.detailsUpdate ? { detailsUpdate: { ...row.detailsUpdate, confirmedAt: new Date() } } : {}),
        ...(updatesCurrent && row.id === plan.currentVersions[environment] && displayRevision(row) === plan.revision ? { presentationRevision: nextRevision } : {}),
      });
    }
    await tx.update(catalogPlans, { id: plan.id }, {
      detailsUpdatingVersionId: null,
      ...(changesDraft ? { draft: { ...plan.draft, name: desiredDetails.name, description: desiredDetails.description }, revision: nextRevision } : {}),
    });
    await audit(tx, user, "plan_details_updated", version.id);
  });
}
export async function manageCatalog(actor: Actor, input: unknown): Promise<void> {
  const user = requireCatalogOperator(actor);
  rejectPrototypeKeys(input);
  const parsed = catalogActionSchema.safeParse(input);
  if (!parsed.success) fail(parsed.error.issues.map(issue => issue.message).join(" ").slice(0, 1000), 400);
  const action = parsed.data;
  if (action.action === "publish_plan" || action.action === "use_paypal_setup" || action.action === "rename_paypal_plans" || action.action === "update_plan_details") {
    const deadline = Date.now() + 20000;
    const completed = await db.withLease(`catalog-publication:${getPayPalEnvironment()}`, async () => {
      await withWorkerDeadline(deadline, () => action.action === "rename_paypal_plans" || action.action === "update_plan_details" ? renamePublishedPlans(user, action.versionId, action.action === "update_plan_details" ? action : undefined)
        : publishPlan(user, action.id, action.revision, action.action === "use_paypal_setup" ? action.setup : undefined));
      return true;
    }, false);
    if (!completed) fail("Catalog publication is busy. Wait for the active administrator request before retrying.");
    return;
  }
  await db.transaction(async tx => {
    if (action.action === "initialize_defaults") {
      if ((await tx.find(catalogProducts)).length || (await tx.find(catalogPlans)).length) fail("Default initialization requires an empty catalog.");
      const [product] = await tx.insert(catalogProducts, { slug: "postif-ai", name: "POSTIF-AI", description: "POSTIF-AI platform subscription" });
      for (const definition of Object.values(SUBSCRIPTION_PLANS)) await tx.insert(catalogPlans, { slug: definition.slug, productId: product.id, draft: structuredClone(definition) });
      await audit(tx, user, action.action, product.id);
      return;
    }
    if (action.action === "create_product") {
      if ((await tx.find(catalogProducts, { slug: action.slug })).length) fail("Product slug already exists.");
      const [product] = await tx.insert(catalogProducts, { slug: action.slug, name: action.name, description: action.description });
      await audit(tx, user, action.action, product.id);
      return;
    }
    if (action.action === "create_plan") {
      const [product] = await tx.find(catalogProducts, { id: action.productId }, { lock: true });
      if (!product || product.archived || product.publishingVersionId) fail("Product is unavailable or publishing.");
      if ((await tx.find(catalogPlans, { slug: action.definition.slug })).length) fail("Plan slug already exists.");
      const [plan] = await tx.insert(catalogPlans, { slug: action.definition.slug, productId: product.id, draft: action.definition });
      await audit(tx, user, action.action, plan.id);
      return;
    }
    if (action.action === "edit_product" || action.action === "archive_product") {
      const [product] = await tx.find(catalogProducts, { id: action.id }, { lock: true });
      if (!product || product.revision !== action.revision || product.publishingVersionId) fail("Product changed or has a pending publication.");
      await tx.update(catalogProducts, { id: product.id }, action.action === "edit_product" ? { name: action.name, description: action.description, revision: product.revision + 1 } : { archived: action.archived, revision: product.revision + 1 });
    } else {
      const [plan] = await tx.find(catalogPlans, { id: action.id }, { lock: true });
      if (!plan || plan.revision !== action.revision || plan.publishingVersionId || plan.detailsUpdatingVersionId) fail("Plan changed or has a pending publication/details update. Retry the incomplete operation first.");
      const [product] = await tx.find(catalogProducts, { id: plan.productId }, { lock: true });
      if (!product || product.publishingVersionId) fail("Product has a pending publication.");
      if (action.action === "edit_plan") {
        if (action.definition.slug !== plan.slug) fail("Stable plan slugs cannot change.", 400);
        await tx.update(catalogPlans, { id: plan.id }, { draft: action.definition, revision: plan.revision + 1 });
      } else {
        if (plan.slug === "free" && action.archived) fail("Free cannot be archived.");
        await tx.update(catalogPlans, { id: plan.id }, { archived: action.archived, revision: plan.revision + 1 });
      }
    }
    await audit(tx, user, action.action, action.id);
  });
}
type PreparedPayPalSetup = {
  productRevision: number;
  environment: "sandbox" | "live";
  accountKey: string;
  product?: { id: string; name: string; description: string };
  month?: { id: string; name: string; description?: string; paymentPolicy: PayPalPaymentPolicy };
  year?: { id: string; name: string; description?: string; paymentPolicy: PayPalPaymentPolicy };
};
async function preparePayPalSetup(planId: number, expectedRevision: number, setup?: PayPalSetupSelection): Promise<PreparedPayPalSetup | undefined> {
  const [plan] = await db.find(catalogPlans, { id: planId });
  if (!plan || plan.archived || plan.revision !== expectedRevision) fail("Plan changed or is archived.");
  if (plan.detailsUpdatingVersionId) fail("Retry the incomplete plan details update before publishing.");
  const [product] = await db.find(catalogProducts, { id: plan.productId });
  if (!product || product.archived) fail("Product is unavailable.");
  if (plan.slug === "free") {
    if (setup) fail("Free is local-only and cannot use PayPal resources.", 400);
    return;
  }
  const environment = getPayPalEnvironment(), accountKey = getPayPalCatalogIdentity();
  if (!setup && plan.publishingVersionId) return;
  const currentId = plan.currentVersions[environment];
  if (!setup && currentId) {
    const [current] = await db.find(catalogVersions, { id: currentId });
    if (current && displayRevision(current) === plan.revision && current.productRevision === product.revision) return;
  }
  const mapping = product.paypalProducts?.[environment];
  if (mapping && mapping.accountKey !== accountKey) fail("The local product is linked to a different PayPal app. Switch to its original configuration.");
  if (setup?.productId && mapping && setup.productId !== mapping.id) fail("This local product is already linked to another PayPal product. Existing mappings will not be overwritten.");
  const productId = setup?.productId ?? mapping?.id;
  if ((setup?.monthPlanId || setup?.yearPlanId) && !productId) fail("Select the existing PayPal product before linking plans.", 400);
  if (setup?.monthPlanId && setup.monthPlanId === setup.yearPlanId) fail("Monthly and annual mappings must use different PayPal plan IDs.", 400);
  if (!productId) return { productRevision: product.revision, environment, accountKey };
  const remoteProduct = await getPayPalProduct(productId);
  if (!remoteProduct || remoteProduct.id !== productId || typeof remoteProduct.name !== "string" || !remoteProduct.name.trim() ||
    (remoteProduct.description !== undefined && typeof remoteProduct.description !== "string")) fail("PayPal returned invalid product metadata.", 502);
  const selected: Pick<PreparedPayPalSetup, "month" | "year"> = {};
  for (const [interval, selectedId] of [["month", setup?.monthPlanId], ["year", setup?.yearPlanId]] as const) {
    if (!selectedId) continue;
    const remote = await getPayPalPlan(selectedId);
    if (!remote || remote.id !== selectedId || typeof remote.name !== "string" || !remote.name.trim()) fail(`PayPal returned invalid ${interval} plan metadata.`, 502);
    try { verifyPayPalPlan(remote, plan.draft, interval, productId); }
    catch (error) {
      if (!(error instanceof BillingError)) throw error;
      fail(`Existing ${interval === "month" ? "monthly" : "annual"} plan is incompatible: ${error.message}`, 409);
    }
    const [alreadyLinked] = await db.find(catalogVersions, { environment, planId: { $ne: plan.id },
      $or: [{ "monthRequest.providerId": selectedId }, { "yearRequest.providerId": selectedId }] }, { limit: 1 });
    if (alreadyLinked) fail("This PayPal plan is already mapped to a different local plan.");
    selected[interval] = { id: selectedId, name: remote.name, ...(typeof remote.description === "string" ? { description: remote.description } : {}), paymentPolicy: getPayPalPaymentPolicy(remote) };
  }
  return { productRevision: product.revision, environment, accountKey, product: { id: remoteProduct.id, name: remoteProduct.name, description: remoteProduct.description ?? "" }, ...selected };
}
async function publishPlan(user: NonNullable<Actor>["user"], planId: number, expectedRevision: number, setup?: PayPalSetupSelection) {
  const originalEnvironment = getPayPalEnvironment();
  const selected = await preparePayPalSetup(planId, expectedRevision, setup);
  const token = crypto.randomUUID();
  let version = await db.transaction(async tx => {
    const [plan] = await tx.find(catalogPlans, { id: planId }, { lock: true });
    if (!plan || plan.archived || plan.revision !== expectedRevision) fail("Plan changed or is archived.");
    if (plan.detailsUpdatingVersionId) fail("Retry the incomplete plan details update before publishing.");
    const [product] = await tx.find(catalogProducts, { id: plan.productId }, { lock: true });
    if (!product || product.archived) fail("Product is unavailable.");
    if (selected && product.revision !== selected.productRevision) fail("Product changed while PayPal resources were being verified.");
    const environment = plan.slug === "free" ? "local" : getPayPalEnvironment();
    const approvalKey = environment === "local" ? "local" : getPayPalCatalogIdentity();
    if (selected && (environment !== selected.environment || approvalKey !== selected.accountKey)) fail("PayPal configuration changed while resources were being verified.");
    let pending: CatalogVersion | undefined;
    let replacedPendingId: number | undefined;
    if (plan.publishingVersionId) {
      [pending] = await tx.find(catalogVersions, { id: plan.publishingVersionId }, { lock: true });
      if (!pending || pending.status !== "pending" || pending.environment !== environment || pending.leaseExpiresAt > new Date()) fail("Publication is busy or requires reconciliation in its original environment.");
      if (pending.approval && pending.approval.accountKey !== approvalKey) fail("Publication must use the originally approved PayPal app.");
      if (setup) {
        if (setup.replacePendingVersionId !== pending.id) fail("Explicitly confirm replacement of this incomplete publication. Previous provider resources will not be deleted.");
        await tx.update(catalogVersions, { id: pending.id }, { status: "superseded", publicationError: "Replaced by an explicitly selected PayPal setup. Existing provider resources were retained.", leaseToken: null });
        await audit(tx, user, "pending_setup_superseded", pending.id);
        replacedPendingId = pending.id;
        pending = undefined;
      }
    } else if (setup?.replacePendingVersionId) fail("The pending publication changed. Reload before replacing its setup.");
    if (!pending) {
      if (product.publishingVersionId && product.publishingVersionId !== replacedPendingId) fail("Product publication is busy.");
      const currentId = plan.currentVersions[environment];
      const [current] = currentId ? await tx.find(catalogVersions, { id: currentId }) : [];
      const sameSetup = current && selected?.product?.id === current.productRequest.providerId &&
        (!setup?.monthPlanId || setup.monthPlanId === current.monthRequest.providerId) &&
        (!setup?.yearPlanId || setup.yearPlanId === current.yearRequest.providerId);
      if ((!setup || (!plan.publishingVersionId && sameSetup)) && current && displayRevision(current) === plan.revision && current.productRevision === product.revision) {
        if (current.approval && current.approval.accountKey !== approvalKey) fail("Publication must use the originally approved PayPal app.");
        return current;
      }
      const definition = { ...structuredClone(plan.draft), ...(plan.draft.description !== undefined ? { description: normalizePayPalPlanDescription(plan.draft.description) } : {}) };
      [pending] = await tx.insert(catalogVersions, {
        planId: plan.id, productId: product.id, draftRevision: plan.revision, productRevision: product.revision,
        definition, product: selected?.product ? { name: selected.product.name, description: selected.product.description } : { name: product.name, description: product.description },
        environment, status: "pending",
        productRequest: { ...newRequest(true), ...(selected?.product ? { providerId: selected.product.id } : {}) },
        monthRequest: { ...newRequest(), name: selected?.month?.name ?? (environment === "local" ? plan.draft.name : getPayPalPlanName(plan.draft.name, "month")),
          ...(selected?.month?.description !== undefined ? { description: selected.month.description } : !selected?.month && definition.description !== undefined ? { description: definition.description } : {}),
          paymentPolicy: selected?.month?.paymentPolicy ?? selected?.year?.paymentPolicy ?? current?.monthRequest.paymentPolicy ?? { ...DEFAULT_PAYPAL_PAYMENT_POLICY }, ...(selected?.month ? { providerId: selected.month.id } : {}) },
        yearRequest: { ...newRequest(), name: selected?.year?.name ?? (environment === "local" ? plan.draft.name : getPayPalPlanName(plan.draft.name, "year")),
          ...(selected?.year?.description !== undefined ? { description: selected.year.description } : !selected?.year && definition.description !== undefined ? { description: definition.description } : {}),
          paymentPolicy: selected?.year?.paymentPolicy ?? selected?.month?.paymentPolicy ?? current?.yearRequest.paymentPolicy ?? { ...DEFAULT_PAYPAL_PAYMENT_POLICY }, ...(selected?.year ? { providerId: selected.year.id } : {}) },
        leaseToken: token, leaseExpiresAt: new Date(Date.now() + 600000), createdAt: new Date(), publishedAt: null,
        approval: { userId: user.id, accountKey: approvalKey }, publicationAttempts: 0, publicationError: null,
      });
      await tx.update(catalogPlans, { id: plan.id }, { publishingVersionId: pending.id });
      await tx.update(catalogProducts, { id: product.id }, { publishingVersionId: pending.id });
      await audit(tx, user, "publish_started", pending.id);
      if (setup) await audit(tx, user, "existing_setup_selected", pending.id);
    }
    const [claimed] = await tx.update(catalogVersions, { id: pending.id }, {
      leaseToken: token, leaseExpiresAt: new Date(Date.now() + 600000),
      publicationAttempts: (pending.publicationAttempts ?? 0) + 1, publicationError: null,
    });
    return claimed;
  });
  if (version.status === "published") {
    await verifyCatalogVersion({ user }, version.id);
    await db.update(catalogVersions, { id: version.id, status: "published" }, {
      syncStatus: "verified", syncCheckedAt: new Date(), syncError: null,
      syncAccountKey: version.environment === "local" ? "local" : getPayPalCatalogIdentity(),
    });
    return;
  }
  const saveRequest = async (field: "productRequest" | "monthRequest" | "yearRequest", request: ProviderRequest) => {
    const [updated] = await db.update(catalogVersions, { id: version.id, leaseToken: token, status: "pending", leaseExpiresAt: { $gt: new Date() } }, { [field]: request, leaseExpiresAt: new Date(Date.now() + 600000) });
    if (!updated) fail("Publication lease lost; retry to reconcile.");
    version = updated;
  };
  const execute = async (field: "productRequest" | "monthRequest" | "yearRequest", create: (requestId: string) => Promise<{ id: string }>) => {
    let request = version[field];
    if (request.providerId) return request.providerId;
    if (field === "productRequest" && request.startedAt && request.requestedId) {
      await saveRequest(field, request);
      let existing;
      try { existing = await getPayPalProduct(request.requestedId); }
      catch (error) { if (!(error instanceof BillingError) || error.providerStatus !== 404) throw error; }
      if (existing) {
        if (existing.id !== request.requestedId || existing.name !== version.product.name || existing.description !== version.product.description) fail("Provider product reconciliation does not match the snapshot.", 502);
        await saveRequest(field, { ...request, providerId: existing.id });
        return existing.id;
      }
    }
    if (request.startedAt && Date.now() - request.startedAt.getTime() >= 71 * 3600000) fail("Provider outcome is uncertain beyond the idempotency window. Operator reconciliation is required; no new request will be issued.");
    request = { ...request, startedAt: request.startedAt ?? new Date() };
    await saveRequest(field, request);
    const result = await create(request.requestId);
    await saveRequest(field, { ...request, providerId: result.id });
    return result.id;
  };
  const checkConfiguration = () => {
    if (version.environment === "local") return;
    if (version.environment !== originalEnvironment || version.environment !== getPayPalEnvironment()) fail("Provider environment changed.");
    if (version.approval && version.approval.accountKey !== getPayPalCatalogIdentity()) fail("Publication must use the originally approved PayPal app.");
  };
  try {
    if (version.environment !== "local") {
      checkConfiguration();
      const productId = await execute("productRequest", requestId => createPayPalProduct({ ...version.product, id: version.productRequest.requestedId }, requestId));
      const providerProduct = await getPayPalProduct(productId);
      if (providerProduct.id !== productId || providerProduct.name !== version.product.name || (providerProduct.description ?? "") !== version.product.description) fail("Provider product does not match the catalog snapshot.", 502);
      for (const interval of ["month", "year"] as const) {
        checkConfiguration();
        const requestField = interval === "month" ? "monthRequest" : "yearRequest";
        const planId = await execute(requestField, requestId => createPayPalPlan({ productId, plan: version.definition, interval, name: version[requestField].name ?? version.definition.name, paymentPolicy: version[requestField].paymentPolicy }, requestId));
        const providerPlan = await getPayPalPlan(planId);
        const request = interval === "month" ? version.monthRequest : version.yearRequest;
        if (request.nameCorrection && !request.nameCorrection.confirmedAt) fail("A PayPal name update is incomplete. Retry the name update before publication.");
        if (providerPlan.id !== planId || providerPlan.name !== providerPlanName(version, request)) fail("Provider plan ID or name mismatch.", 502);
        if (providerPlanDescription(request) !== undefined && providerPlan.description !== providerPlanDescription(request)) fail("Provider plan description does not match the saved details.", 502);
        verifyPayPalPlan(providerPlan, version.definition, interval, productId, false, request.paymentPolicy ?? DEFAULT_PAYPAL_PAYMENT_POLICY);
      }
    }
    await db.transaction(async tx => {
      checkConfiguration();
      const [locked] = await tx.find(catalogVersions, { id: version.id, leaseToken: token, status: "pending", leaseExpiresAt: { $gt: new Date() } }, { lock: true });
      const [plan] = await tx.find(catalogPlans, { id: planId }, { lock: true });
      const [product] = await tx.find(catalogProducts, { id: version.productId }, { lock: true });
      if (!locked || !plan || !product || plan.archived || product.archived || plan.revision !== version.draftRevision || product.revision !== version.productRevision || plan.publishingVersionId !== version.id || product.publishingVersionId !== version.id) fail("Publication state changed; reconciliation required.");
      await tx.update(catalogVersions, { id: version.id }, {
        status: "published", publishedAt: new Date(), leaseToken: null, leaseExpiresAt: new Date(0), publicationError: null,
        syncStatus: "verified", syncCheckedAt: new Date(), syncError: null,
        syncAccountKey: version.environment === "local" ? "local" : getPayPalCatalogIdentity(),
      });
      await tx.update(catalogPlans, { id: plan.id }, { currentVersions: { ...plan.currentVersions, [version.environment]: version.id }, publishingVersionId: null });
      const mappings = { ...product.paypalProducts };
      if (version.environment !== "local") {
        const providerProductId = version.productRequest.providerId;
        if (!providerProductId) fail("Verified product mapping is missing.", 503);
        mappings[version.environment] = { id: providerProductId, accountKey: getPayPalCatalogIdentity() };
      }
      await tx.update(catalogProducts, { id: product.id }, {
        publishingVersionId: null, ...(version.environment !== "local" ? { paypalProducts: mappings } : {}),
      });
      await audit(tx, user, "published", version.id);
    });
  } catch (error) {
    await db.update(catalogVersions, { id: version.id, leaseToken: token, status: "pending" }, {
      leaseToken: null, leaseExpiresAt: new Date(0),
      publicationError: error instanceof BillingError ? error.message : "Publication failed. Retry manually or reconcile the pending publication.",
    });
    throw error;
  }
}
