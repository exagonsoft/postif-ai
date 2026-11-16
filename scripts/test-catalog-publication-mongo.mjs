import "./register-ts.mjs";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
Object.assign(process.env, {
  MONGODB_URI: replica.getUri(), MONGODB_DB: "postif_catalog_publication_test", PAYPAL_ENVIRONMENT: "sandbox",
  PAYPAL_CLIENT_ID: "isolated-catalog-client", PAYPAL_CLIENT_SECRET: "isolated-catalog-secret", BILLING_ENABLED: "false",
});
const { db, initializeDatabase, closeDatabase } = await import("../src/db/index.ts");
const { users, workspaces, auditLogs } = await import("../src/db/schema.ts");
const { catalogProducts, catalogPlans, catalogVersions } = await import("../src/db/catalog-schema.ts");
const { billingSubscriptions } = await import("../src/db/billing-schema.ts");
const { manageCatalog, getAdminCatalog, getCatalogPlans, getPurchasablePlan, readCatalogVersionSources, verifyCatalogVersion } = await import("../src/lib/billing-catalog.ts");
const { getPayPalCatalogIdentity } = await import("../src/lib/paypal.ts");
const originalFetch = globalThis.fetch;
const products = new Map(), plans = new Map(), calls = [], requestIds = new Map();
let sequence = 0, failMonth = false, rejectRenameId = null, failRenameId = null, ignoreDetailsPatchId = null;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url), method = options.method || "GET", path = parsed.pathname;
  assert.equal(parsed.origin, "https://api-m.sandbox.paypal.com");
  calls.push({ path, method, requestId: options.headers?.["PayPal-Request-Id"], ...(method === "PATCH" ? { body: JSON.parse(options.body) } : {}) });
  if (path === "/v1/oauth2/token") return Response.json({ access_token: "isolated-provider-token", expires_in: 3600 });
  if (method === "POST") {
    assert.ok(path === "/v1/catalogs/products" || path === "/v1/billing/plans", "No subscription/payment writes are permitted.");
    const requestId = options.headers["PayPal-Request-Id"];
    assert.ok(requestId);
    let resource = requestIds.get(requestId);
    if (!resource) {
      const body = JSON.parse(options.body), id = body.id || `P-NEW-${++sequence}`;
      resource = { ...body, id };
      requestIds.set(requestId, resource);
      (path === "/v1/catalogs/products" ? products : plans).set(id, resource);
    }
    if (path === "/v1/billing/plans" && failMonth) { failMonth = false; throw new Error("Uncertain isolated provider result"); }
    return Response.json({ id: resource.id });
  }
  if (method === "PATCH") {
    assert.ok(path.startsWith("/v1/billing/plans/"), "Only plan name/description updates are permitted.");
    const id = path.split("/").at(-1), body = JSON.parse(options.body), resource = plans.get(id);
    assert.ok(body.length === 1 || body.length === 2);
    assert.deepEqual({ ...body[0], value: "name" }, { op: "replace", path: "/name", value: "name" });
    if (body.length === 2) {
      assert.equal(body[1].path, "/description");
      assert.ok(body[1].op === "add" || body[1].op === "replace");
      if (body[1].op === "replace" && !Object.hasOwn(resource, "description")) {
        return Response.json({ name: "INVALID_REQUEST", details: [{ issue: "INVALID_PATCH_PATH", field: "/1/path" }] }, { status: 400 });
      }
    }
    if (body.some(operation => /[\r\n\u0085\u2028\u2029]/.test(operation.value))) {
      return Response.json({ name: "INVALID_REQUEST", details: [{ issue: "INVALID_STRING_PATTERN", field: "/1/value" }] }, { status: 400 });
    }
    if (id === rejectRenameId) return Response.json({ name: "INVALID_REQUEST" }, { status: 400 });
    assert.ok(resource);
    if (id === ignoreDetailsPatchId) return new Response(null, { status: 204 });
    resource.name = body[0].value;
    if (body.length === 2) resource.description = body[1].value;
    if (id === failRenameId) { failRenameId = null; throw new Error("Uncertain isolated rename result"); }
    return new Response(null, { status: 204 });
  }
  assert.equal(method, "GET");
  const id = path.split("/").at(-1);
  const resource = path.startsWith("/v1/catalogs/products/") ? products.get(id) : plans.get(id);
  return resource ? Response.json(resource) : new Response("private-missing-marker", { status: 404 });
};
async function publish(actor, slug) {
  const [plan] = await db.find(catalogPlans, { slug });
  await manageCatalog(actor, { action: "publish_plan", id: plan.id, revision: plan.revision });
  return (await db.find(catalogVersions, { planId: plan.id, environment: process.env.PAYPAL_ENVIRONMENT, status: "published" }, { sort: { id: -1 }, limit: 1 }))[0];
}
try {
  await initializeDatabase();
  const [user] = await db.insert(users, { email: "operator@example.invalid", name: "Isolated operator", passwordHash: "synthetic-only", systemRole: "operator" });
  const actor = { user };
  await manageCatalog(actor, { action: "initialize_defaults" });
  assert.equal(calls.length, 0, "Local draft initialization must not contact PayPal.");
  await assert.rejects(publish(null, "starter_byok"), error => error.status === 403);
  await assert.rejects(publish({ user: { ...user, systemRole: "user" } }, "starter_byok"), error => error.status === 403);
  assert.equal(calls.length, 0);

  failMonth = true;
  await assert.rejects(publish(actor, "starter_byok"), /could not be reached/);
  const [pending] = await db.find(catalogVersions);
  assert.equal(pending.status, "pending");
  assert.equal(pending.approval.accountKey, getPayPalCatalogIdentity());
  assert.equal(pending.publicationAttempts, 1);
  assert.match(pending.publicationError, /could not be reached/);
  const publishers = await Promise.allSettled([publish(actor, "starter_byok"), publish(actor, "starter_byok")]);
  assert.ok(publishers.some(result => result.status === "fulfilled"));
  assert.equal(requestIds.size, 3, "Retry must reuse the product/month/year provider resources.");
  const [version] = await db.find(catalogVersions, { id: pending.id });
  assert.equal(version.publicationError, null);
  assert.equal(version.publicationAttempts, 2);
  const mapping = await getPurchasablePlan("starter_byok", "month");
  assert.equal(plans.get(version.monthRequest.providerId).name, "POSTIF-AI Starter BYOK \u2014 Monthly");
  assert.equal(plans.get(version.yearRequest.providerId).name, "POSTIF-AI Starter BYOK \u2014 Yearly");
  assert.equal(plans.get(version.monthRequest.providerId).description, version.definition.description);
  assert.equal(plans.get(version.yearRequest.providerId).description, version.definition.description);
  assert.equal(mapping.versionId, version.id);
  assert.equal((await db.find(catalogVersions)).length, 1);
  assert.ok((await db.find(catalogPlans)).filter(plan => plan.id !== version.planId).every(plan => Object.keys(plan.currentVersions).length === 0 && !plan.publishingVersionId));
  assert.ok((await db.find(auditLogs)).some(log => log.action === "admin.catalog.publish_started" && log.actorEmail === user.email));
  assert.ok((await db.find(auditLogs)).some(log => log.action === "admin.catalog.published" && log.actorEmail === user.email));
  const resourceCount = requestIds.size;
  assert.equal((await publish(actor, "starter_byok")).id, version.id);
  assert.equal(requestIds.size, resourceCount, "Republishing the selected unchanged plan must not create duplicates.");
  const beforeSourceAccess = calls.length;
  await assert.rejects(readCatalogVersionSources(null, version.id), error => error.status === 403);
  await assert.rejects(readCatalogVersionSources({ user: { ...user, systemRole: "user" } }, version.id), error => error.status === 403);
  await assert.rejects(readCatalogVersionSources(actor, -1), error => error.status === 400);
  const sourceClient = process.env.PAYPAL_CLIENT_ID;
  process.env.PAYPAL_CLIENT_ID = "wrong-source-client";
  await assert.rejects(readCatalogVersionSources(actor, version.id), /originally approved/);
  process.env.PAYPAL_CLIENT_ID = sourceClient;
  process.env.PAYPAL_ENVIRONMENT = "live";
  await assert.rejects(readCatalogVersionSources(actor, version.id), /original PayPal environment/);
  process.env.PAYPAL_ENVIRONMENT = "sandbox";
  assert.equal(calls.length, beforeSourceAccess);
  const storedBeforeRead = await Promise.all([catalogPlans, catalogProducts, catalogVersions, auditLogs].map(model => db.find(model)));
  const sourceRead = await readCatalogVersionSources(actor, version.id);
  assert.equal(sourceRead.mongo.draft.name, version.definition.name);
  assert.equal(sourceRead.mongo.currentVersionId, version.id);
  assert.equal(sourceRead.mongo.mappings.month.id, mapping.paypalPlanId);
  assert.equal(sourceRead.paypal.month.data.name, plans.get(mapping.paypalPlanId).name);
  assert.equal(sourceRead.paypal.year.data.cycles[0].price.value, "84.00");
  assert.ok(calls.slice(beforeSourceAccess).every(call => call.method === "GET" || call.path === "/v1/oauth2/token"));
  const monthBeforeSource = structuredClone(plans.get(mapping.paypalPlanId));
  const yearBeforeSource = structuredClone(plans.get(version.yearRequest.providerId));
  plans.get(mapping.paypalPlanId).name = "Edited directly on PayPal";
  plans.get(mapping.paypalPlanId).description = "Provider-only description, not saved in MongoDB.";
  plans.get(mapping.paypalPlanId).subscriber_private_marker = "must-not-be-returned";
  plans.get(version.yearRequest.providerId).billing_cycles[0].pricing_scheme.fixed_price.value = "99.00";
  const observed = await readCatalogVersionSources(actor, version.id);
  assert.equal(observed.mongo.mappings.month.name, version.monthRequest.name);
  assert.equal(observed.paypal.month.data.name, "Edited directly on PayPal", "Display real provider values even when they differ; do not substitute the MongoDB snapshot.");
  assert.equal(observed.paypal.month.data.description, "Provider-only description, not saved in MongoDB.");
  assert.equal(observed.paypal.year.data.cycles[0].price.value, "99.00");
  assert.equal(observed.mongo.publication.definition.annualMonthlyPrice, 7);
  assert.doesNotMatch(JSON.stringify(observed), /subscriber_private_marker|must-not-be-returned|isolated-catalog-secret|isolated-provider-token/);
  plans.delete(version.yearRequest.providerId);
  const missingSource = await readCatalogVersionSources(actor, version.id);
  assert.equal(missingSource.paypal.year.status, "missing");
  assert.equal(missingSource.paypal.month.status, "loaded", "A missing interval must not hide successful independent reads.");
  assert.equal(missingSource.paypal.product.status, "loaded");
  plans.set(version.yearRequest.providerId, yearBeforeSource);
  plans.get(mapping.paypalPlanId).name = 123;
  const invalidSource = await readCatalogVersionSources(actor, version.id);
  assert.equal(invalidSource.paypal.month.status, "error");
  assert.equal("data" in invalidSource.paypal.month, false, "Invalid provider responses must not be replaced by stored MongoDB values.");
  assert.equal(invalidSource.paypal.year.status, "loaded");
  plans.set(mapping.paypalPlanId, monthBeforeSource);
  plans.set(version.yearRequest.providerId, yearBeforeSource);
  assert.deepEqual(await Promise.all([catalogPlans, catalogProducts, catalogVersions, auditLogs].map(model => db.find(model))), storedBeforeRead, "Reading and displaying differences must not write or synchronize MongoDB.");

  const [workspace] = await db.insert(workspaces, { name: "Isolated customer", slug: "isolated", ownerId: user.id, aiCreditsBalance: 7 });
  await db.insert(billingSubscriptions, { workspaceId: workspace.id, environment: "sandbox", planSnapshot: mapping.definition,
    paidThrough: new Date(Date.now() + 86400000), status: "ACTIVE" });
  const subscriptionBefore = (await db.find(billingSubscriptions))[0];
  const rename = () => manageCatalog(actor, { action: "rename_paypal_plans", versionId: version.id, confirm: true });
  const legacyMonth = { ...version.monthRequest }, legacyYear = { ...version.yearRequest };
  delete legacyMonth.name; delete legacyYear.name;
  await db.update(catalogVersions, { id: version.id }, { monthRequest: legacyMonth, yearRequest: legacyYear });
  plans.get(legacyMonth.providerId).name = version.definition.name;
  plans.get(legacyYear.providerId).name = version.definition.name;
  const legacySources = await readCatalogVersionSources(actor, version.id);
  assert.equal(legacySources.mongo.mappings.month.name, null, "Missing MongoDB names must not be synthesized from the base plan name.");
  assert.equal((await getAdminCatalog(actor)).versions.find(row => row.id === version.id).paypalMonthName, null);
  assert.equal(legacySources.paypal.month.data.name, version.definition.name);
  const [legacyVersion] = await db.find(catalogVersions, { id: version.id });
  const aliasData = { ...legacyVersion };
  delete aliasData.id;
  const [alias] = await db.insert(catalogVersions, aliasData);
  const beforeUnauthorizedRename = calls.length;
  await assert.rejects(manageCatalog(null, { action: "rename_paypal_plans", versionId: version.id, confirm: true }), error => error.status === 403);
  const originalRenameClient = process.env.PAYPAL_CLIENT_ID;
  process.env.PAYPAL_CLIENT_ID = "wrong-rename-client";
  await assert.rejects(rename(), /originally approved/);
  process.env.PAYPAL_CLIENT_ID = originalRenameClient;
  process.env.PAYPAL_ENVIRONMENT = "live";
  await assert.rejects(rename(), /original PayPal environment/);
  process.env.PAYPAL_ENVIRONMENT = "sandbox";
  assert.equal(calls.length, beforeUnauthorizedRename);
  plans.get(legacyYear.providerId).status = "INACTIVE";
  await assert.rejects(rename(), /INACTIVE/);
  plans.get(legacyYear.providerId).status = "ACTIVE";
  assert.equal(calls.filter(call => call.method === "PATCH").length, 0);
  assert.equal((await db.find(catalogVersions, { id: version.id }))[0].monthRequest.nameCorrection, undefined);
  const [unrelatedPlan] = await db.find(catalogPlans, { slug: "starter_ai" });
  await db.update(catalogVersions, { id: alias.id }, { planId: unrelatedPlan.id });
  await assert.rejects(rename(), /another local plan/);
  await db.update(catalogVersions, { id: alias.id }, { planId: version.planId });
  assert.equal(calls.filter(call => call.method === "PATCH").length, 0);
  assert.equal((await db.find(catalogVersions, { id: version.id }))[0].monthRequest.nameCorrection, undefined);
  const remoteTermsBefore = [legacyMonth.providerId, legacyYear.providerId].map(id => {
    const copy = structuredClone(plans.get(id)); delete copy.name; return copy;
  });
  rejectRenameId = legacyYear.providerId;
  await assert.rejects(rename(), error => error.providerStatus === 400);
  const [partial] = await db.find(catalogVersions, { id: version.id });
  assert.ok(partial.monthRequest.nameCorrection.confirmedAt);
  assert.equal(partial.yearRequest.nameCorrection.confirmedAt, null);
  assert.match(partial.yearRequest.nameCorrection.error, /rename_plan/);
  assert.equal((await getAdminCatalog(actor)).versions.find(row => row.id === version.id).nameUpdatePending, true);
  await assert.rejects(verifyCatalogVersion(actor, version.id), /name update is incomplete/);
  rejectRenameId = null;
  const beforeRenameRetry = calls.filter(call => call.method === "PATCH").length;
  await rename();
  assert.equal(calls.filter(call => call.method === "PATCH").length, beforeRenameRetry + 1, "A partial retry must update only the remaining yearly name.");
  for (const id of [version.id, alias.id]) {
    const [renamed] = await db.find(catalogVersions, { id });
    assert.deepEqual(renamed.definition, legacyVersion.definition);
    assert.equal(renamed.monthRequest.name, undefined, "Original publication names must not be rewritten.");
    assert.equal(renamed.monthRequest.requestId, legacyMonth.requestId);
    assert.equal(renamed.yearRequest.providerId, legacyYear.providerId);
    assert.ok(renamed.monthRequest.nameCorrection.confirmedAt && renamed.yearRequest.nameCorrection.confirmedAt);
    assert.equal((await verifyCatalogVersion(actor, id)).status, "verified", "All local snapshots sharing the renamed IDs must verify.");
  }
  const patchesAfterSuccess = calls.filter(call => call.method === "PATCH").length;
  await rename();
  assert.equal(calls.filter(call => call.method === "PATCH").length, patchesAfterSuccess, "An unchanged name correction must not patch again.");
  plans.get(legacyMonth.providerId).name = version.definition.name;
  plans.get(legacyYear.providerId).name = version.definition.name;
  failRenameId = legacyMonth.providerId;
  await assert.rejects(rename(), /could not be reached/);
  const patchesBeforeUncertainRetry = calls.filter(call => call.method === "PATCH").length;
  await rename();
  assert.equal(calls.filter(call => call.method === "PATCH").length, patchesBeforeUncertainRetry + 1, "A successful but uncertain monthly rename must be reconciled by GET, not repeated.");
  for (const [index, id] of [legacyMonth.providerId, legacyYear.providerId].entries()) {
    const terms = structuredClone(plans.get(id)); delete terms.name;
    assert.deepEqual(terms, remoteTermsBefore[index], "Name updates must not change provider billing terms.");
  }
  assert.equal(requestIds.size, resourceCount, "Renaming must never create replacement provider resources.");
  assert.deepEqual((await db.find(billingSubscriptions))[0], subscriptionBefore);
  assert.equal((await db.find(workspaces, { id: workspace.id }))[0].aiCreditsBalance, 7);
  assert.ok((await db.find(auditLogs)).some(row => row.action === "admin.catalog.plan_names_update_started"));
  assert.ok((await db.find(auditLogs)).some(row => row.action === "admin.catalog.plan_name_year_confirmed"));
  const detailsInput = { name: "Starter BYOK Plus", description: "Create and schedule content for your brand with your own OpenAI key." };
  const multilineDescription = detailsInput.description.replace(" with ", "\r\nwith ");
  const updateDetails = async (overrides = {}) => {
    const [plan] = await db.find(catalogPlans, { id: version.planId });
    return manageCatalog(actor, { action: "update_plan_details", versionId: version.id, revision: plan.revision, ...detailsInput, confirm: true, ...overrides });
  };
  const beforeDetailsValidation = calls.length;
  await assert.rejects(manageCatalog(null, { action: "update_plan_details", versionId: version.id, revision: 1, ...detailsInput, confirm: true }), error => error.status === 403);
  await assert.rejects(updateDetails({ revision: 9999 }), /Plan changed/);
  await assert.rejects(updateDetails({ description: "" }), error => error.status === 400);
  await assert.rejects(updateDetails({ description: "x".repeat(128) }), error => error.status === 400);
  await assert.rejects(manageCatalog(actor, { action: "create_plan", productId: version.productId,
    definition: { ...version.definition, slug: "missing_description", description: undefined } }), error => error.status === 400);
  assert.equal(calls.length, beforeDetailsValidation);
  const originalDraft = (await db.find(catalogPlans, { id: version.planId }))[0];
  for (const id of [legacyMonth.providerId, legacyYear.providerId]) delete plans.get(id).description;
  rejectRenameId = legacyYear.providerId;
  failRenameId = legacyMonth.providerId;
  await assert.rejects(updateDetails({ description: multilineDescription }), /could not be reached/);
  await assert.rejects(updateDetails({ description: multilineDescription }), error => error.providerStatus === 400);
  assert.equal(calls.filter(call => call.path.endsWith(legacyMonth.providerId) && call.method === "PATCH" && call.body[1]?.path === "/description").length, 1,
    "An uncertain successful add must be read back and never repeated.");
  assert.equal(plans.get(legacyMonth.providerId).name, "POSTIF-AI Starter BYOK Plus \u2014 Monthly");
  assert.equal(plans.get(legacyMonth.providerId).description, detailsInput.description);
  assert.deepEqual((await db.find(catalogPlans, { id: version.planId }))[0].draft, originalDraft.draft, "Partial provider updates must not claim local success.");
  assert.equal((await getAdminCatalog(actor)).versions.find(row => row.id === version.id).pendingDetails.name, detailsInput.name);
  await assert.rejects(manageCatalog(actor, { action: "edit_plan", id: originalDraft.id, revision: originalDraft.revision, definition: originalDraft.draft }), /pending/);
  await assert.rejects(publish(actor, "starter_byok"), /incomplete plan details/);
  await assert.rejects(updateDetails({ name: "Different target" }), /original incomplete/);
  rejectRenameId = null;
  const beforeDetailsRetry = calls.filter(call => call.method === "PATCH").length;
  await updateDetails();
  assert.equal(calls.filter(call => call.method === "PATCH").length, beforeDetailsRetry + 1);
  const descriptionPatches = calls.filter(call => call.method === "PATCH" && call.body[1]?.path === "/description");
  assert.equal(descriptionPatches.length, 3);
  assert.ok(descriptionPatches.every(call => call.body[1].op === "add"), "Both old PayPal plans lack descriptions and require add, including a rejected yearly retry.");
  const [updatedPlan] = await db.find(catalogPlans, { id: version.planId });
  assert.equal(updatedPlan.draft.name, detailsInput.name);
  assert.equal(updatedPlan.draft.description, detailsInput.description);
  assert.equal(updatedPlan.detailsUpdatingVersionId, null);
  assert.equal(updatedPlan.revision, originalDraft.revision + 1);
  const updatedAdmin = (await getAdminCatalog(actor)).versions.find(row => row.id === version.id);
  assert.equal(updatedAdmin.definition.name, detailsInput.name);
  assert.equal(updatedAdmin.paypalYearDescription, detailsInput.description);
  assert.equal(updatedAdmin.nameUpdatePending, false);
  const refreshedSources = await readCatalogVersionSources(actor, version.id);
  assert.equal(refreshedSources.mongo.draft.name, detailsInput.name, "Each source read must query current MongoDB data, not a previous response.");
  assert.equal(refreshedSources.paypal.month.data.name, "POSTIF-AI Starter BYOK Plus \u2014 Monthly");
  assert.equal(updatedAdmin.draftRevision, updatedPlan.revision, "Metadata-only edits must not cause a replacement financial publication.");
  assert.equal((await getCatalogPlans()).find(plan => plan.slug === "starter_byok").name, detailsInput.name);
  assert.equal((await getPurchasablePlan("starter_byok", "month")).definition.description, detailsInput.description);
  assert.deepEqual((await db.find(catalogVersions, { id: version.id }))[0].definition, legacyVersion.definition, "Original publication snapshots remain intact.");
  const beforeDetailsNoop = calls.filter(call => call.method === "PATCH").length;
  await updateDetails();
  await publish(actor, "starter_byok");
  assert.equal(calls.filter(call => call.method === "PATCH").length, beforeDetailsNoop);
  assert.equal(requestIds.size, resourceCount, "Metadata edits followed by verification must not create new provider resources.");
  for (const id of [legacyMonth.providerId, legacyYear.providerId]) plans.get(id).description = "Description before the rejected multiline update.";
  for (const id of [version.id, alias.id]) {
    const [row] = await db.find(catalogVersions, { id });
    const requests = {};
    for (const field of ["monthRequest", "yearRequest"]) {
      requests[field] = { ...row[field], nameCorrection: { ...row[field].nameCorrection, description: multilineDescription,
        previousDescription: "Description before the rejected multiline update.", confirmedAt: null, error: "PayPal rejected rename_plan (HTTP 400). INVALID_STRING_PATTERN." } };
    }
    await db.update(catalogVersions, { id }, { ...requests,
      ...(id === version.id ? { detailsUpdate: { ...row.detailsUpdate, description: multilineDescription, confirmedAt: null } } : {}) });
  }
  await db.update(catalogPlans, { id: version.planId }, { detailsUpdatingVersionId: version.id });
  const beforeLegacyDetailsRetry = calls.filter(call => call.method === "PATCH").length;
  await assert.rejects(updateDetails({ description: "Different words.\nNot the original request." }), /original incomplete/);
  await updateDetails({ description: multilineDescription });
  assert.equal(calls.filter(call => call.method === "PATCH").length, beforeLegacyDetailsRetry + 2, "Retry must repair both existing provider plans using the normalized pending description.");
  await updateDetails({ description: multilineDescription });
  assert.equal(calls.filter(call => call.method === "PATCH").length, beforeLegacyDetailsRetry + 2, "Already-correct provider data must be reconciled, not patched again.");
  const [repairedDetails] = await db.find(catalogVersions, { id: version.id });
  assert.equal(repairedDetails.detailsUpdate.originalDescription, multilineDescription, "Retain the original failed multiline description.");
  assert.equal(repairedDetails.detailsUpdate.description, detailsInput.description);
  assert.ok(repairedDetails.detailsUpdate.confirmedAt);
  assert.equal((await db.find(catalogPlans, { id: version.planId }))[0].detailsUpdatingVersionId, null);
  for (const id of [version.id, alias.id]) assert.equal((await verifyCatalogVersion(actor, id)).status, "verified");
  const revisedDescription = "An updated description without changing the existing subscription prices.";
  ignoreDetailsPatchId = legacyMonth.providerId;
  await assert.rejects(updateDetails({ description: revisedDescription }), /not confirmed the requested description/);
  assert.equal(calls.filter(call => call.method === "PATCH").at(-1).body[1].op, "replace", "A later edit must replace the now-existing description.");
  assert.equal((await db.find(catalogPlans, { id: version.planId }))[0].draft.description, detailsInput.description, "HTTP 204 without the requested provider change must not report local success.");
  assert.equal((await getAdminCatalog(actor)).versions.find(row => row.id === version.id).nameUpdatePending, true);
  ignoreDetailsPatchId = null;
  failRenameId = legacyMonth.providerId;
  await assert.rejects(updateDetails({ description: revisedDescription }), /could not be reached/);
  const beforeDescriptionRetry = calls.filter(call => call.method === "PATCH").length;
  await updateDetails({ description: revisedDescription });
  assert.equal(calls.filter(call => call.method === "PATCH").length, beforeDescriptionRetry + 1, "Uncertain successful description writes must be reconciled, not repeated.");
  assert.equal((await getPurchasablePlan("starter_byok", "year")).definition.description, revisedDescription);
  for (const id of [version.id, alias.id]) assert.equal((await verifyCatalogVersion(actor, id)).status, "verified");
  assert.deepEqual((await db.find(billingSubscriptions))[0], subscriptionBefore);
  assert.equal((await db.find(workspaces, { id: workspace.id }))[0].aiCreditsBalance, 7);
  const [previousPlan] = await db.find(catalogPlans, { slug: "starter_byok" });
  const beforeRevision = calls.length;
  await manageCatalog(actor, { action: "edit_plan", id: previousPlan.id, revision: previousPlan.revision,
    definition: { ...previousPlan.draft, monthlyPrice: 12, annualMonthlyPrice: 10, maxPostsPerMonth: 45 } });
  assert.equal(calls.length, beforeRevision, "Saving a draft must not publish it.");
  await updateDetails({ name: "Starter BYOK Growth", description: revisedDescription });
  const [unpublishedFinancialDraft] = await db.find(catalogPlans, { id: version.planId });
  assert.equal(unpublishedFinancialDraft.draft.monthlyPrice, 12, "A details edit must preserve separate unpublished financial changes.");
  assert.equal((await getPurchasablePlan("starter_byok", "month")).definition.monthlyPrice, 9, "Metadata edits must not publish pending prices.");
  assert.notEqual((await getAdminCatalog(actor)).versions.find(row => row.id === version.id).draftRevision, unpublishedFinancialDraft.revision);
  assert.equal(requestIds.size, resourceCount);
  const revision = await publish(actor, "starter_byok");
  assert.notEqual(revision.id, version.id);
  const newMapping = await getPurchasablePlan("starter_byok", "month");
  assert.equal(newMapping.versionId, revision.id);
  assert.notEqual(newMapping.paypalPlanId, mapping.paypalPlanId);
  assert.equal(newMapping.definition.monthlyPrice, 12);
  assert.equal(newMapping.definition.maxPostsPerMonth, 45);
  await updateDetails({ name: "Archived Starter Name", description: "Historical plan description." });
  assert.equal((await getPurchasablePlan("starter_byok", "month")).definition.name, newMapping.definition.name, "Historical-only updates must not overwrite the current plan.");
  assert.equal((await db.find(catalogPlans, { id: version.planId }))[0].draft.name, newMapping.definition.name);
  assert.equal((await db.find(catalogVersions, { id: version.id }))[0].definition.monthlyPrice, 9);
  assert.equal((await db.find(catalogVersions, { id: version.id }))[0].draftRevision, legacyVersion.draftRevision, "Original draft-revision provenance must remain intact.");
  products.delete(newMapping.paypalProductId);
  await assert.rejects(publish(actor, "starter_byok"), error => error.providerStatus === 404);
  assert.equal(requestIds.size, resourceCount + 2, "Revisions reuse the product; missing historical mappings must not be silently replaced.");
  await assert.rejects(verifyCatalogVersion(actor, revision.id), error => error.providerStatus === 404);
  products.set(newMapping.paypalProductId, { id: newMapping.paypalProductId, ...revision.product });
  assert.deepEqual((await db.find(billingSubscriptions))[0], subscriptionBefore);
  assert.equal((await db.find(workspaces, { id: workspace.id }))[0].aiCreditsBalance, 7);

  failMonth = true;
  await assert.rejects(publish(actor, "starter_ai"), /could not be reached/);
  const [second] = await db.find(catalogVersions, { status: "pending" });
  const beforePendingRename = calls.length;
  await assert.rejects(manageCatalog(actor, { action: "rename_paypal_plans", versionId: second.id, confirm: true }), /Only published paid/);
  assert.equal(calls.length, beforePendingRename);
  await manageCatalog(actor, { action: "create_product", slug: "existing-postif", name: "Local existing product", description: "Local description" });
  const [existingProduct] = await db.find(catalogProducts, { slug: "existing-postif" });
  await manageCatalog(actor, { action: "create_plan", productId: existingProduct.id, definition: { ...version.definition, slug: "linked_byok", name: "Linked BYOK" } });
  const [linkedPlan] = await db.find(catalogPlans, { slug: "linked_byok" });
  products.set("POSTIF-AI", { id: "POSTIF-AI", name: "POSTIF-AI", description: "Existing provider description" });
  const externalMonth = { ...structuredClone(plans.get(mapping.paypalPlanId)), id: "P-EXISTING-MONTH",
    name: "POSTIF-AI Starter BYOK - Monthly", product_id: "POSTIF-AI" };
  externalMonth.payment_preferences.auto_bill_outstanding = true;
  externalMonth.payment_preferences.payment_failure_threshold = 3;
  plans.set(externalMonth.id, externalMonth);
  const setup = { productId: "POSTIF-AI", monthPlanId: externalMonth.id };
  const writesBeforeValidation = requestIds.size;
  for (const [changes, reason] of [
    [{ product_id: "UNRELATED-PRODUCT" }, /wrong PayPal product/],
    [{ status: "INACTIVE" }, /ACTIVE status required/],
  ]) {
    plans.set(externalMonth.id, { ...externalMonth, ...changes });
    await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision, setup }), reason);
  }
  plans.set(externalMonth.id, externalMonth);
  externalMonth.billing_cycles[0].pricing_scheme.fixed_price.currency_code = "EUR";
  await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision, setup }), /price must be USD/);
  externalMonth.billing_cycles[0].pricing_scheme.fixed_price.currency_code = "USD";
  await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision,
    setup: { ...setup, yearPlanId: externalMonth.id } }), /different PayPal plan IDs/);
  externalMonth.billing_cycles[0].pricing_scheme.fixed_price.value = "1.00";
  await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision, setup }), /price must be USD 9.00/);
  externalMonth.billing_cycles[0].pricing_scheme.fixed_price.value = "9.00";
  externalMonth.payment_preferences.payment_failure_threshold = -1;
  await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision, setup }), /payment failure threshold/);
  externalMonth.payment_preferences.payment_failure_threshold = 3;
  await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision,
    setup: { productId: "POSTIF-AI", yearPlanId: externalMonth.id } }), /billing interval/);
  assert.equal(requestIds.size, writesBeforeValidation, "Incompatible existing terms must fail before provider writes.");
  assert.equal((await db.find(catalogVersions, { planId: linkedPlan.id })).length, 0);

  failMonth = true;
  await assert.rejects(publish(actor, "linked_byok"), /could not be reached/);
  const [incomplete] = await db.find(catalogVersions, { planId: linkedPlan.id, status: "pending" });
  const beforeReplacement = requestIds.size;
  await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision, setup }), /Explicitly confirm replacement/);
  await manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision,
    setup: { ...setup, replacePendingVersionId: incomplete.id } });
  const imported = await getPurchasablePlan("linked_byok", "month");
  assert.equal(imported.paypalProductId, "POSTIF-AI");
  assert.equal(imported.paypalPlanId, externalMonth.id);
  assert.deepEqual(imported.paymentPolicy, { autoBillOutstanding: true, paymentFailureThreshold: 3 });
  assert.equal(requestIds.size, beforeReplacement + 1, "Only the missing annual plan may be created.");
  assert.equal((await db.find(catalogVersions, { id: incomplete.id }))[0].status, "superseded");
  assert.ok(products.has(incomplete.productRequest.providerId), "Previous incomplete provider resources must be retained.");
  assert.equal((await verifyCatalogVersion(actor, imported.versionId)).status, "verified", "Explicitly selected provider names must survive verification.");
  const importedYear = await getPurchasablePlan("linked_byok", "year");
  assert.deepEqual(importedYear.paymentPolicy, imported.paymentPolicy);
  assert.equal(plans.get(importedYear.paypalPlanId).payment_preferences.auto_bill_outstanding, true);
  assert.equal(plans.get(importedYear.paypalPlanId).payment_preferences.payment_failure_threshold, 3);
  externalMonth.payment_preferences.payment_failure_threshold = 5;
  await assert.rejects(verifyCatalogVersion(actor, imported.versionId), /payment policy changed/);
  externalMonth.payment_preferences.payment_failure_threshold = 3;
  const beforeReadOnlyLink = requestIds.size;
  await manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision, setup });
  assert.equal((await getPurchasablePlan("linked_byok", "month")).versionId, imported.versionId, "A repeated completed setup must verify its existing mapping instead of recreating the annual plan.");
  await manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision,
    setup: { ...setup, yearPlanId: importedYear.paypalPlanId } });
  assert.equal(requestIds.size, beforeReadOnlyLink, "Linking a complete existing setup must not create resources.");
  const externalYear = { ...structuredClone(plans.get(importedYear.paypalPlanId)), id: "P-EXISTING-YEAR",
    payment_preferences: { ...plans.get(importedYear.paypalPlanId).payment_preferences, auto_bill_outstanding: false, payment_failure_threshold: 0 } };
  plans.set(externalYear.id, externalYear);
  const beforeBothPolicies = calls.length;
  await manageCatalog(actor, { action: "use_paypal_setup", id: linkedPlan.id, revision: linkedPlan.revision,
    setup: { ...setup, yearPlanId: externalYear.id } });
  assert.ok(calls.slice(beforeBothPolicies).every(call => call.method === "GET" || call.path === "/v1/oauth2/token"), "Linking existing intervals with different valid policies must perform no provider catalog writes.");
  assert.deepEqual((await getPurchasablePlan("linked_byok", "month")).paymentPolicy, { autoBillOutstanding: true, paymentFailureThreshold: 3 });
  assert.deepEqual((await getPurchasablePlan("linked_byok", "year")).paymentPolicy, { autoBillOutstanding: false, paymentFailureThreshold: 0 });
  await manageCatalog(actor, { action: "edit_plan", id: linkedPlan.id, revision: linkedPlan.revision,
    definition: { ...linkedPlan.draft, monthlyPrice: 10 } });
  await publish(actor, "linked_byok");
  const revisedMonth = await getPurchasablePlan("linked_byok", "month"), revisedYear = await getPurchasablePlan("linked_byok", "year");
  assert.equal(revisedMonth.definition.monthlyPrice, 10);
  assert.deepEqual(revisedMonth.paymentPolicy, { autoBillOutstanding: true, paymentFailureThreshold: 3 });
  assert.deepEqual(revisedYear.paymentPolicy, { autoBillOutstanding: false, paymentFailureThreshold: 0 });
  assert.equal(plans.get(revisedYear.paypalPlanId).payment_preferences.payment_failure_threshold, 0);
  assert.equal(plans.get(externalMonth.id).billing_cycles[0].pricing_scheme.fixed_price.value, "9.00", "A revision must not modify the original PayPal plan.");
  await manageCatalog(actor, { action: "create_plan", productId: existingProduct.id, definition: { ...version.definition, slug: "another_byok", name: "Another BYOK" } });
  const [another] = await db.find(catalogPlans, { slug: "another_byok" });
  await assert.rejects(manageCatalog(actor, { action: "use_paypal_setup", id: another.id, revision: another.revision, setup }), /already mapped/);
  const beforeSibling = requestIds.size;
  await publish(actor, "another_byok");
  assert.equal((await getPurchasablePlan("another_byok", "month")).paypalProductId, "POSTIF-AI");
  assert.equal(requestIds.size, beforeSibling + 2, "A sibling plan must reuse the product and create only its own billing intervals.");
  assert.equal((await db.find(catalogPlans, { id: linkedPlan.id }))[0].publishingVersionId, null);
  assert.deepEqual((await db.find(billingSubscriptions))[0], subscriptionBefore);
  assert.equal((await db.find(workspaces, { id: workspace.id }))[0].aiCreditsBalance, 7);
  const originalClient = process.env.PAYPAL_CLIENT_ID;
  process.env.PAYPAL_CLIENT_ID = "different-isolated-client";
  const beforeAccountSwitch = calls.length;
  await assert.rejects(verifyCatalogVersion(actor, imported.versionId), /originally approved/);
  await assert.rejects(publish(actor, "another_byok"), /originally approved/);
  const sibling = (await db.find(catalogPlans, { id: another.id }))[0];
  await manageCatalog(actor, { action: "edit_plan", id: sibling.id, revision: sibling.revision,
    definition: { ...sibling.draft, maxPostsPerMonth: sibling.draft.maxPostsPerMonth + 1 } });
  await assert.rejects(publish(actor, "another_byok"), /different PayPal app/);
  await assert.rejects(publish(actor, "starter_ai"), /originally approved/);
  assert.equal(calls.length, beforeAccountSwitch);
  process.env.PAYPAL_CLIENT_ID = originalClient;
  process.env.PAYPAL_ENVIRONMENT = "live";
  await assert.rejects(publish(actor, "starter_ai"), /original environment/);
  assert.equal(calls.length, beforeAccountSwitch);
  process.env.PAYPAL_ENVIRONMENT = "sandbox";
  await db.update(users, { id: user.id }, { systemRole: "user" });
  const [demoted] = await db.find(users, { id: user.id });
  await assert.rejects(publish({ user: demoted }, "starter_ai"), error => error.status === 403);
  assert.equal(calls.length, beforeAccountSwitch);
  assert.equal((await db.find(catalogVersions, { id: second.id }))[0].status, "pending");
  assert.doesNotMatch(JSON.stringify(await getAdminCatalog(actor)), /isolated-catalog-secret|isolated-provider-token/);
  console.log("Isolated catalog publication passed: exact-ID linking, missing-interval-only creation, product reuse, incompatible-term rejection, explicit pending replacement, selected-plan-only publication, protected administrator actions, manual retries, concurrent claims, app/environment isolation and unchanged subscriber terms. No real provider or production database calls.");
} finally {
  globalThis.fetch = originalFetch;
  try { await closeDatabase(); } finally { await replica.stop(); }
}
