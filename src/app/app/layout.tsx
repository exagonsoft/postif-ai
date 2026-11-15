import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { notifications, posts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.user || !ctx.workspace) {
    redirect("/login");
  }

  const wsNotifications = await db
    .select()
    .from(notifications)
    .where(eq(notifications.workspaceId, ctx.workspace.id))
    .orderBy(desc(notifications.createdAt))
    .limit(12);

  const wsPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.workspaceId, ctx.workspace.id));

  const pendingApprovalsCount = wsPosts.filter(
    (p) => p.status === "pending_approval"
  ).length;

  return (
    <AppShell
      user={{
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        systemRole: ctx.user.systemRole,
      }}
      isDemoFallback={ctx.isDemoFallback}
      workspace={{
        id: ctx.workspace.id,
        name: ctx.workspace.name,
        planSlug: ctx.workspace.planSlug,
        aiBillingMode: ctx.workspace.aiBillingMode,
        aiCreditsBalance: ctx.workspace.aiCreditsBalance,
      }}
      workspaces={ctx.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        planSlug: w.planSlug,
        aiBillingMode: w.aiBillingMode,
        aiCreditsBalance: w.aiCreditsBalance,
      }))}
      activeBrandName={ctx.activeBrand?.name || ctx.workspace.name}
      memberRole={ctx.memberRole}
      notifications={wsNotifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        actionHref: n.actionHref,
        createdAt: n.createdAt.toISOString(),
      }))}
      pendingApprovalsCount={pendingApprovalsCount}
    >
      {children}
    </AppShell>
  );
}
