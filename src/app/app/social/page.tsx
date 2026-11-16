import { getServerI18n } from "@/i18n/server";
import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { socialLifecycleStatuses } from "@/db/social-lifecycle-schema";
import { oauthCallbackUrl } from "@/lib/social-oauth-provider";
import { SocialAccountsClient } from "@/components/SocialAccountsClient";
export const dynamic = "force-dynamic";
export default async function SocialAccountsPage() {
  const { t } = await getServerI18n();

    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const { plan } = await getWorkspaceEntitlements(ctx.workspace.id);
    const accounts = await db.find(socialAccounts, eq("workspaceId", ctx.workspace.id), {});
    const lifecycle = await db.find(socialLifecycleStatuses, { workspaceId: ctx.workspace.id });
    let callbackOrigin: string | null = null;
    try { callbackOrigin = new URL(oauthCallbackUrl("x")).origin; } catch { /* Manual token connections remain available without OAuth configuration. */ }
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("customer.text.100")}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          {t("customer.text.101")}
        </p>
      </div>

      <SocialAccountsClient accounts={accounts.map((a) => ({
            id: a.id,
            platform: a.platform,
            accountName: a.accountName,
            handle: a.handle,
            accountType: a.accountType,
            status: a.status,
            integrationMode: a.integrationMode,
            permissions: a.permissions,
            rateLimitRemaining: a.rateLimitRemaining,
            rateLimitMax: a.rateLimitMax,
            followersCount: a.followersCount,
            lastError: a.lastError,
            renewalStatus: lifecycle.find(s => s.socialAccountId === a.id)?.renewalStatus,
            renewalMessage: lifecycle.find(s => s.socialAccountId === a.id)?.renewalMessage,
            analyticsStatus: lifecycle.find(s => s.socialAccountId === a.id)?.analyticsStatus,
            analyticsMessage: lifecycle.find(s => s.socialAccountId === a.id)?.analyticsMessage,
        }))} maxChannels={plan.maxChannels} planName={plan.name} callbackOrigin={callbackOrigin} canManage={["owner", "admin"].includes(ctx.memberRole)}/>
    </div>);
}
