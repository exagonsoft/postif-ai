import { z } from "zod";
import { db } from "@/db";
import { socialAccounts, socialCredentials, workspaces, type SocialAccountsDocument } from "@/db/schema";
import { socialEngagementSnapshots, socialLifecycleStatuses } from "@/db/social-lifecycle-schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { customerCredentials, SocialProviderError, type CustomerCredentials } from "./social-provider";
import { exchangeSocialToken, providerJson } from "./social-oauth-provider";
import { assertBrandEntitlement, getWorkspaceEntitlements } from "./entitlements";
import { WorkflowError } from "./post-policy";
import type { SocialPlatform } from "./social-adapters";
import { readExtendedSocialAnalytics } from "./social-analytics-provider";

type Options = { deadline?: number; limit?: number; workspaceId?: number; accountId?: number };
type Result = { processed: number; failed: number; skipped: number };
export async function assertSocialConnectCapacity(workspaceId: number, accountId: number | undefined, connection = db) {
  const [workspace] = await connection.find(workspaces, { id: workspaceId }, { lock: true });
  if (!workspace) throw new SocialProviderError("Workspace not found.", 404);
  const { plan } = await getWorkspaceEntitlements(workspaceId, connection);
  const connected = await connection.find(socialAccounts, { workspaceId, status: "connected" });
  if (!connected.some(account => account.id === accountId) && connected.length >= plan.maxChannels) throw new SocialProviderError("Your plan's connected-channel limit has been reached.", 403);
}
async function credentialsFor(account: SocialAccountsDocument) {
  const [stored] = await db.find(socialCredentials, { workspaceId: account.workspaceId, socialAccountId: account.id });
  const value = stored && decryptSecret(stored.encryptedCredentials);
  if (!value) throw new SocialProviderError("Reconnect this account with your own provider credentials.", 422);
  return { stored, credentials: customerCredentials.parse(JSON.parse(value)) };
}
async function saveStatus(account: SocialAccountsDocument, fields: Partial<import("@/db/social-lifecycle-schema").SocialLifecycleStatus>) {
  await db.upsert(socialLifecycleStatuses, "socialAccountId", { socialAccountId: account.id, workspaceId: account.workspaceId, ...fields }, { ...fields, updatedAt: new Date() });
}
const safeMessage = (error: unknown) => error instanceof SocialProviderError || error instanceof WorkflowError ? error.message : "Provider returned invalid data or credentials could not be read. Reauthorize or replace the token.";
async function renew(account: SocialAccountsDocument, deadline: number) {
  await db.transaction(async tx => {
    await assertSocialConnectCapacity(account.workspaceId, account.id, tx);
    await assertBrandEntitlement(account.workspaceId, account.brandId, tx);
  });
  if (account.status === "connected" && !(await eligible(account))) throw new SocialProviderError("This channel is outside your plan's oldest connected-channel allowance.", 403);
  const { stored, credentials } = await credentialsFor(account);
  let updated: CustomerCredentials;
  if (account.platform === "instagram" || account.platform === "threads") {
    if (credentials.tokenKind !== "long_lived" || !credentials.expiresAt || Date.parse(credentials.expiresAt) <= Date.now()) throw new SocialProviderError("Only unexpired, explicitly declared long-lived tokens can renew. Replace or exchange this token with your own provider app.", 422);
    if (Date.now() - stored.verifiedAt.getTime() < 86400000) throw new SocialProviderError("Long-lived tokens must be at least 24 hours old before refreshing.", 422);
    const url = new URL(account.platform === "instagram" ? "https://graph.instagram.com/refresh_access_token" : "https://graph.threads.com/refresh_access_token");
    url.searchParams.set("grant_type", account.platform === "instagram" ? "ig_refresh_token" : "th_refresh_token");
    url.searchParams.set("access_token", credentials.accessToken);
    const result = z.object({ access_token: z.string().min(10), expires_in: z.number().int().positive().max(315360000) }).parse(await providerJson(url.toString(), { method: "GET" }, deadline));
    updated = customerCredentials.parse({ ...credentials, accessToken: result.access_token, expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString() });
  } else {
    if (account.platform === "facebook") throw new SocialProviderError("Facebook Page tokens do not support a generic refresh grant. Reissue using your own Meta app.", 422);
    updated = await exchangeSocialToken(account.platform as SocialPlatform, credentials, { refresh: true }, deadline);
  }
  // The refresh grant is account-bound. Preserve all publishing declarations and the configured API version.
  await db.transaction(async tx => {
    const [current] = await tx.find(socialAccounts, { id: account.id, workspaceId: account.workspaceId }, { lock: true });
    const [currentSecret] = await tx.find(socialCredentials, { socialAccountId: stored.socialAccountId, workspaceId: account.workspaceId }, { lock: true });
    if (!current || current.status === "disconnected" || currentSecret?.encryptedCredentials !== stored.encryptedCredentials) throw new SocialProviderError("Connection changed while renewing. Retry with current credentials.", 409);
    // Keep a successfully rotated refresh token even if the workspace was downgraded during the request.
    await tx.update(socialCredentials, { socialAccountId: stored.socialAccountId, workspaceId: account.workspaceId }, { encryptedCredentials: encryptSecret(JSON.stringify(updated)), expiresAt: updated.expiresAt ? new Date(updated.expiresAt) : null, verifiedAt: new Date() });
    try { await assertSocialConnectCapacity(account.workspaceId, current.id, tx); }
    catch (error) {
      if (!(error instanceof SocialProviderError) || error.status !== 403) throw error;
      await tx.update(socialAccounts, { id: current.id, workspaceId: account.workspaceId }, { lastError: "Credentials renewed; channel remains inactive because the plan channel limit is reached." });
      return;
    }
    await tx.update(socialAccounts, { id: current.id, workspaceId: account.workspaceId }, { status: "connected", lastError: null, lastSyncAt: new Date() });
  });
  await saveStatus(account, { renewalStatus: "renewed", renewalMessage: null, renewAfter: new Date(Date.now() + 3600000) });
}
async function eligible(account: SocialAccountsDocument) {
  const { plan } = await getWorkspaceEntitlements(account.workspaceId);
  const connected = await db.find(socialAccounts, { workspaceId: account.workspaceId, status: "connected" }, { sort: { id: 1 } });
  return connected.slice(0, plan.maxChannels).some(candidate => candidate.id === account.id);
}
async function run(kind: "renew" | "analytics", options: Options): Promise<Result> {
  const deadline = Math.min(options.deadline ?? Date.now() + 20000, Date.now() + 55000);
  const limit = Math.max(1, Math.min(options.limit ?? 5, 25));
  const result: Result = { processed: 0, failed: 0, skipped: 0 };
  const deferred = options.accountId ? [] : await db.find(socialLifecycleStatuses, { [kind === "renew" ? "renewAfter" : "syncAfter"]: { $gt: new Date() }, ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}) }, { projection: { socialAccountId: 1 } });
  const accounts = await db.find(socialAccounts, { status: { $in: ["connected", "needs_review"] }, ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}), id: options.accountId ?? { $nin: deferred.map(state => state.socialAccountId) } }, { sort: { lastSyncAt: 1, id: 1 }, limit: 100 });
  for (const account of accounts) {
    if (Date.now() + 1000 >= deadline || result.processed + result.failed >= limit) break;
    const [state] = await db.find(socialLifecycleStatuses, { socialAccountId: account.id, workspaceId: account.workspaceId });
    const after = kind === "renew" ? state?.renewAfter : state?.syncAfter;
    if (!options.accountId && after && after.getTime() > Date.now()) { result.skipped++; continue; }
    const ran = await db.withLease(`social:${account.workspaceId}:${account.id}`, async () => {
      try {
        if (kind === "renew") {
          const { credentials } = await credentialsFor(account);
          if (!options.accountId && (!credentials.expiresAt || Date.parse(credentials.expiresAt) > Date.now() + 86400000)) {
            const pageToken = account.platform === "facebook" && credentials.tokenKind === "long_lived";
            await saveStatus(account, { renewalStatus: credentials.expiresAt ? "not_due" : pageToken ? "no_scheduled_expiry" : "expiry_unknown", renewalMessage: credentials.expiresAt ? null : pageToken ? "Long-lived Facebook Page tokens have no scheduled expiry but can be invalidated. Verify or reauthorize if the provider denies access." : "No expiry supplied. Automatic renewal cannot be scheduled; verify or replace the token.", renewAfter: new Date(Date.now() + 3600000) });
            result.skipped++; return true;
          }
          await renew(account, deadline);
        } else {
          if (!(await getWorkspaceEntitlements(account.workspaceId)).features.advancedAnalytics) {
            await saveStatus(account, { analyticsStatus: "plan_required", analyticsMessage: "New provider synchronization requires Pro or Agency. Recorded snapshots remain available.", syncAfter: new Date(Date.now() + 3600000) });
            result.skipped++; return true;
          }
          if (!(await eligible(account))) {
            await saveStatus(account, { analyticsStatus: "paused", analyticsMessage: "Only the oldest connected accounts within the current plan allowance can synchronize.", syncAfter: new Date(Date.now() + 3600000) });
            result.skipped++; return true;
          }
          await assertBrandEntitlement(account.workspaceId, account.brandId);
          const { stored, credentials } = await credentialsFor(account);
          const data = await readSocialAnalytics(account.platform as SocialPlatform, credentials, deadline);
          const day = new Date().toISOString().slice(0, 10);
          const snapshotKey = `${account.workspaceId}:${account.id}:${day}`;
          await db.transaction(async tx => {
            await tx.find(workspaces, { id: account.workspaceId }, { lock: true });
            if (!(await getWorkspaceEntitlements(account.workspaceId, tx)).features.advancedAnalytics) throw new SocialProviderError("Provider synchronization requires Pro or Agency.", 403);
            await assertBrandEntitlement(account.workspaceId, account.brandId, tx);
            const [current] = await tx.find(socialAccounts, { id: account.id, workspaceId: account.workspaceId, status: "connected" }, { lock: true });
            if (!current) throw new SocialProviderError("Connection was removed during analytics synchronization.", 409);
            const [currentSecret] = await tx.find(socialCredentials, { socialAccountId: stored.socialAccountId, workspaceId: account.workspaceId }, { lock: true });
            if (currentSecret?.encryptedCredentials !== stored.encryptedCredentials) throw new SocialProviderError("Connection changed during synchronization. Retry with current credentials.", 409);
            await tx.upsert(socialEngagementSnapshots, "snapshotKey", { snapshotKey, workspaceId: account.workspaceId, socialAccountId: account.id, platform: account.platform, day, ...data }, { capturedAt: new Date(), ...data });
          });
          await saveStatus(account, { analyticsStatus: "synced", analyticsMessage: null, syncAfter: new Date(Date.now() + 3600000) });
        }
        result.processed++;
      } catch (error) {
        const message = safeMessage(error);
        if (kind === "renew") {
          await saveStatus(account, { renewalStatus: "action_needed", renewalMessage: message, renewAfter: new Date(Date.now() + 3600000) });
          const [current] = await db.find(socialCredentials, { socialAccountId: account.id, workspaceId: account.workspaceId });
          if (current?.expiresAt && current.expiresAt.getTime() <= Date.now()) await db.update(socialAccounts, { id: account.id, workspaceId: account.workspaceId, status: { $ne: "disconnected" } }, { status: "needs_review", lastError: message });
        } else await saveStatus(account, { analyticsStatus: error instanceof SocialProviderError && error.status === 422 ? "unavailable" : "failed", analyticsMessage: message, syncAfter: new Date(Date.now() + 3600000) });
        result.failed++;
      }
      return true;
    }, false);
    if (!ran) result.skipped++;
  }
  return result;
}
export const renewSocialCredentials = (options: Options = {}) => run("renew", options);
export const syncSocialAnalytics = (options: Options = {}) => run("analytics", options);

