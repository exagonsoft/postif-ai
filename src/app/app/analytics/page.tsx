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
          Analytics & Performance Intelligence
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Recorded performance and real provider counters. Unavailable metrics are never estimated.
        </p>
      </div>
      <section className="surface-card space-y-4 rounded-3xl p-6">
        <h2 className="font-bold">Provider engagement snapshots</h2>
        <p className="text-xs">All plans can read recorded analytics. New provider synchronization requires Pro or Agency and your own approved provider permissions. Read each snapshot&apos;s coverage: some metrics cover a prior UTC day, others are lifetime counters or recent-post samples. Do not sum cumulative observations across capture dates.</p>
        {features.advancedAnalytics && ["owner", "admin"].includes(ctx.memberRole) && <ProviderAnalyticsSync />}
        {!features.advancedAnalytics && <p className="text-xs">Upgrade to Pro or Agency to synchronize new provider snapshots.</p>}
        {!providerSnapshots.length && <p className="text-sm">No provider snapshots recorded. No sample or simulated metrics are shown.</p>}
        {providerSnapshots.map(snapshot => <article key={snapshot.id} className="space-y-2 rounded-xl border border-white/10 p-4">
          <h3 className="text-sm font-bold">{snapshot.platform} · account #{snapshot.socialAccountId} · captured {snapshot.day}</h3>
          <dl className="flex flex-wrap gap-4 text-xs">{Object.entries(snapshot.metrics).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="font-bold">{value.toLocaleString()}</dd></div>)}</dl>
          <p className="text-xs">{snapshot.coverage}</p>
          <p className="text-xs text-[var(--text-muted)]">Unavailable: {snapshot.unavailableMetrics.join(", ")}</p>
        </article>)}
        {statuses.filter(status => status.analyticsMessage).map(status => <p key={status.id} className="text-xs text-amber-400">Account #{status.socialAccountId}: {status.analyticsMessage}</p>)}
        <details className="text-xs"><summary>Provider capabilities and limitations</summary>{Object.entries(SOCIAL_LIFECYCLE_CAPABILITIES).map(([platform, capability]) => <p key={platform} className="mt-2"><strong>{platform}:</strong> {capability.analytics}</p>)}</details>
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
