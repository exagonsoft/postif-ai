import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { workspaceMembers } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";
import { WorkspacesClient } from "@/components/WorkspacesClient";
export const dynamic = "force-dynamic";
export default async function BrandsWorkspacesPage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const plan = getPlanDefinition(ctx.workspace.planSlug);
    const members = await db.find(workspaceMembers, eq("workspaceId", ctx.workspace.id), {});
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Brands, Agencies & Team Governance
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Manage multi-brand profiles, role-based access control, and tenant data exports.
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
        }))} maxBrands={plan.maxBrands} planName={plan.name} currentRole={ctx.memberRole}/>
    </div>);
}
