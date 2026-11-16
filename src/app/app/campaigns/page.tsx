import { getServerI18n } from "@/i18n/server";
import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { campaigns, posts } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { CampaignsClient } from "@/components/CampaignsClient";
export const dynamic = "force-dynamic";
export default async function CampaignsPage() {
  const { t } = await getServerI18n();

    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const [wsCampaigns, wsPosts] = await Promise.all([
        db.find(campaigns, { workspaceId: ctx.workspace.id, isSampleData: { $ne: true } }, { sort: { createdAt: -1 } }),
        db.find(posts, eq("workspaceId", ctx.workspace.id), {}),
    ]);
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("customer.text.41")}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          {t("customer.text.42")}
        </p>
      </div>

      <CampaignsClient campaigns={wsCampaigns.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            objective: c.objective,
            audience: c.audience,
            platforms: c.platforms,
            status: c.status,
            startDate: c.startDate,
            endDate: c.endDate,
            strategySummary: c.strategySummary,
            contentThemes: c.contentThemes,
            weeklyCadence: c.weeklyCadence,
            isSampleData: c.isSampleData,
            linkedPostCount: wsPosts.filter((p) => p.campaignId === c.id).length,
        }))}/>
    </div>);
}
