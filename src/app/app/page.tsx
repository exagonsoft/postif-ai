import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  socialAccounts,
  posts,
  publishingJobs,
  analyticsSnapshots,
  agentConfigurations,
  agentActions,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";
import { OverviewInteractive } from "@/components/OverviewInteractive";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    redirect("/login");
  }

  const wsId = ctx.workspace.id;
  const plan = getPlanDefinition(ctx.workspace.planSlug);

  const [wsSocials, wsPosts, wsJobs, wsMetrics, [agentCfg], wsAgentActions] =
    await Promise.all([
      db.select().from(socialAccounts).where(eq(socialAccounts.workspaceId, wsId)),
      db.select().from(posts).where(eq(posts.workspaceId, wsId)).orderBy(desc(posts.createdAt)),
      db.select().from(publishingJobs).where(eq(publishingJobs.workspaceId, wsId)),
      db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.workspaceId, wsId)),
      db.select().from(agentConfigurations).where(eq(agentConfigurations.workspaceId, wsId)),
      db
        .select()
        .from(agentActions)
        .where(eq(agentActions.workspaceId, wsId))
        .orderBy(desc(agentActions.createdAt)),
    ]);

  const connectedChannels = wsSocials.filter((s) => s.status === "connected").length;
  const scheduledCount = wsPosts.filter((p) => p.status === "scheduled").length;
  const pendingApprovals = wsPosts.filter((p) => p.status === "pending_approval").length;

  const completedJobs = wsJobs.filter((j) => j.status === "completed").length;
  const finishedJobs = wsJobs.filter(
    (j) => j.status === "completed" || j.status === "failed"
  ).length;
  const successRate =
    finishedJobs > 0 ? Math.round((completedJobs / finishedJobs) * 100) : 100;

  const totalAudience = wsSocials.reduce((acc, s) => acc + s.followersCount, 0);

  const kpis = [
    {
      label: "Connected Channels",
      value: `${connectedChannels} / ${plan.maxChannels}`,
      sub: `${totalAudience.toLocaleString()} combined followers`,
      accent: "text-cyan-400",
    },
    {
      label: "Published This Month",
      value: `${ctx.workspace.postsPublishedThisMonth} / ${plan.maxPostsPerMonth}`,
      sub: `${successRate}% job publishing success rate`,
      accent: "text-emerald-400",
    },
    {
      label: "Scheduled & Pending",
      value: `${scheduledCount} queued • ${pendingApprovals} review`,
      sub: "Persistent PostgreSQL queue",
      accent: "text-violet-400",
    },
    {
      label: "AI Engine & Plan",
      value:
        ctx.workspace.aiBillingMode === "byok"
          ? "BYOK OpenAI"
          : `${ctx.workspace.aiCreditsBalance} credits`,
      sub: `${plan.name} (${ctx.workspace.billingCycle})`,
      accent: "text-amber-400",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Command Center Overview
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
            Active Brand: <strong>{ctx.activeBrand?.name}</strong> • Workspace:{" "}
            <strong>{ctx.workspace.name}</strong>
          </p>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="surface-card rounded-3xl p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {kpi.label}
            </div>
            <div className={`mt-2 text-2xl font-extrabold ${kpi.accent}`}>{kpi.value}</div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <OverviewInteractive
        metrics={wsMetrics.map((m) => ({
          dateLabel: m.dateLabel,
          platform: m.platform,
          impressions: m.impressions,
          engagements: m.engagements,
          clicks: m.clicks,
          followers: m.followers,
        }))}
        posts={wsPosts.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          platforms: p.platforms,
          scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
          publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
          createdByAgent: p.createdByAgent,
        }))}
        agentActions={wsAgentActions.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          status: a.status,
          actionType: a.actionType,
        }))}
        agentMode={agentCfg?.mode || "assisted"}
        agentPaused={agentCfg?.isPaused ?? false}
      />
    </div>
  );
}
