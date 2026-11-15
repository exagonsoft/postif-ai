import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { agentConfigurations, agentActions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";
import { AgentWorkspaceClient } from "@/components/AgentWorkspaceClient";

export const dynamic = "force-dynamic";

export default async function AIMarketingAgentPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    redirect("/login");
  }

  const plan = getPlanDefinition(ctx.workspace.planSlug);

  const [[config], actions] = await Promise.all([
    db
      .select()
      .from(agentConfigurations)
      .where(eq(agentConfigurations.workspaceId, ctx.workspace.id)),
    db
      .select()
      .from(agentActions)
      .where(eq(agentActions.workspaceId, ctx.workspace.id))
      .orderBy(desc(agentActions.createdAt)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Autonomous AI Marketing Agent
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Move from individual post creation to coordinated, rule-bounded marketing automation.
        </p>
      </div>

      <AgentWorkspaceClient
        config={{
          id: config?.id || 1,
          mode: config?.mode || "assisted",
          isPaused: config?.isPaused ?? false,
          maxPostsPerWeek: config?.maxPostsPerWeek ?? 7,
          allowedPlatforms: config?.allowedPlatforms || ["linkedin", "x", "instagram"],
          requireApprovalForPromotions: config?.requireApprovalForPromotions ?? true,
          objectives: config?.objectives || [],
          currentStrategy: config?.currentStrategy || "",
          weeklyPlan: config?.weeklyPlan || [],
        }}
        actions={actions.map((a) => ({
          id: a.id,
          actionType: a.actionType,
          title: a.title,
          description: a.description,
          reasoning: a.reasoning,
          status: a.status,
          targetPostId: a.targetPostId,
          createdAt: a.createdAt.toISOString(),
        }))}
        autopilotAllowed={plan.autopilotEnabled}
      />
    </div>
  );
}
