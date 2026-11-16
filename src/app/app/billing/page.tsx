import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { aiConfigurations, aiUsageRecords } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { BillingClient } from "@/components/BillingClient";
import { billingSubscriptions } from "@/db/billing-schema";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { getBillingReadiness } from "@/lib/stripe";
export const dynamic = "force-dynamic";
export default async function BillingUsagePage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const [[aiCfg], usage, [subscription], entitlements] = await Promise.all([
        db.find(aiConfigurations, eq("workspaceId", ctx.workspace.id), {}),
        db.find(aiUsageRecords, eq("workspaceId", ctx.workspace.id), { limit: 15, sort: { createdAt: -1 } }),
        db.find(billingSubscriptions, { workspaceId: ctx.workspace.id }),
        getWorkspaceEntitlements(ctx.workspace.id),
    ]);
    const readiness = getBillingReadiness();
    const mode = entitlements.plan.allowsConfigurableAiMode ? ctx.workspace.aiBillingMode : entitlements.plan.defaultAiMode;
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

      <BillingClient currentPlanSlug={entitlements.plan.slug} billingCycle={ctx.workspace.billingCycle} aiBillingMode={mode} creditsBalance={entitlements.paid ? ctx.workspace.aiCreditsBalance : 0} creditsAllowance={entitlements.plan.includedMonthlyCredits} keyLast4={aiCfg?.keyLast4 || null} keyValidated={aiCfg?.keyValidated ?? false} preferredModel={aiCfg?.preferredModel || "gpt-4o-mini"}
        subscription={{ status: subscription?.status || "inactive", paidThrough: subscription?.paidThrough?.toISOString() || null, cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false, hasCustomer: Boolean(subscription?.stripeCustomerId), canChange: subscription?.status === "active" && entitlements.paid, pendingPlanSlug: subscription?.pendingPlanSlug || null, pendingInterval: subscription?.pendingInterval || null, pendingEffectiveAt: subscription?.pendingEffectiveAt?.toISOString() || null }}
        billingReady={readiness.ready} billingMissing={[...readiness.missing, ...readiness.invalid]}
        isOwner={ctx.memberRole === "owner"} allowsConfigurableAiMode={entitlements.plan.allowsConfigurableAiMode} defaultAiMode={entitlements.plan.defaultAiMode}
        usageRecords={usage.map((u) => ({
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
