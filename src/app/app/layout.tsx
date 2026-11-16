import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { notifications, posts, workspaceMembers } from "@/db/schema";
import Link from "next/link";
import { VerifyEmailNotice } from "@/components/VerifyEmailNotice";
import { and, or, isNull, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
export const dynamic = "force-dynamic";
export default async function ApplicationLayout({ children, }: {
    children: React.ReactNode;
}) {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.user || !ctx.workspace) {
        redirect("/login");
    }
    const wsNotifications = await db.find(notifications, and(eq("workspaceId", ctx.workspace.id), or(eq("userId", ctx.user.id), isNull("userId"))), { limit: 12, sort: { createdAt: -1 } });
    const wsPosts = await db.find(posts, eq("workspaceId", ctx.workspace.id), {});
    const pendingApprovalsCount = wsPosts.filter((p) => p.status === "pending_approval").length;
    const invitations = await db.find(workspaceMembers, { invitedEmail: ctx.user.email, status: "invited" }, { limit: 1 });
    return (<AppShell user={{
            id: ctx.user.id,
            name: ctx.user.name,
            email: ctx.user.email,
            systemRole: ctx.user.systemRole,
        }} workspace={{
            id: ctx.workspace.id,
            name: ctx.workspace.name,
            planSlug: ctx.workspace.planSlug,
            aiBillingMode: ctx.workspace.aiBillingMode,
            aiCreditsBalance: ctx.workspace.aiCreditsBalance,
        }} workspaces={ctx.workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            planSlug: w.planSlug,
            aiBillingMode: w.aiBillingMode,
            aiCreditsBalance: w.aiCreditsBalance,
        }))} activeBrandName={ctx.activeBrand?.name || ctx.workspace.name} memberRole={ctx.memberRole} notifications={wsNotifications.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            isRead: n.isRead,
            actionHref: n.actionHref,
            createdAt: n.createdAt.toISOString(),
        }))} pendingApprovalsCount={pendingApprovalsCount}>
      {!ctx.user.emailVerified && <VerifyEmailNotice />}
      {invitations.length > 0 && <Link href="/app/workspaces" className="mb-5 block rounded-xl border border-cyan-500/30 p-4 text-sm text-cyan-300">You have a workspace invitation. Review invitations.</Link>}
      {children}
    </AppShell>);
}
