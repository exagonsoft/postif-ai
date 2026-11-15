import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  users,
  workspaces,
  socialAccounts,
  publishingJobs,
  aiUsageRecords,
  featureFlags,
  auditLogs,
} from "@/db/schema";
import { desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";
import { AdminConsoleClient } from "@/components/AdminConsoleClient";

export const dynamic = "force-dynamic";

export default async function OperatorAdminConsolePage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.user || ctx.user.systemRole !== "operator") {
    redirect("/app");
  }

  const [allUsers, allWorkspaces, allSocials, allJobs, allUsage, flags, logs] =
    await Promise.all([
      db.select().from(users),
      db.select().from(workspaces),
      db.select().from(socialAccounts),
      db.select().from(publishingJobs),
      db.select().from(aiUsageRecords),
      db.select().from(featureFlags),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(20),
    ]);

  const estimatedMrr = allWorkspaces.reduce((acc, w) => {
    const plan = SUBSCRIPTION_PLANS[w.planSlug as keyof typeof SUBSCRIPTION_PLANS];
    return acc + (plan?.monthlyPrice || 0);
  }, 0);

  const failedJobsCount = allJobs.filter((j) => j.status === "failed").length;
  const totalCreditsConsumed = allUsage.reduce((acc, u) => acc + u.creditsUsed, 0);

  return (
    <div className="space-y-8">
      <div>
        <span className="rounded-full bg-rose-500/20 px-3 py-1 text-[11px] font-bold uppercase text-rose-300">
          ExagonSoft Internal Operator Console
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Platform Telemetry, Billing & Governance
        </h1>
      </div>

      {/* Platform Operator KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card rounded-3xl p-5">
          <div className="text-xs font-bold uppercase text-[var(--text-muted)]">
            Users & Workspaces
          </div>
          <div className="mt-2 text-2xl font-extrabold text-cyan-400">
            {allUsers.length} Users • {allWorkspaces.length} Tenants
          </div>
        </div>

        <div className="surface-card rounded-3xl p-5">
          <div className="text-xs font-bold uppercase text-[var(--text-muted)]">
            Estimated Active MRR
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400">
            ${estimatedMrr}/mo
          </div>
        </div>

        <div className="surface-card rounded-3xl p-5">
          <div className="text-xs font-bold uppercase text-[var(--text-muted)]">
            AI Requests & Credits
          </div>
          <div className="mt-2 text-2xl font-extrabold text-violet-400">
            {allUsage.length} Calls • {totalCreditsConsumed} Credits
          </div>
        </div>

        <div className="surface-card rounded-3xl p-5">
          <div className="text-xs font-bold uppercase text-[var(--text-muted)]">
            Channels & Job Health
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400">
            {allSocials.length} Channels • {failedJobsCount} Failed Jobs
          </div>
        </div>
      </div>

      <AdminConsoleClient
        flags={flags.map((f) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          description: f.description,
          enabled: f.enabled,
        }))}
        auditLogs={logs.map((l) => ({
          id: l.id,
          actorEmail: l.actorEmail,
          action: l.action,
          resourceType: l.resourceType,
          resourceId: l.resourceId,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
