import { getServerI18n } from "@/i18n/server";
import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { WorkspacesClient } from "@/components/WorkspacesClient";
export const dynamic = "force-dynamic";
export default async function BrandsWorkspacesPage() {
  const { t } = await getServerI18n();

    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const { plan, features } = await getWorkspaceEntitlements(ctx.workspace.id);
    const members = await db.find(workspaceMembers, eq("workspaceId", ctx.workspace.id), {});
    const invites = await db.find(workspaceMembers, { invitedEmail: ctx.user.email, status: "invited" }, { limit: 50 });
    const invitedWorkspaces = invites.length ? await db.find(workspaces, { id: { $in: invites.map(invite => invite.workspaceId) } }) : [];
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("customer.text.105")}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          {t("customer.text.106")}
        </p>
      </div>

      <WorkspacesClient brands={ctx.brands.map((b) => ({
            id: b.id,
            name: b.name,
            websiteUrl: b.websiteUrl,
            industry: b.industry,
            tone: b.tone,
            contentPillars: b.contentPillars,
        }))} members={members.map((m) => ({
            id: m.id,
            invitedEmail: m.invitedEmail,
            memberName: m.memberName,
            role: m.role,
            status: m.status,
        }))} maxBrands={plan.maxBrands} planName={plan.name} currentRole={ctx.memberRole} teamEnabled={features.team}
        invitations={invites.map(invite => ({ id: invite.id, workspaceName: invitedWorkspaces.find(workspace => workspace.id === invite.workspaceId)?.name || t("customer.text.15"), role: invite.role }))}/>
    </div>);
}
