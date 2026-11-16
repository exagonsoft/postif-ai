import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { aiConfigurations, aiUsageRecords } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { BillingClient } from "@/components/BillingClient";
export const dynamic = "force-dynamic";
export default async function BillingUsagePage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const [[aiCfg], usage] = await Promise.all([
        db.find(aiConfigurations, eq("workspaceId", ctx.workspace.id), {}),
        db.find(aiUsageRecords, eq("workspaceId", ctx.workspace.id), { limit: 15, sort: { createdAt: -1 } }),
    ]);
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Billing, Subscriptions & AI Provider
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Manage your platform tier independently from your OpenAI BYOK or Managed AI credit
          consumption model.
        </p>
      </div>

      <BillingClient currentPlanSlug={ctx.workspace.planSlug} billingCycle={ctx.workspace.billingCycle} aiBillingMode={ctx.workspace.aiBillingMode} creditsBalance={ctx.workspace.aiCreditsBalance} creditsAllowance={ctx.workspace.aiCreditsMonthlyAllowance} keyLast4={aiCfg?.keyLast4 || null} keyValidated={aiCfg?.keyValidated ?? false} preferredModel={aiCfg?.preferredModel || "gpt-4o-mini"} usageRecords={usage.map((u) => ({
            id: u.id,
            operation: u.operation,
            model: u.model,
            billingMode: u.billingMode,
            creditsUsed: u.creditsUsed,
            tokensEstimate: u.tokensEstimate,
            executionSource: u.executionSource,
            createdAt: u.createdAt.toISOString(),
        }))}/>
    </div>);
}
