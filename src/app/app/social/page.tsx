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
import { managedSocialAvailability } from "@/lib/social-managed-config";
import { managedSocialErrorCode, readManagedSelection } from "@/lib/social-managed-oauth";
import type { ManagedSocialSelection } from "@/lib/social-managed-types";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
export const dynamic = "force-dynamic";
export default async function SocialAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getServerI18n();

    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const { plan } = await getWorkspaceEntitlements(ctx.workspace.id);
    const query = await searchParams;
    const canManage = ["owner", "admin"].includes(ctx.memberRole);
    let managedSelection: ManagedSocialSelection | null = null;
    const safeErrors = ["NOT_CONFIGURED", "APPROVAL_REQUIRED", "AUTHORIZATION_DENIED", "AUTHORIZATION_FAILED", "STATE_INVALID", "PERMISSION_MISSING", "ACCOUNT_UNSUPPORTED", "CHANNEL_LIMIT", "PROVIDER_UNAVAILABLE", "TOKEN_EXPIRED", "MANAGED_APP_CHANGED", "DISCOVERY_INCOMPLETE", "FORBIDDEN", "INVALID_REQUEST"];
    let managedError = typeof query.social_error === "string" ? (safeErrors.includes(query.social_error) ? query.social_error : "AUTHORIZATION_FAILED") : null;
    if (canManage && (query.social_provider !== undefined || query.social_selection !== undefined)) {
      if (typeof query.social_provider === "string" && Object.hasOwn(SOCIAL_PLATFORM_SPECS, query.social_provider) &&
          typeof query.social_selection === "string" && query.social_selection.length > 0 && query.social_selection.length <= 4096) {
        try {
          managedSelection = await readManagedSelection({ workspaceId: ctx.workspace.id, userId: ctx.user.id, platform: query.social_provider, ticket: query.social_selection });
        } catch (error) { managedError = managedSocialErrorCode(error); }
      } else managedError = "INVALID_REQUEST";
    }
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
          {t("social.managed.subtitle")}
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
        }))} maxChannels={plan.maxChannels} planName={plan.name} callbackOrigin={callbackOrigin} canManage={canManage} managedAvailability={managedSocialAvailability()} managedSelection={managedSelection} managedError={managedError}/>
    </div>);
}
