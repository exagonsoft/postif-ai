import { db } from "@/db";
import { brands, posts, socialAccounts, publishingJobs, workspaces, type PostsDocument } from "@/db/schema";
import { billingSubscriptions } from "@/db/billing-schema";
import { publishingReservations } from "@/db/entitlement-schema";
import { getPlanDefinition } from "./plans";
import { WorkflowError } from "./post-policy";

type Connection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type PublishingPost = { id: number; workspaceId: number; brandId: number; platforms: string[] };

export function usagePeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export async function getWorkspaceEntitlements(workspaceId: number, connection: Connection = db) {
  const [subscription] = await connection.find(billingSubscriptions, { workspaceId });
  const candidate = getPlanDefinition(subscription?.planSlug || "free");
  const paid = candidate.slug !== "free" && subscription?.paidThrough instanceof Date &&
    subscription.paidThrough.getTime() > Date.now();
  const plan = paid ? candidate : getPlanDefinition("free");
  return {
    plan,
    paid,
    features: {
      campaigns: plan.campaignsEnabled,
      team: plan.teamCollaboration,
      planning: plan.autopilotEnabled,
      advancedAnalytics: plan.advancedAnalytics,
    },
  };
}

export async function assertFeature(workspaceId: number, feature: "campaigns" | "team" | "planning" | "advancedAnalytics", connection: Connection = db) {
  const entitlement = await getWorkspaceEntitlements(workspaceId, connection);
  if (!entitlement.features[feature]) throw new WorkflowError(`Your current plan does not include ${feature}.`, 403);
  return entitlement;
}

export async function assertBrandEntitlement(workspaceId: number, brandId: number, connection: Connection = db) {
  const { plan } = await getWorkspaceEntitlements(workspaceId, connection);
  const allowed = await connection.find(brands, { workspaceId }, { sort: { id: 1 }, limit: plan.maxBrands });
  if (!allowed.some(brand => brand.id === brandId)) {
    throw new WorkflowError("This brand is outside your current plan allowance. Upgrade to use it; its data has been retained.", 403);
  }
}

async function publishingUsage(workspaceId: number, connection: Connection, now = new Date()) {
  const period = usagePeriod(now);
  const from = new Date(`${period}-01T00:00:00.000Z`);
  const until = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const published = await connection.find(posts, { workspaceId, publishedAt: { $gte: from, $lt: until } }, { projection: { id: 1 } });
  const reservations = await connection.find(publishingReservations, {
    workspaceId, status: { $in: ["reserved", "consumed"] },
    $or: [{ period }, { postId: { $in: published.map(post => post.id) } }],
  });
  const accounted = new Set(reservations.map(item => item.postId));
  const used = new Set([
    ...reservations.filter(item => item.period === period).map(item => item.postId),
    ...published.filter(post => !accounted.has(post.id)).map(post => post.id),
  ]);
  return { period, used };
}

export async function getPublishingUsage(workspaceId: number, connection: Connection = db) {
  const { period, used } = await publishingUsage(workspaceId, connection);
  return { period, used: used.size };
}

export async function assertPublishingEntitlement(post: PublishingPost, connection: Connection) {
  const [workspace] = await connection.find(workspaces, { id: post.workspaceId }, { lock: true });
  if (!workspace) throw new WorkflowError("Workspace no longer exists.", 404);
  const { plan } = await getWorkspaceEntitlements(post.workspaceId, connection);
  await assertBrandEntitlement(post.workspaceId, post.brandId, connection);
  const accounts = await connection.find(socialAccounts, { workspaceId: post.workspaceId, status: "connected" }, { sort: { id: 1 } });
  const allowed = new Set(accounts.slice(0, plan.maxChannels).map(account => account.id));
  for (const platform of post.platforms) {
    const matching = accounts.filter(account => account.brandId === post.brandId && account.platform === platform);
    if (matching.length && !matching.some(account => allowed.has(account.id))) {
      throw new WorkflowError("A publishing connection is outside your current plan allowance. Its credentials have been retained.", 403);
    }
  }
  const key = `${post.workspaceId}:${post.id}`;
  const [reservation] = await connection.find(publishingReservations, { key });
  if (reservation && reservation.status !== "released") return;
  const { period, used } = await publishingUsage(post.workspaceId, connection);
  if (used.size >= plan.maxPostsPerMonth) throw new WorkflowError("Monthly publishing allowance reached.", 403);
  await connection.upsert(publishingReservations, "key", { key, workspaceId: post.workspaceId, postId: post.id, period }, {
    period, status: "reserved", createdAt: new Date(),
  });
}

export async function consumePublishingReservation(workspaceId: number, postId: number, connection: Connection) {
  await connection.update(publishingReservations, { key: `${workspaceId}:${postId}`, status: "reserved" }, { status: "consumed" });
}

export async function retainPublishedUsage(post: PostsDocument, connection: Connection) {
  if (!post.publishedAt) return;
  const key = `${post.workspaceId}:${post.id}`;
  const [reservation] = await connection.find(publishingReservations, { key });
  if (reservation && reservation.status !== "released") return;
  await connection.upsert(publishingReservations, "key", {
    key, workspaceId: post.workspaceId, postId: post.id,
    period: usagePeriod(post.publishedAt), status: "consumed",
  }, { period: usagePeriod(post.publishedAt), status: "consumed" });
}

export async function releasePublishingReservation(workspaceId: number, postId: number, connection: Connection) {
  const jobs = await connection.find(publishingJobs, { workspaceId, postId });
  if (jobs.some(job => ["processing", "completed", "uncertain"].includes(job.status) || job.externalPostId || job.encryptedProviderState)) return;
  await connection.update(publishingReservations, { key: `${workspaceId}:${postId}`, status: "reserved" }, { status: "released" });
}