const counter = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().finite().nonnegative().safe());
export async function readSocialAnalytics(platform: SocialPlatform, credentials: CustomerCredentials, deadline = Date.now() + 15000) {
  if (credentials.expiresAt && Date.parse(credentials.expiresAt) <= Date.now()) throw new SocialProviderError("Token expired. Renew or reconnect before syncing analytics.", 422);
  const headers = { Authorization: `Bearer ${credentials.accessToken}` };
  let metrics: Record<string, number>;
  let coverage: string;
  if (platform === "x") {
    if (!credentials.accountId) throw new SocialProviderError("Reconnect to verify provider account identity.", 422);
    const root = `https://api.x.com/2/users/${encodeURIComponent(credentials.accountId)}`;
    const user = z.object({ data: z.object({ id: z.string(), public_metrics: z.object({ followers_count: counter, tweet_count: counter }) }) }).parse(await providerJson(`${root}?user.fields=public_metrics`, { headers }, deadline));
    if (user.data.id !== credentials.accountId) throw new SocialProviderError("Analytics identity mismatch.", 422);
    const tweets = z.object({ data: z.array(z.object({ public_metrics: z.object({ like_count: counter, reply_count: counter, retweet_count: counter, quote_count: counter }) })).optional(), meta: z.object({ result_count: counter }) }).parse(await providerJson(`${root}/tweets?max_results=100&tweet.fields=public_metrics`, { headers }, deadline));
    if (!tweets.data && tweets.meta.result_count !== 0) throw new SocialProviderError("Provider omitted requested post metrics.", 502);
    metrics = { followers: user.data.public_metrics.followers_count, posts: user.data.public_metrics.tweet_count, sampledPosts: tweets.data?.length ?? 0, likes: 0, comments: 0, shares: 0 };
    for (const tweet of tweets.data ?? []) { metrics.likes += tweet.public_metrics.like_count; metrics.comments += tweet.public_metrics.reply_count; metrics.shares += tweet.public_metrics.retweet_count + tweet.public_metrics.quote_count; }
    coverage = "Account lifetime followers/posts; engagement totals for at most 100 latest posts returned. Snapshot capture day is not an activity date.";
  } else if (platform === "youtube") {
    const response = z.object({ items: z.array(z.object({ id: z.string(), statistics: z.object({ viewCount: counter, videoCount: counter, subscriberCount: counter.optional(), hiddenSubscriberCount: z.boolean() }) })) }).parse(await providerJson("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true", { headers }, deadline));
    const channel = response.items.find(item => item.id === credentials.accountId);
    if (!channel) throw new SocialProviderError("The token does not match the stored YouTube channel.", 422);
    metrics = { views: channel.statistics.viewCount, posts: channel.statistics.videoCount };
    if (!channel.statistics.hiddenSubscriberCount && channel.statistics.subscriberCount !== undefined) metrics.followers = channel.statistics.subscriberCount;
    coverage = "Channel lifetime counters (subscriber counts may be rounded/hidden); not daily activity.";
  } else if (platform === "tiktok") {
    const result = z.object({ error: z.object({ code: z.literal("ok") }), data: z.object({ user: z.object({ open_id: z.string(), follower_count: counter, likes_count: counter, video_count: counter }) }) }).parse(await providerJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,follower_count,likes_count,video_count", { headers }, deadline));
    if (result.data.user.open_id !== credentials.accountId) throw new SocialProviderError("Analytics identity mismatch.", 422);
    metrics = { followers: result.data.user.follower_count, likes: result.data.user.likes_count, posts: result.data.user.video_count };
    coverage = "Account lifetime counters; user.info.stats permission required; not daily activity.";
  } else {
    const result = await readExtendedSocialAnalytics(platform, credentials, deadline);
    metrics = result.metrics;
    coverage = result.coverage;
  }
  return { metrics, coverage, unavailableMetrics: ["impressions", "reach", "engagements", "likes", "comments", "shares", "clicks", "followers", "views"].filter(key => metrics[key] === undefined) };
}
