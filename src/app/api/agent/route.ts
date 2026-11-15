import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agentConfigurations,
  agentActions,
  posts,
  publishingJobs,
  notifications,
  auditLogs,
  WeeklyPlanSlot,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace || !ctx.user || !ctx.activeBrand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "update_config") {
      const requestedMode = String(body.mode || "assisted");
      const plan = getPlanDefinition(ctx.workspace.planSlug);

      if (requestedMode === "autopilot" && !plan.autopilotEnabled) {
        return NextResponse.json(
          {
            error: `Autopilot Mode requires Pro BYOK, Pro AI, or Agency subscription (current plan: ${plan.name}).`,
          },
          { status: 403 }
        );
      }

      const [updated] = await db
        .update(agentConfigurations)
        .set({
          mode: requestedMode,
          isPaused:
            body.isPaused !== undefined ? Boolean(body.isPaused) : undefined,
          maxPostsPerWeek:
            body.maxPostsPerWeek !== undefined
              ? Math.min(28, Math.max(1, Number(body.maxPostsPerWeek)))
              : undefined,
          allowedPlatforms: Array.isArray(body.allowedPlatforms)
            ? body.allowedPlatforms
            : undefined,
          requireApprovalForPromotions:
            body.requireApprovalForPromotions !== undefined
              ? Boolean(body.requireApprovalForPromotions)
              : undefined,
          currentStrategy:
            body.currentStrategy !== undefined
              ? String(body.currentStrategy)
              : undefined,
          objectives: Array.isArray(body.objectives) ? body.objectives : undefined,
          updatedAt: new Date(),
        })
        .where(eq(agentConfigurations.workspaceId, ctx.workspace.id))
        .returning();

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: "agent.config_updated",
        resourceType: "agent_configuration",
        resourceId: String(updated?.id || ctx.workspace.id),
        metadata: {
          mode: requestedMode,
          isPaused: body.isPaused,
        },
      });

      return NextResponse.json({ ok: true, config: updated });
    }

    if (action === "toggle_pause") {
      const [current] = await db
        .select()
        .from(agentConfigurations)
        .where(eq(agentConfigurations.workspaceId, ctx.workspace.id));
      const nextPaused = current ? !current.isPaused : true;

      const [updated] = await db
        .update(agentConfigurations)
        .set({ isPaused: nextPaused, updatedAt: new Date() })
        .where(eq(agentConfigurations.workspaceId, ctx.workspace.id))
        .returning();

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: nextPaused ? "agent.paused" : "agent.resumed",
        resourceType: "agent_configuration",
        resourceId: String(updated?.id || ""),
      });

      return NextResponse.json({ ok: true, config: updated });
    }

    if (action === "generate_plan") {
      const pillars =
        ctx.activeBrand.contentPillars.length > 0
          ? ctx.activeBrand.contentPillars
          : ["Product Insights", "Educational Playbook", "Customer Outcomes", "Community"];

      const newPlan: WeeklyPlanSlot[] = [
        {
          day: "Monday",
          platform: "linkedin",
          pillar: pillars[0],
          concept: `Executive breakdown on ${ctx.activeBrand.name}'s latest workflow benchmarks`,
          status: "drafted",
        },
        {
          day: "Tuesday",
          platform: "x",
          pillar: pillars[1 % pillars.length],
          concept: `5-step tactical thread tailored for ${ctx.activeBrand.targetAudience || "industry peers"}`,
          status: "approved",
        },
        {
          day: "Wednesday",
          platform: "instagram",
          pillar: pillars[2 % pillars.length],
          concept: `Visual carousel showcasing measurable customer results`,
          status: "planned",
        },
        {
          day: "Thursday",
          platform: "linkedin",
          pillar: pillars[3 % pillars.length],
          concept: `Deep-dive architecture & behind-the-scenes lessons learned`,
          status: "planned",
        },
        {
          day: "Friday",
          platform: "x",
          pillar: pillars[0],
          concept: `Interactive community question & weekend resource roundup`,
          status: "planned",
        },
      ];

      const [updated] = await db
        .update(agentConfigurations)
        .set({
          weeklyPlan: newPlan,
          updatedAt: new Date(),
        })
        .where(eq(agentConfigurations.workspaceId, ctx.workspace.id))
        .returning();

      const [loggedAction] = await db
        .insert(agentActions)
        .values({
          workspaceId: ctx.workspace.id,
          brandId: ctx.activeBrand.id,
          actionType: "strategy_update",
          title: "Generated refreshed 5-day multi-platform publishing plan",
          description: `Mapped ${pillars.length} brand content pillars across LinkedIn, X, and Instagram within weekly safety limits.`,
          reasoning: "Aligned with brand voice, audience segments, and top-performing historical formats.",
          status: "executed",
        })
        .returning();

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: "agent@postif-ai.system",
        action: "agent.weekly_plan_generated",
        resourceType: "agent_action",
        resourceId: String(loggedAction.id),
      });

      return NextResponse.json({ ok: true, config: updated, actionRecord: loggedAction });
    }

    if (action === "resolve_proposal") {
      const actionId = Number(body.actionId);
      const decision = body.decision === "rejected" ? "rejected" : "approved";

      const [item] = await db
        .select()
        .from(agentActions)
        .where(
          and(
            eq(agentActions.id, actionId),
            eq(agentActions.workspaceId, ctx.workspace.id)
          )
        );

      if (!item) {
        return NextResponse.json({ error: "Agent action not found" }, { status: 404 });
      }

      const [updated] = await db
        .update(agentActions)
        .set({ status: decision === "approved" ? "executed" : "rejected" })
        .where(eq(agentActions.id, actionId))
        .returning();

      if (decision === "approved" && item.targetPostId) {
        const scheduleTime = new Date(Date.now() + 18 * 3600 * 1000);
        const [post] = await db
          .update(posts)
          .set({
            status: "scheduled",
            scheduledAt: scheduleTime,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, item.targetPostId))
          .returning();

        if (post) {
          for (const platform of post.platforms) {
            await db
              .insert(publishingJobs)
              .values({
                workspaceId: ctx.workspace.id,
                postId: post.id,
                platform,
                status: "queued",
                attempts: 0,
                maxAttempts: 3,
                scheduledFor: scheduleTime,
                idempotencyKey: `agent-job-${post.id}-${platform}`,
              })
              .onConflictDoNothing();
          }
        }
      }

      await db.insert(notifications).values({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        type: "agent_action",
        title: `Agent proposal ${decision}`,
        message: `'${item.title}' was ${decision} by ${ctx.user.name}.`,
        actionHref: "/app/agent",
      });

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: `agent.proposal_${decision}`,
        resourceType: "agent_action",
        resourceId: String(actionId),
      });

      return NextResponse.json({ ok: true, item: updated });
    }

    return NextResponse.json({ error: "Invalid agent action" }, { status: 400 });
  } catch (err) {
    console.error("Agent API error:", err);
    return NextResponse.json({ error: "Agent operation failed" }, { status: 500 });
  }
}
