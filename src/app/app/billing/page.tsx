import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { aiConfigurations, aiUsageRecords } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { BillingClient } from "@/components/BillingClient";
import { billingSubscriptions, billingIntents } from "@/db/billing-schema";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { getBillingReadiness } from "@/lib/paypal";
import { getCatalogPlans } from "@/lib/billing-catalog";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function BillingUsagePage() {
    const { t } = await getServerI18n();
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const [[aiCfg], usage, [subscription], entitlements, plans] = await Promise.all([
        db.find(aiConfigurations, eq("workspaceId", ctx.workspace.id), {}),
        db.find(aiUsageRecords, eq("workspaceId", ctx.workspace.id), { limit: 15, sort: { createdAt: -1 } }),
        db.find(billingSubscriptions, { workspaceId: ctx.workspace.id }),
        getWorkspaceEntitlements(ctx.workspace.id),
        getCatalogPlans(),
    ]);
    const [pendingIntent] = subscription?.pendingIntentId ? await db.find(billingIntents, { id: subscription.pendingIntentId, workspaceId: ctx.workspace.id }) : [];
    const readiness = getBillingReadiness();
    const mode = entitlements.plan.allowsConfigurableAiMode ? ctx.workspace.aiBillingMode : entitlements.plan.defaultAiMode;
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("billing.title")}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          {t("billing.subtitle")}
        </p>
      </div>

      <BillingClient plans={plans} currentPlanSlug={entitlements.plan.slug} currentPlanVersionId={entitlements.plan.catalogVersionId || null} billingCycle={ctx.workspace.billingCycle} aiBillingMode={mode} creditsBalance={ctx.workspace.aiCreditsBalance} creditsAllowance={entitlements.plan.includedMonthlyCredits} keyLast4={aiCfg?.keyLast4 || null} keyValidated={aiCfg?.keyValidated ?? false} preferredModel={aiCfg?.preferredModel || "gpt-4o-mini"}
        subscription={{ status: subscription?.status || "inactive", paidThrough: subscription?.paidThrough?.toISOString() || null, cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false, hasCustomer: Boolean(subscription?.paypalSubscriptionId), canChange: subscription?.status === "ACTIVE" && entitlements.paid, pendingPlanSlug: subscription?.pendingPlanSlug || null, pendingInterval: subscription?.pendingInterval || null, pendingEffectiveAt: subscription?.pendingEffectiveAt?.toISOString() || null, pendingReplacement: Boolean(pendingIntent?.replacementPaymentKey) }}
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
