import { getServerI18n } from "@/i18n/server";
import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { analyticsSnapshots } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { AnalyticsClient } from "@/components/AnalyticsClient";
import { socialEngagementSnapshots, socialLifecycleStatuses } from "@/db/social-lifecycle-schema";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { ProviderAnalyticsSync } from "@/components/ProviderAnalyticsSync";
import { SOCIAL_LIFECYCLE_CAPABILITIES } from "@/lib/social-capabilities";
export const dynamic = "force-dynamic";
export default async function AnalyticsPage() {
  const { t, formatDate, formatNumber } = await getServerI18n();
  const displayMetric = (value: string) => ["sampledPosts", "pinClicks", "uniqueImpressions", "pageLikes", "profileViews", "impressions", "reach", "engagements", "clicks", "followers", "likes", "comments", "shares", "views", "replies", "reposts", "quotes", "saves", "reactions", "subscribers", "videos", "media", "posts"].includes(value) ? t(`customer.metric.${value}`) : value;

    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const snapshots = await db.find(analyticsSnapshots, { workspaceId: ctx.workspace.id, isSampleData: false }, {});
    const providerSnapshots = await db.find(socialEngagementSnapshots, { workspaceId: ctx.workspace.id, isSampleData: false }, { sort: { day: -1 }, limit: 100 });
    const statuses = await db.find(socialLifecycleStatuses, { workspaceId: ctx.workspace.id });
    const { features } = await getWorkspaceEntitlements(ctx.workspace.id);
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("customer.text.25")}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          {t("customer.text.26")}
        </p>
      </div>
      <section className="surface-card space-y-4 rounded-3xl p-6">
        <h2 className="font-bold">{t("customer.text.27")}</h2>
        <p className="text-xs">{t("customer.text.28")}</p>
        {features.advancedAnalytics && ["owner", "admin"].includes(ctx.memberRole) && <ProviderAnalyticsSync />}
        {!features.advancedAnalytics && <p className="text-xs">{t("customer.text.29")}</p>}
        {!providerSnapshots.length && <p className="text-sm">{t("customer.text.30")}</p>}
        {providerSnapshots.map(snapshot => <article key={snapshot.id} className="space-y-2 rounded-xl border border-white/10 p-4">
          <h3 className="text-sm font-bold">{t("customer.providerCapture", { platform: snapshot.platform, id: snapshot.socialAccountId, date: formatDate(`${snapshot.day}T00:00:00Z`, { dateStyle: "medium", timeZone: "UTC" }) })}</h3>
          <dl className="flex flex-wrap gap-4 text-xs">{Object.entries(snapshot.metrics).map(([key, value]) => <div key={key}><dt>{displayMetric(key)}</dt><dd className="font-bold">{formatNumber(value)}</dd></div>)}</dl>
          <p className="text-xs">{snapshot.coverage}</p>
          <p className="text-xs text-[var(--text-muted)]">{t("customer.text.33")}{" "} {snapshot.unavailableMetrics.map(displayMetric).join(", ")}</p>
        </article>)}
        {statuses.filter(status => status.analyticsMessage).map(status => <p key={status.id} className="text-xs text-amber-400">{t("customer.text.34")}{status.socialAccountId}: {status.analyticsMessage}</p>)}
        <details className="text-xs"><summary>{t("customer.text.35")}</summary>{Object.keys(SOCIAL_LIFECYCLE_CAPABILITIES).map(platform => <p key={platform} className="mt-2"><strong>{platform}:</strong> {t(`customer.provider.${platform}.analytics`)}</p>)}</details>
      </section>

      <AnalyticsClient advanced={features.advancedAnalytics} snapshots={snapshots.map((s) => ({
            id: s.id,
            platform: s.platform,
            dateLabel: s.dateLabel,
            impressions: s.impressions,
            reach: s.reach,
            engagements: s.engagements,
            likes: s.likes,
            comments: s.comments,
            shares: s.shares,
            clicks: s.clicks,
            followers: s.followers,
            postType: s.postType,
            isSampleData: s.isSampleData,
        }))}/>
    </div>);
}
