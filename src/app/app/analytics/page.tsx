import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { analyticsSnapshots } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { AnalyticsClient } from "@/components/AnalyticsClient";
export const dynamic = "force-dynamic";
export default async function AnalyticsPage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const snapshots = await db.find(analyticsSnapshots, { workspaceId: ctx.workspace.id, isSampleData: false }, {});
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Analytics & Performance Intelligence
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Cross-channel reach, engagement velocity, exportable reports, and grounded AI
          recommendations.
        </p>
      </div>

      <AnalyticsClient snapshots={snapshots.map((s) => ({
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
