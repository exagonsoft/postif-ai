import { db } from "@/db";
import { users, workspaces, workspaceMembers, brands, socialAccounts, publishingJobs, aiUsageRecords, sessions, auditLogs, featureFlags } from "@/db/schema";
import { billingSubscriptions, billingPayments } from "@/db/billing-schema";
import { workerStates } from "@/db/worker-schema";
import { getPayPalEnvironment } from "./paypal";
import { WorkflowError } from "./post-policy";
import type { getAuthContext } from "./auth";
import type { Document } from "mongodb";
import type { CollectionModel } from "@/db/model";

export type PlatformActor = Awaited<ReturnType<typeof getAuthContext>>;
export type DirectoryKind = "customers" | "workspaces" | "subscriptions" | "operations" | "audit" | "admins";
export interface AdminQuery { q: string; status: string; page: number }
export interface AdminRow { id: number; cells: Record<string, string>; href?: string }
export interface AdminDirectory {
  columns: Array<{ key: string; label: string }>; rows: AdminRow[];
  total: number; pages: number; query: AdminQuery;
}
export function requirePlatformAdmin(actor: PlatformActor) {
  if (!actor?.user || actor.user.systemRole !== "operator") throw new WorkflowError("Platform administrator authorization required.", 403);
  return actor.user;
}
export function parseAdminQuery(input: Record<string, string | string[] | undefined>): AdminQuery {
  if (Object.values(input).some(value => Array.isArray(value))) throw new WorkflowError("Use a single value per search parameter.");
  const q = String(input.q || "").trim(), status = String(input.status || "").trim(), page = Number(input.page || 1);
  if (q.length > 120 || (status && !/^[a-zA-Z_]{1,40}$/.test(status)) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw new WorkflowError("Invalid search, status or page. Search is limited to 120 characters.");
  }
  return { q, status, page };
}
export function parseAdminId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) throw new WorkflowError("Record not found.", 404);
  return id;
}
const options = { limit: 20, maxTimeMS: 5000 };
function search(q: string, fields: string[]): Document {
  if (!q) return {};
  const expression = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const matches: Document[] = fields.map(field => ({ [field]: expression }));
  if (/^\d+$/.test(q) && Number.isSafeInteger(Number(q))) matches.push({ id: Number(q) });
  return { $or: matches };
}
function date(value: Date | null | undefined) { return value ? value.toISOString() : "Not recorded"; }
export async function getWorkerSummary(actor: PlatformActor) {
  requirePlatformAdmin(actor);
  const rows = await db.find(workerStates, {}, {
    ...options, limit: 10, sort: { startedAt: -1, id: -1 },
    projection: { id: 1, phase: 1, status: 1, startedAt: 1, heartbeatAt: 1, completedAt: 1, error: 1 },
  });
  return rows.map(row => ({ id: row.id, phase: row.phase, status: row.status, startedAt: date(row.startedAt),
    heartbeatAt: date(row.heartbeatAt), completedAt: date(row.completedAt), errorRecorded: !!row.error }));
}
export async function getPlatformOverview(actor: PlatformActor) {
  requirePlatformAdmin(actor);
  const now = new Date(), environment = getPayPalEnvironment();
  const paid = { environment, status: "ACTIVE", paidThrough: { $gt: now }, planSnapshot: { $ne: null }, paypalSubscriptionId: { $type: "string" } };
  const [customers, administrators, tenants, channels, queued, failed, aiRecords, paidSubscriptions, revenue, workers] = await Promise.all([
    db.count(users, { systemRole: { $ne: "operator" } }), db.count(users, { systemRole: "operator" }),
    db.count(workspaces), db.count(socialAccounts, { status: "connected", integrationMode: { $in: ["customer_credentials", "managed_oauth"] } }),
    db.count(publishingJobs, { status: "queued" }), db.count(publishingJobs, { status: "failed" }),
    db.count(aiUsageRecords), db.count(billingSubscriptions, paid),
    db.aggregate<{ total: number; invalid: number }>(billingSubscriptions, [
      { $match: paid },
      { $project: { amount: { $cond: [{ $eq: ["$interval", "year"] }, "$planSnapshot.annualMonthlyPrice", "$planSnapshot.monthlyPrice"] } } },
      { $group: { _id: null, total: { $sum: "$amount" }, invalid: { $sum: { $cond: [{ $and: [{ $isNumber: "$amount" }, { $gt: ["$amount", 0] }] }, 0, 1] } } } },
    ]), getWorkerSummary(actor),
  ]);
  if (revenue[0] && (revenue[0].invalid || !Number.isFinite(revenue[0].total))) throw new WorkflowError("Stored billing prices require reconciliation before revenue can be displayed.", 503);
  return { customers, administrators, tenants, channels, queued, failed, aiRecords, paidSubscriptions,
    mrr: Math.round((revenue[0]?.total || 0) * 100) / 100, environment, workers };
}
async function paginate<T extends object>(model: CollectionModel<T>, filter: Document, query: AdminQuery, projection: Document, sort: Document) {
  const total = await db.count(model, filter), pages = Math.max(1, Math.ceil(total / options.limit)), page = Math.min(query.page, pages);
  const rows = await db.find(model, filter, { ...options, skip: (page - 1) * options.limit, projection, sort });
  return { rows, total, pages, query: { ...query, page } };
}
function columns(entries: Record<string, string>) { return Object.entries(entries).map(([key, label]) => ({ key, label })); }
export async function getAdminDirectory(actor: PlatformActor, kind: DirectoryKind, query: AdminQuery): Promise<AdminDirectory> {
  requirePlatformAdmin(actor);
  if (kind === "customers" || kind === "admins") {
    const page = await paginate(users, { systemRole: kind === "admins" ? "operator" : { $ne: "operator" }, ...search(query.q, ["name", "email"]) }, query,
      { id: 1, name: 1, email: 1, emailVerified: 1, createdAt: 1 }, { createdAt: -1, id: -1 });
    return { ...page, columns: columns({ name: "Name", email: "Email", verified: "Email verified", createdAt: "Created (UTC)" }),
      rows: page.rows.map(row => ({ id: row.id, href: `/app/admin/${kind}/${row.id}`, cells: {
        name: row.name, email: row.email, verified: row.emailVerified ? "Yes" : "No", createdAt: date(row.createdAt),
      } })) };
  }
  if (kind === "workspaces") {
    const page = await paginate(workspaces, search(query.q, ["name", "slug"]), query, { id: 1, name: 1, slug: 1, ownerId: 1, createdAt: 1 }, { createdAt: -1, id: -1 });
    const subscriptions = page.rows.length ? await db.find(billingSubscriptions, {
      workspaceId: { $in: page.rows.map(row => row.id) }, environment: getPayPalEnvironment(),
    }, { ...options, projection: { workspaceId: 1, paidThrough: 1, planSnapshot: 1 } }) : [];
    return { ...page, columns: columns({ name: "Workspace", slug: "Slug", owner: "Owner ID", access: "Paid access", createdAt: "Created (UTC)" }),
      rows: page.rows.map(row => {
        const paid = subscriptions.find(subscription => subscription.workspaceId === row.id && subscription.paidThrough && subscription.paidThrough > new Date() && subscription.planSnapshot);
        return { id: row.id, href: `/app/admin/workspaces/${row.id}`, cells: { name: row.name, slug: row.slug, owner: String(row.ownerId),
          access: paid?.planSnapshot ? `Verified: ${paid.planSnapshot.name}` : "No current paid evidence", createdAt: date(row.createdAt) } };
      }) };
  }
  if (kind === "subscriptions") {
    const page = await paginate(billingSubscriptions, {
      environment: getPayPalEnvironment(), ...(query.status ? { status: query.status === "inactive" ? "inactive" : query.status.toUpperCase() } : {}),
      ...search(query.q, ["paypalSubscriptionId", "planSnapshot.name", "planSlug"]),
    }, query, { id: 1, workspaceId: 1, paypalSubscriptionId: 1, status: 1, planSnapshot: 1, paidThrough: 1, interval: 1 }, { updatedAt: -1, id: -1 });
    return { ...page, columns: columns({ workspace: "Workspace ID", provider: "PayPal subscription", status: "Provider status", plan: "Paid snapshot", interval: "Interval", paidThrough: "Paid through (UTC)" }),
      rows: page.rows.map(row => ({ id: row.id, href: `/app/admin/subscriptions/${row.id}`, cells: { workspace: String(row.workspaceId),
        provider: row.paypalSubscriptionId || "Not linked", status: row.status, plan: row.planSnapshot?.name || "No paid snapshot", interval: row.interval, paidThrough: date(row.paidThrough) } })) };
  }
  if (kind === "operations") {
    const page = await paginate(publishingJobs, { ...(query.status ? { status: query.status.toLowerCase() } : {}), ...search(query.q, ["platform", "status"]) },
      query, { id: 1, workspaceId: 1, platform: 1, status: 1, attempts: 1, scheduledFor: 1, executedAt: 1, errorMessage: 1 }, { createdAt: -1, id: -1 });
    return { ...page, columns: columns({ workspace: "Workspace ID", platform: "Platform", status: "Status", attempts: "Attempts", scheduled: "Scheduled (UTC)", error: "Error" }),
      rows: page.rows.map(row => ({ id: row.id, href: `/app/admin/workspaces/${row.workspaceId}`, cells: { workspace: String(row.workspaceId),
        platform: row.platform, status: row.status, attempts: String(row.attempts), scheduled: date(row.scheduledFor), error: row.errorMessage ? "Recorded; inspect protected server diagnostics" : "None recorded" } })) };
  }
  const page = await paginate(auditLogs, search(query.q, ["actorEmail", "action", "resourceType", "resourceId"]), query,
    { id: 1, actorEmail: 1, action: 1, resourceType: 1, resourceId: 1, createdAt: 1 }, { createdAt: -1, id: -1 });
  return { ...page, columns: columns({ actor: "Actor", action: "Action", resource: "Resource", createdAt: "Timestamp (UTC)" }),
    rows: page.rows.map(row => ({ id: row.id, cells: { actor: row.actorEmail, action: row.action, resource: `${row.resourceType} #${row.resourceId}`, createdAt: date(row.createdAt) } })) };
}
export async function getFlagRegistry(actor: PlatformActor) {
  requirePlatformAdmin(actor);
  const rows = await db.find(featureFlags, {}, { limit: 100, maxTimeMS: 5000, sort: { id: 1 }, projection: { id: 1, key: 1, name: 1, description: 1, enabled: 1 } });
  return rows.map(({ id, key, name, description, enabled }) => ({ id, key, name, description, enabled }));
}
export async function updatePlatformFlag(actor: PlatformActor, input: { flagId: unknown; enabled: unknown; expectedEnabled: unknown }) {
  const user = requirePlatformAdmin(actor);
  if (typeof input.flagId !== "number" || !Number.isSafeInteger(input.flagId) || input.flagId < 1 ||
    typeof input.enabled !== "boolean" || typeof input.expectedEnabled !== "boolean") throw new WorkflowError("Invalid flag identifier or boolean state.");
  const { flagId, enabled, expectedEnabled } = input;
  return db.transaction(async tx => {
    const [current] = await tx.find(featureFlags, { id: flagId }, { lock: true });
    if (!current) throw new WorkflowError("Flag not found.", 404);
    if (current.enabled !== expectedEnabled) throw new WorkflowError("Another administrator changed this flag. Refresh before retrying.", 409);
    const [updated] = await tx.update(featureFlags, { id: flagId }, { enabled, updatedAt: new Date() });
    await tx.insert(auditLogs, { workspaceId: null, actorEmail: user.email, action: "admin.feature_flag_toggled",
      resourceType: "feature_flag", resourceId: current.key, metadata: { actorUserId: user.id, enabled } });
    return { id: updated.id, key: updated.key, enabled: updated.enabled };
  });
}
export async function getAdminDetail(actor: PlatformActor, kind: DirectoryKind, id: number) {
  requirePlatformAdmin(actor);
  if (kind === "customers" || kind === "admins") {
    const [user] = await db.find(users, { id, systemRole: kind === "admins" ? "operator" : { $ne: "operator" } },
      { ...options, limit: 1, projection: { id: 1, name: 1, email: 1, systemRole: 1, emailVerified: 1, createdAt: 1 } });
    if (!user) throw new WorkflowError("Account not found.", 404);
    const memberships = await db.find(workspaceMembers, { userId: id, status: "active" }, { ...options, limit: 50, projection: { workspaceId: 1 } });
    const tenantRows = await db.find(workspaces, { $or: [{ ownerId: id }, { id: { $in: memberships.map(row => row.workspaceId) } }] }, { ...options, limit: 50, projection: { id: 1, name: 1 } });
    return { title: user.name, facts: { Email: user.email, Role: user.systemRole === "operator" ? "Platform administrator" : "Customer",
      "Email verified": user.emailVerified ? "Yes" : "No", "Created (UTC)": date(user.createdAt),
      "Active sessions": String(await db.count(sessions, { userId: id, expiresAt: { $gt: new Date() } })) },
      links: tenantRows.map(row => ({ href: `/app/admin/workspaces/${row.id}`, label: row.name })),
      note: "Workspace associations (up to 50). Account and session credentials are never exposed." };
  }
  if (kind === "workspaces") {
    const [workspace] = await db.find(workspaces, { id }, { ...options, limit: 1, projection: { id: 1, name: 1, slug: 1, ownerId: 1, createdAt: 1, aiCreditsBalance: 1, aiBillingMode: 1 } });
    if (!workspace) throw new WorkflowError("Workspace not found.", 404);
    const [brandCount, channels, jobs, [subscription], [owner]] = await Promise.all([
      db.count(brands, { workspaceId: id }), db.count(socialAccounts, { workspaceId: id, status: "connected" }), db.count(publishingJobs, { workspaceId: id }),
      db.find(billingSubscriptions, { workspaceId: id, environment: getPayPalEnvironment() }, { ...options, limit: 1, projection: { id: 1, paidThrough: 1, planSnapshot: 1 } }),
      db.find(users, { id: workspace.ownerId }, { ...options, limit: 1, projection: { name: 1, systemRole: 1 } }),
    ]);
    const paid = subscription?.paidThrough && subscription.paidThrough > new Date() && subscription.planSnapshot;
    return { title: workspace.name, facts: { Slug: workspace.slug, Owner: owner?.name || `User #${workspace.ownerId}`, Brands: String(brandCount),
      "Connected channels": String(channels), "Publishing jobs": String(jobs), "AI mode": workspace.aiBillingMode,
      "Stored credit balance": String(workspace.aiCreditsBalance), "Current paid access": paid ? paid.name : "No current paid evidence",
      "Created (UTC)": date(workspace.createdAt) },
      links: [{ href: `/app/admin/${owner?.systemRole === "operator" ? "admins" : "customers"}/${workspace.ownerId}`, label: "Owner profile" },
        ...(subscription ? [{ href: `/app/admin/subscriptions/${subscription.id}`, label: "Subscription and payments" }] : [])],
      note: "Read-only workspace inspection. No customer session, impersonation or credit adjustment is provided." };
  }
  if (kind === "subscriptions") {
    const [subscription] = await db.find(billingSubscriptions, { id, environment: getPayPalEnvironment() }, { ...options, limit: 1,
      projection: { id: 1, workspaceId: 1, paypalSubscriptionId: 1, status: 1, interval: 1, paidThrough: 1, planSnapshot: 1, cancelAtPeriodEnd: 1 } });
    if (!subscription) throw new WorkflowError("Subscription not found in the current PayPal environment.", 404);
    const payments = await db.find(billingPayments, { workspaceId: subscription.workspaceId, environment: getPayPalEnvironment(),
      paypalSubscriptionId: subscription.paypalSubscriptionId }, { ...options, sort: { paymentTime: -1 }, projection: {
        paypalTransactionId: 1, amountPaid: 1, currency: 1, paymentTime: 1, periodEnd: 1, invalidatedAt: 1,
      } });
    return { title: subscription.paypalSubscriptionId || `Subscription record #${id}`, facts: { Environment: getPayPalEnvironment(),
      "Provider status": subscription.status, Interval: subscription.interval, "Paid snapshot": subscription.planSnapshot?.name || "None",
      "Paid through (UTC)": date(subscription.paidThrough), "Renewals stopped": subscription.cancelAtPeriodEnd ? "Yes" : "No" },
      links: [{ href: `/app/admin/workspaces/${subscription.workspaceId}`, label: "Workspace" }],
      note: "Persisted, server-verified payment ledger (latest 20). This view does not contact PayPal or confirm live provider connectivity.",
      payments: payments.map(payment => ({ transaction: payment.paypalTransactionId, amount: `${payment.currency} ${(payment.amountPaid / 100).toFixed(2)}`,
        time: date(payment.paymentTime), periodEnd: date(payment.periodEnd), invalidated: !!payment.invalidatedAt })) };
  }
  throw new WorkflowError("Record not found.", 404);
}
