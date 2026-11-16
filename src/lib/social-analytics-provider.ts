import { z } from "zod";
import { SocialProviderError, type CustomerCredentials } from "./social-provider";
import { metaVersion, providerJson } from "./social-oauth-provider";
import type { SocialPlatform } from "./social-adapters";

const numeric = z.union([z.number(), z.string().regex(/^-?\d+$/).transform(Number)]).pipe(z.number().finite().safe());
const count = numeric.pipe(z.number().nonnegative());
const providerId = z.union([z.string().min(1), z.number().int().safe().nonnegative()]).transform(String);
const insightsResponse = z.object({ data: z.array(z.object({
  name: z.string(), total_value: z.object({ value: count.optional() }).optional(),
  values: z.array(z.object({ value: count, end_time: z.string().optional() })).optional(),
  link_total_values: z.array(z.object({ value: count })).optional(),
})) });
function insightMetrics(raw: unknown, mapping: Record<string, string>, allowSeries = false) {
  const metrics: Record<string, number> = {};
  for (const item of insightsResponse.parse(raw).data) {
    const key = mapping[item.name];
    if (!key || metrics[key] !== undefined) continue;
    if (item.total_value?.value !== undefined) metrics[key] = item.total_value.value;
    else if (item.values?.length === 1) metrics[key] = item.values[0].value;
    else if (allowSeries && item.values?.length) metrics[key] = count.parse(item.values.reduce((total, point) => total + point.value, 0));
    else if (item.link_total_values?.length) metrics[key] = count.parse(item.link_total_values.reduce((total, link) => total + link.value, 0));
  }
  return metrics;
}
function previousDay() {
  const until = new Date();
  until.setUTCHours(0, 0, 0, 0);
  const since = new Date(until.getTime() - 86400000);
  return { day: since.toISOString().slice(0, 10), since: String(since.getTime() / 1000), until: String(until.getTime() / 1000) };
}
function requestedAccount(credentials: CustomerCredentials) {
  if (!credentials.accountId) throw new SocialProviderError("Reconnect and verify the intended provider account before syncing analytics.", 422);
  return credentials.accountId;
}
function ensureMetrics(metrics: Record<string, number>) {
  if (!Object.keys(metrics).some(key => key !== "sampledPosts")) throw new SocialProviderError("The provider has no available metrics for this account/period. Check approved analytics permissions, reporting delay and privacy thresholds; missing data is not zero.", 422);
  return metrics;
}
async function optionalInsights(callback: () => Promise<Record<string, number>>, warnings: string[]) {
  try { return await callback(); }
  catch (error) {
    if (!(error instanceof SocialProviderError) || ![400, 403, 422].includes(error.status)) throw error;
    warnings.push(error.message);
    return {};
  }
}
export async function readExtendedSocialAnalytics(platform: SocialPlatform, credentials: CustomerCredentials, deadline: number): Promise<{ metrics: Record<string, number>; coverage: string }> {
  const accountId = requestedAccount(credentials);
  const headers = { Authorization: `Bearer ${credentials.accessToken}` };
  const target = encodeURIComponent(accountId);
  const period = previousDay();
  if (platform === "pinterest") {
    const identity = z.object({ username: z.string() }).parse(await providerJson("https://api.pinterest.com/v5/user_account", { headers }, deadline));
    if (identity.username !== accountId) throw new SocialProviderError("Pinterest analytics identity mismatch. Reconnect if the username changed.", 422);
    const url = new URL("https://api.pinterest.com/v5/user_account/analytics");
    url.search = new URLSearchParams({ start_date: period.day, end_date: period.day, metric_types: "IMPRESSION,ENGAGEMENT,PIN_CLICK,OUTBOUND_CLICK,SAVE" }).toString();
    const aggregate = z.object({ summary_metrics: z.record(z.string(), count).optional() });
    const data = z.object({ all: aggregate.optional(), ALL: aggregate.optional() }).parse(await providerJson(url.toString(), { headers }, deadline));
    const summary = data.all?.summary_metrics ?? data.ALL?.summary_metrics;
    const metrics: Record<string, number> = {};
    for (const [source, key] of Object.entries({ IMPRESSION: "impressions", ENGAGEMENT: "engagements", PIN_CLICK: "pinClicks", OUTBOUND_CLICK: "clicks", SAVE: "saves" })) if (summary?.[source] !== undefined) metrics[key] = summary[source];
    return { metrics: ensureMetrics(metrics), coverage: `Pinterest business-account analytics for UTC ${period.day} only (not capture-day activity). Requires approved API access and user_accounts:read; provider reporting delay/privacy rules apply.` };
  }
  if (platform === "linkedin") {
    if (!/^20\d{4}$/.test(credentials.apiVersion || "")) throw new SocialProviderError("Set your app's supported LinkedIn API version (YYYYMM).", 422);
    const versionedHeaders = { ...headers, "Linkedin-Version": credentials.apiVersion!, "X-Restli-Protocol-Version": "2.0.0" };
    if (/^urn:li:organization:\d+$/.test(accountId)) {
      const url = new URL("https://api.linkedin.com/rest/organizationalEntityShareStatistics");
      url.search = new URLSearchParams({ q: "organizationalEntity", organizationalEntity: accountId }).toString();
      const result = z.object({ elements: z.array(z.object({ organizationalEntity: z.string(), totalShareStatistics: z.object({ impressionCount: count.optional(), uniqueImpressionsCount: count.optional(), clickCount: count.optional(), likeCount: numeric.optional(), commentCount: count.optional(), shareCount: count.optional() }) })) }).parse(await providerJson(url.toString(), { headers: versionedHeaders }, deadline));
      const own = result.elements.filter(item => item.organizationalEntity === accountId);
      if (own.length !== result.elements.length || own.length > 1) throw new SocialProviderError("LinkedIn returned an unexpected organization analytics scope.", 502);
      const stats = own[0]?.totalShareStatistics;
      const metrics: Record<string, number> = {};
      for (const [source, key] of Object.entries({ impressionCount: "impressions", uniqueImpressionsCount: "uniqueImpressions", clickCount: "clicks", likeCount: "likes", commentCount: "comments", shareCount: "shares" }) as [keyof NonNullable<typeof stats>, string][]) if (stats?.[source] !== undefined) metrics[key] = stats[source]!;
      return { metrics: ensureMetrics(metrics), coverage: "LinkedIn organization organic share totals over the API's rolling 12-month availability; not daily activity, sponsored/ad analytics or whole-history totals. Administrator role, approved Community Management access and rw_organization_admin are required. Provider organic likes may legitimately be negative after unlikes." };
    }
    if (!/^urn:li:person:[A-Za-z0-9_-]+$/.test(accountId)) throw new SocialProviderError("LinkedIn member or organization identity is required.", 422);
    const identity = z.object({ sub: z.string() }).parse(await providerJson("https://api.linkedin.com/v2/userinfo", { headers }, deadline));
    if (`urn:li:person:${identity.sub}` !== accountId) throw new SocialProviderError("LinkedIn analytics identity mismatch.", 422);
    const types = { IMPRESSION: "impressions", MEMBERS_REACHED: "reach", REACTION: "reactions", COMMENT: "comments", RESHARE: "shares" };
    const metrics: Record<string, number> = {};
    const warnings: string[] = [];
    const reads = await Promise.allSettled(Object.entries(types).map(async ([queryType, key]) => {
      const result = await optionalInsights(async () => {
        const url = new URL("https://api.linkedin.com/rest/memberCreatorPostAnalytics");
        url.search = new URLSearchParams({ q: "me", queryType, aggregation: "TOTAL" }).toString();
        const data = z.object({ elements: z.array(z.object({ count, metricType: z.union([z.string(), z.record(z.string(), z.string())]) })) }).parse(await providerJson(url.toString(), { headers: versionedHeaders }, deadline));
        if (data.elements.length > 1) throw new SocialProviderError("LinkedIn returned multiple rows for a TOTAL metric.", 502);
        const item = data.elements[0];
        if (!item) return {};
        const kind = typeof item.metricType === "string" ? item.metricType : Object.values(item.metricType)[0];
        if (kind !== queryType) throw new SocialProviderError("LinkedIn returned a different analytics metric than requested.", 502);
        return { [key]: item.count };
      }, warnings);
      Object.assign(metrics, result);
    }));
    const failed = reads.find(read => read.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    return { metrics: ensureMetrics(metrics), coverage: `LinkedIn authenticated-member aggregate TOTAL post analytics; not daily activity. Requires approved r_member_postAnalytics access. Reactions are not likes; provider notes reactions/comments/reshares may differ from its UI.${warnings.length ? " Some metrics were unavailable or denied; omitted rather than zero." : ""}` };
  }
  if (platform === "facebook") {
    const root = `https://graph.facebook.com/${metaVersion(credentials)}`;
    const profile = z.object({ id: providerId, followers_count: count.optional(), fan_count: count.optional() }).parse(await providerJson(`${root}/${target}?fields=id,followers_count,fan_count`, { headers }, deadline));
    if (profile.id !== accountId) throw new SocialProviderError("Facebook Page analytics identity mismatch.", 422);
    const metrics: Record<string, number> = {};
    if (profile.followers_count !== undefined) metrics.followers = profile.followers_count;
    if (profile.fan_count !== undefined) metrics.pageLikes = profile.fan_count;
    const warnings: string[] = [];
    Object.assign(metrics, await optionalInsights(async () => {
      const summary = z.object({ summary: z.object({ total_count: count.optional() }).optional() });
      const posts = z.object({ data: z.array(z.object({ id: z.string(), from: z.object({ id: providerId }).optional(), is_published: z.boolean().optional(), reactions: summary.optional(), comments: summary.optional(), shares: z.object({ count }).optional() })) }).parse(await providerJson(`${root}/${target}/feed?limit=100&fields=id,from,is_published,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares`, { headers }, deadline));
      const own = posts.data.filter(post => post.from?.id === accountId && post.is_published === true);
      const aggregate: Record<string, number> = { sampledPosts: own.length };
      for (const key of ["reactions", "comments", "shares"] as const) {
        const values = own.map(post => key === "shares" ? post.shares?.count : post[key]?.summary?.total_count);
        if (values.length && values.every(value => value !== undefined)) aggregate[key] = count.parse(values.reduce<number>((total, value) => total + value!, 0));
      }
      return aggregate;
    }, warnings));
    return { metrics: ensureMetrics(metrics), coverage: `Facebook Page lifetime followers/Page likes plus engagement on Page-authored published posts within at most 100 returned feed items; excludes Reels, hidden counters and visitor posts. Reactions are not likes; missing share counters are unavailable, not zero. Requires the exact Page token and pages_read_engagement/pages_read_user_content.${warnings.length ? " Feed engagement unavailable: review approved read permissions." : ""}` };
  }
  if (platform === "instagram") {
    const root = `https://graph.instagram.com/${metaVersion(credentials)}`;
    const profileSchema = z.object({ user_id: providerId, followers_count: count.optional(), media_count: count.optional() });
    const profile = z.union([profileSchema, z.object({ data: z.array(profileSchema).length(1) }).transform(value => value.data[0])]).parse(await providerJson(`${root}/me?fields=user_id,followers_count,media_count`, { headers }, deadline));
    if (profile.user_id !== accountId) throw new SocialProviderError("Instagram analytics identity mismatch.", 422);
    const metrics: Record<string, number> = {};
    if (profile.followers_count !== undefined) metrics.followers = profile.followers_count;
    if (profile.media_count !== undefined) metrics.posts = profile.media_count;
    const warnings: string[] = [];
    const url = new URL(`${root}/${target}/insights`);
    url.search = new URLSearchParams({ metric: "views,reach,total_interactions,likes,comments,shares", period: "day", metric_type: "total_value", since: period.since, until: period.until }).toString();
    Object.assign(metrics, await optionalInsights(async () => insightMetrics(await providerJson(url.toString(), { headers }, deadline), { views: "views", reach: "reach", total_interactions: "engagements", likes: "likes", comments: "comments", shares: "shares" }), warnings));
    return { metrics: ensureMetrics(metrics), coverage: `Instagram Login professional-account insights for UTC ${period.day}, plus current lifetime followers/media counters. instagram_business_manage_insights and approved access are required. Reach is a provider estimate, views are in development; data can lag 48 hours and some metrics require 100 followers. Deprecated impressions are not requested.${warnings.length ? " Period insights unavailable: review approved insights permissions." : ""}` };
  }
  if (platform === "threads") {
    const root = "https://graph.threads.com/v1.0";
    const identity = z.object({ id: providerId }).parse(await providerJson(`${root}/me?fields=id`, { headers }, deadline));
    if (identity.id !== accountId) throw new SocialProviderError("Threads analytics identity mismatch.", 422);
    const warnings: string[] = [];
    const url = new URL(`${root}/${target}/threads_insights`);
    url.search = new URLSearchParams({ metric: "views,likes,replies,reposts,quotes,clicks", since: period.since, until: period.until }).toString();
    const metrics = await optionalInsights(async () => insightMetrics(await providerJson(url.toString(), { headers }, deadline), { views: "profileViews", likes: "likes", replies: "comments", reposts: "reposts", quotes: "quotes", clicks: "clicks" }, true), warnings);
    // Followers do not accept date filters. Keep this request separate from period engagement.
    Object.assign(metrics, await optionalInsights(async () => insightMetrics(await providerJson(`${root}/${target}/threads_insights?metric=followers_count`, { headers }, deadline), { followers_count: "followers" }), warnings));
    return { metrics: ensureMetrics(metrics), coverage: `Threads profile/post insights for UTC ${period.day}; followers are a separate current lifetime counter without date filters. Profile views are not post impressions; replies include top-level replies only. threads_manage_insights and approved access are required.${warnings.length ? " Some insight groups were denied/unavailable and are omitted." : ""}` };
  }
  throw new SocialProviderError("Unsupported social analytics platform.", 422);
}
