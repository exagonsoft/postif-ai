import "./register-ts.mjs";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
process.env.MONGODB_URI = replica.getUri();
process.env.MONGODB_DB = "postif_operator_test";
const { db, initializeDatabase, closeDatabase, getMongoDatabase } = await import("../src/db/index.ts");
const { users, workspaces, brands, sessions, auditLogs, featureFlags, posts, publishingJobs } = await import("../src/db/schema.ts");
const { createPlatformOperator } = await import("../src/lib/operator-accounts.ts");
const { verifyPassword } = await import("../src/lib/crypto.ts");
const { manageCatalog, getAdminCatalog } = await import("../src/lib/billing-catalog.ts");
const { getPlatformOverview, getAdminDirectory, getAdminDetail, getWorkerSummary, parseAdminQuery, parseAdminId, updatePlatformFlag } = await import("../src/lib/platform-admin.ts");
const { billingSubscriptions, billingPayments } = await import("../src/db/billing-schema.ts");
const { workerStates } = await import("../src/db/worker-schema.ts");
const { getPlanDefinition } = await import("../src/lib/plans.ts");
process.env.PAYPAL_ENVIRONMENT = "sandbox";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected provider request in isolated operator test."); };
try {
  await initializeDatabase();
  await createPlatformOperator({ name: "Isolated Operator", email: "operator@example.test", password: "isolated-password-only" });
  const [user] = await db.find(users, { email: "operator@example.test" });
  assert.equal(user.systemRole, "operator");
  assert.equal(user.emailVerified, false);
  assert.ok(verifyPassword("isolated-password-only", user.passwordHash));
  await manageCatalog({ user }, { action: "initialize_defaults" });
  assert.ok((await getAdminCatalog({ user })).plans.length > 0);
  const logs = await db.find(auditLogs, { actorEmail: user.email });
  assert.ok(logs.length > 0);
  assert.ok(logs.every(log => log.workspaceId === null));
  for (const model of [workspaces, brands, sessions]) assert.equal((await db.find(model)).length, 0);
  await assert.rejects(createPlatformOperator({ name: "Overwrite", email: "operator@example.test", password: "another-isolated-password" }), /already exists/);
  assert.equal((await db.find(users)).length, 1);
  const actor = { user };
  await createPlatformOperator({ name: "Staff", email: "staff@example.test", password: "isolated-staff-password" }, user);
  assert.equal(await db.count(workspaces), 0);
  assert.equal(await db.count(brands), 0);
  const creationAudit = await db.find(auditLogs, { action: "admin.administrator_created" });
  assert.equal(creationAudit.length, 1);
  assert.doesNotMatch(JSON.stringify(creationAudit), /isolated-staff-password|passwordHash/);
  const customers = await db.insert(users, Array.from({ length: 25 }, (_, index) => ({
    name: index === 0 ? "literal.a" : index === 1 ? "literalxa" : `Customer ${index}`,
    email: `customer${index}@example.test`, passwordHash: "password-private-marker",
  })));
  const query = parseAdminQuery({});
  let directory = await getAdminDirectory(actor, "customers", query);
  assert.equal(directory.total, 25);
  assert.equal(directory.rows.length, 20);
  assert.equal(directory.pages, 2);
  assert.doesNotMatch(JSON.stringify(directory), /password-private-marker|passwordHash/);
  directory = await getAdminDirectory(actor, "customers", parseAdminQuery({ q: "literal.a" }));
  assert.equal(directory.rows.length, 1);
  assert.equal(directory.rows[0].cells.name, "literal.a");
  directory = await getAdminDirectory(actor, "customers", parseAdminQuery({ page: "100" }));
  assert.equal(directory.query.page, 2);
  assert.equal(directory.rows.length, 5);
  await assert.rejects(getPlatformOverview({ user: customers[0] }), error => error.status === 403);
  assert.throws(() => parseAdminQuery({ q: ["one", "two"] }), /single value/);
  assert.throws(() => parseAdminQuery({ page: "-1" }), /Invalid/);
  assert.throws(() => parseAdminQuery({ q: "a".repeat(121) }), /120/);
  assert.throws(() => parseAdminId("1/$where"), error => error.status === 404);
  const [workspace] = await db.insert(workspaces, { name: "Verified tenant", slug: "verified", ownerId: customers[0].id, planSlug: "agency" });
  const [other] = await db.insert(workspaces, { name: "Other environment", slug: "other", ownerId: customers[1].id, planSlug: "agency" });
  const [expired] = await db.insert(workspaces, { name: "Expired tenant", slug: "expired", ownerId: customers[2].id, planSlug: "agency" });
  const now = new Date(), end = new Date(now.getTime() + 86400000 * 30), plan = structuredClone(getPlanDefinition("starter_ai"));
  const [subscription] = await db.insert(billingSubscriptions, { workspaceId: workspace.id, environment: "sandbox", status: "ACTIVE",
    paypalSubscriptionId: "I-ISOLATED", paidThrough: end, planSnapshot: plan });
  await db.insert(billingSubscriptions, { workspaceId: other.id, environment: "live", status: "ACTIVE", paypalSubscriptionId: "I-LIVE",
    paidThrough: end, planSnapshot: plan });
  await db.insert(billingSubscriptions, { workspaceId: expired.id, environment: "sandbox", status: "ACTIVE", paypalSubscriptionId: "I-EXPIRED",
    paidThrough: new Date(now.getTime() - 1000), planSnapshot: plan });
  await db.insert(billingPayments, { paymentKey: "sandbox:ISOLATED", paypalTransactionId: "ISOLATED", workspaceId: workspace.id, environment: "sandbox",
    paypalSubscriptionId: "I-ISOLATED", planVersionId: 1, planSlug: plan.slug, planSnapshot: plan, interval: "month", currency: "USD",
    periodStart: now, periodEnd: end, paymentTime: now, amountPaid: plan.monthlyPrice * 100 });
  directory = await getAdminDirectory(actor, "workspaces", query);
  assert.match(directory.rows.find(row => row.id === workspace.id).cells.access, /Verified:/);
  assert.equal(directory.rows.find(row => row.id === other.id).cells.access, "No current paid evidence");
  const [brand] = await db.insert(brands, { workspaceId: workspace.id, name: "Fixture brand" });
  const [post] = await db.insert(posts, { workspaceId: workspace.id, brandId: brand.id, title: "Fixture post", baseContent: "Isolated fixture" });
  await db.insert(publishingJobs, { workspaceId: workspace.id, postId: post.id, platform: "linkedin", status: "failed", scheduledFor: now,
    idempotencyKey: "isolated-job", errorMessage: "provider-private-marker", encryptedProviderState: "provider-private-state" });
  await db.insert(workerStates, { key: "isolated-worker", phase: "publishing", token: "worker-private-token", status: "failed",
    error: "worker-private-error", result: { secret: "worker-private-result" } });
  const overview = await getPlatformOverview(actor);
  assert.equal(overview.customers, 25);
  assert.equal(overview.administrators, 2);
  assert.equal(overview.tenants, 3);
  assert.equal(overview.paidSubscriptions, 1);
  assert.equal(overview.mrr, plan.monthlyPrice);
  assert.equal(overview.failed, 1);
  await db.update(billingSubscriptions, { id: subscription.id }, { interval: "year" });
  assert.equal((await getPlatformOverview(actor)).mrr, plan.annualMonthlyPrice);
  await db.update(billingSubscriptions, { id: subscription.id }, { planSnapshot: { ...plan, annualMonthlyPrice: -1 } });
  await assert.rejects(getPlatformOverview(actor), error => error.status === 503);
  await db.update(billingSubscriptions, { id: subscription.id }, { interval: "month", planSnapshot: plan });
  await db.update(billingSubscriptions, { workspaceId: expired.id, environment: "sandbox" }, { status: "CANCELLED", paidThrough: end });
  assert.equal((await getPlatformOverview(actor)).paidSubscriptions, 1);
  assert.match((await getAdminDirectory(actor, "workspaces", query)).rows.find(row => row.id === expired.id).cells.access, /Verified:/);
  assert.doesNotMatch(JSON.stringify(await getWorkerSummary(actor)), /worker-private/);
  assert.doesNotMatch(JSON.stringify(await getAdminDirectory(actor, "operations", query)), /provider-private/);
  assert.doesNotMatch(JSON.stringify(await getAdminDetail(actor, "customers", customers[0].id)), /password-private|passwordHash/);
  const detail = await getAdminDetail(actor, "subscriptions", subscription.id);
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.payments[0].amount, `USD ${plan.monthlyPrice.toFixed(2)}`);
  const [flag] = await db.insert(featureFlags, { key: "isolated_registry", name: "Registry", description: "No runtime consumer" });
  await updatePlatformFlag(actor, { flagId: flag.id, enabled: false, expectedEnabled: true });
  await assert.rejects(updatePlatformFlag(actor, { flagId: flag.id, enabled: true, expectedEnabled: true }), error => error.status === 409);
  await assert.rejects(updatePlatformFlag(actor, { flagId: flag.id, enabled: "false", expectedEnabled: false }), error => error.status === 400);
  const database = await getMongoDatabase();
  await database.command({ collMod: auditLogs.name, validator: { $jsonSchema: { bsonType: "object", required: ["reject_all_new_audit_rows"] } } });
  try {
    await assert.rejects(updatePlatformFlag(actor, { flagId: flag.id, enabled: true, expectedEnabled: false }), { code: 121 });
    assert.equal((await db.find(featureFlags, { id: flag.id }))[0].enabled, false);
    await assert.rejects(createPlatformOperator({ name: "Rolled back", email: "rollback@example.test", password: "isolated-rollback-password" }, user), { code: 121 });
    assert.equal(await db.count(users, { email: "rollback@example.test" }), 0);
  } finally {
    await database.command({ collMod: auditLogs.name, validator: { $jsonSchema: auditLogs.validator } });
  }
  console.log("Isolated MongoDB platform checks passed: account-only admins, protected queries, bounded pagination/literal search, environment-separated billing, safe DTOs, and atomic audited staff/flag writes. No provider or production database calls.");
} finally {
  globalThis.fetch = originalFetch;
  try { await closeDatabase(); } finally { await replica.stop(); }
}
