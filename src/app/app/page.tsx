import { getServerI18n } from "@/i18n/server";
import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { socialAccounts, posts, publishingJobs, analyticsSnapshots, agentConfigurations, agentActions, } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { getWorkspaceEntitlements, getPublishingUsage } from "@/lib/entitlements";
import { OverviewInteractive } from "@/components/OverviewInteractive";
export const dynamic = "force-dynamic";
export default async function DashboardOverviewPage() {
  const { t, formatNumber } = await getServerI18n();
  const displayStatus = (value: string) => ["monthly","yearly","annual"].includes(value) ? t(`customer.status.${value}`) : value;

    const ctx = await getAuthContext();
    if (ctx?.user.systemRole === "operator") redirect("/app/admin");
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const wsId = ctx.workspace.id;
    const [{ plan }, usage] = await Promise.all([getWorkspaceEntitlements(wsId), getPublishingUsage(wsId)]);
    const [wsSocials, wsPosts, wsJobs, wsMetrics, [agentCfg], wsAgentActions] = await Promise.all([
        db.find(socialAccounts, eq("workspaceId", wsId), {}),
        db.find(posts, eq("workspaceId", wsId), { sort: { createdAt: -1 } }),
        db.find(publishingJobs, eq("workspaceId", wsId), {}),
        db.find(analyticsSnapshots, { workspaceId: wsId, isSampleData: false }, {}),
        db.find(agentConfigurations, eq("workspaceId", wsId), {}),
        db.find(agentActions, eq("workspaceId", wsId), { sort: { createdAt: -1 } }),
    ]);
    const connectedChannels = wsSocials.filter((s) => s.status === "connected" && s.integrationMode === "customer_credentials").length;
    const scheduledCount = wsPosts.filter((p) => p.status === "scheduled").length;
    const pendingApprovals = wsPosts.filter((p) => p.status === "pending_approval").length;
    const completedJobs = wsJobs.filter((j) => j.status === "completed").length;
    const finishedJobs = wsJobs.filter((j) => j.status === "completed" || j.status === "failed").length;
    const successRate = finishedJobs > 0 ? formatNumber(completedJobs / finishedJobs, { style: "percent", maximumFractionDigits: 0 }) : t("customer.text.5");
    const totalAudience = wsSocials.reduce((acc, s) => acc + s.followersCount, 0);
    const kpis = [
        {
            label: t("customer.text.6"),
            value: `${formatNumber(connectedChannels)} / ${formatNumber(plan.maxChannels)}`,
            sub: t("customer.followers", { count: formatNumber(totalAudience) }),
            accent: "text-cyan-400",
        },
        {
            label: t("customer.text.7"),
            value: `${formatNumber(usage.used)} / ${formatNumber(plan.maxPostsPerMonth)}`,
            sub: t("customer.successRate", { rate: successRate }),
            accent: "text-emerald-400",
        },
        {
            label: t("customer.text.8"),
            value: t("customer.queuedReview", { queued: formatNumber(scheduledCount), review: formatNumber(pendingApprovals) }),
            sub: t("customer.text.9"),
            accent: "text-violet-400",
        },
        {
            label: t("customer.text.10"),
            value: ctx.workspace.aiBillingMode === "byok"
                ? t("customer.text.11")
                : t("customer.credits", { count: formatNumber(ctx.workspace.aiCreditsBalance) }),
            sub: `${plan.name} (${displayStatus(ctx.workspace.billingCycle)})`,
            accent: "text-amber-400",
        },
    ];
    return (<div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t("customer.text.12")}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
            {t("customer.text.13")}{" "} <strong>{ctx.activeBrand?.name}</strong> {t("customer.text.14")}{" "}
            <strong>{ctx.workspace.name}</strong>
          </p>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (<div key={kpi.label} className="surface-card rounded-3xl p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {kpi.label}
            </div>
            <div className={`mt-2 text-2xl font-extrabold ${kpi.accent}`}>{kpi.value}</div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">{kpi.sub}</div>
          </div>))}
      </div>

      <OverviewInteractive metrics={wsMetrics.map((m) => ({
            dateLabel: m.dateLabel,
            platform: m.platform,
            impressions: m.impressions,
            engagements: m.engagements,
            clicks: m.clicks,
            followers: m.followers,
        }))} posts={wsPosts.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            platforms: p.platforms,
            scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
            publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
            createdByAgent: p.createdByAgent,
        }))} agentActions={wsAgentActions.map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            status: a.status,
            actionType: a.actionType,
        }))} agentMode={plan.autopilotEnabled ? agentCfg?.mode || "manual" : "manual"} agentPaused={!plan.autopilotEnabled || (agentCfg?.isPaused ?? false)}/>
    </div>);
}
