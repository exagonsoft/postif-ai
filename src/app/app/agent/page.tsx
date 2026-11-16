import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { agentConfigurations, agentActions } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { AgentWorkspaceClient } from "@/components/AgentWorkspaceClient";
export const dynamic = "force-dynamic";
export default async function AIMarketingAgentPage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const [[config], actions] = await Promise.all([
        db.find(agentConfigurations, eq("workspaceId", ctx.workspace.id), {}),
        db.find(agentActions, eq("workspaceId", ctx.workspace.id), { sort: { createdAt: -1 } }),
    ]);
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          AI Marketing Planner
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Generate a plan from your brand brief, then create and review posts. Recurring autonomous planning is not available.
        </p>
      </div>

      <AgentWorkspaceClient config={{
            id: config?.id || 0,
            mode: config?.mode || "manual",
            isPaused: config?.isPaused ?? false,
            maxPostsPerWeek: config?.maxPostsPerWeek ?? 7,
            allowedPlatforms: config?.allowedPlatforms || [],
            requireApprovalForPromotions: config?.requireApprovalForPromotions ?? true,
            objectives: config?.objectives || [],
            currentStrategy: config?.currentStrategy || "",
            weeklyPlan: config?.weeklyPlan || [],
        }} actions={actions.map((a) => ({
            id: a.id,
            actionType: a.actionType,
            title: a.title,
            description: a.description,
            reasoning: a.reasoning,
            status: a.status,
            targetPostId: a.targetPostId,
            createdAt: a.createdAt.toISOString(),
        }))}/>
    </div>);
}
