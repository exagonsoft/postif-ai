import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";
import { SocialAccountsClient } from "@/components/SocialAccountsClient";

export const dynamic = "force-dynamic";

export default async function SocialAccountsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    redirect("/login");
  }

  const plan = getPlanDefinition(ctx.workspace.planSlug);
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.workspaceId, ctx.workspace.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Social Media Integrations
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Connect, audit permissions, monitor rate limits, and refresh social publishing adapters.
        </p>
      </div>

      <SocialAccountsClient
        accounts={accounts.map((a) => ({
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
        }))}
        maxChannels={plan.maxChannels}
        planName={plan.name}
      />
    </div>
  );
}
