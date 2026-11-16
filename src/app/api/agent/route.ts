import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentConfigurations, agentActions, notifications, auditLogs } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { savePost } from "@/lib/post-workflow";
import { WorkflowError, canApprove } from "@/lib/post-policy";
import { generateWeeklyPlan } from "@/lib/ai-engine";
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx || !ctx.workspace || !ctx.user || !ctx.activeBrand) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await req.json();
        const action = body.action as string;
        if (ctx.memberRole === "viewer") throw new WorkflowError("Your role cannot modify agent settings or plans.", 403);
        if (action === "update_config") {
            const requestedMode = String(body.mode || "assisted");
            if (requestedMode === "autopilot") return NextResponse.json({ error: "Recurring autonomous planning is not implemented. Generate and review plans manually." }, { status: 501 });
            if (!["manual", "assisted"].includes(requestedMode)) throw new WorkflowError("Invalid agent mode.");
            const [updated] = await db.update(agentConfigurations, eq("workspaceId", ctx.workspace.id), {
                mode: requestedMode,
                isPaused: body.isPaused !== undefined ? Boolean(body.isPaused) : undefined,
                maxPostsPerWeek: body.maxPostsPerWeek !== undefined ? Math.min(28, Math.max(1, Number(body.maxPostsPerWeek))) : undefined,
                allowedPlatforms: Array.isArray(body.allowedPlatforms) ? body.allowedPlatforms : undefined,
                requireApprovalForPromotions: body.requireApprovalForPromotions !== undefined ? Boolean(body.requireApprovalForPromotions) : undefined,
                currentStrategy: body.currentStrategy !== undefined ? String(body.currentStrategy) : undefined,
                objectives: Array.isArray(body.objectives) ? body.objectives : undefined,
                updatedAt: new Date(),
            });
            await db.insert(auditLogs, {
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
            const [current] = await db.find(agentConfigurations, eq("workspaceId", ctx.workspace.id), {});
            const nextPaused = current ? !current.isPaused : true;
            const [updated] = await db.update(agentConfigurations, eq("workspaceId", ctx.workspace.id), { isPaused: nextPaused, updatedAt: new Date() });
            await db.insert(auditLogs, {
                workspaceId: ctx.workspace.id,
                actorEmail: ctx.user.email,
                action: nextPaused ? "agent.paused" : "agent.resumed",
                resourceType: "agent_configuration",
                resourceId: String(updated?.id || ""),
            });
            return NextResponse.json({ ok: true, config: updated });
        }
        if (action === "generate_plan") {
            const [configuration] = await db.find(agentConfigurations, eq("workspaceId", ctx.workspace.id));
            if (!configuration) throw new WorkflowError("Agent configuration not found.", 404);
            if (configuration.isPaused) throw new WorkflowError("Resume planning before generating a weekly plan.", 409);
            const { weeklyPlan, meta } = await generateWeeklyPlan({
                workspaceId: ctx.workspace.id, userId: ctx.user.id, brandName: ctx.activeBrand.name,
                description: ctx.activeBrand.description, audience: ctx.activeBrand.targetAudience,
                contentPillars: ctx.activeBrand.contentPillars, objectives: configuration.objectives,
                platforms: configuration.allowedPlatforms, maxPostsPerWeek: configuration.maxPostsPerWeek,
            });
            const result = await db.transaction(async tx => {
            const [updated] = await tx.update(agentConfigurations, eq("workspaceId", ctx.workspace.id), {
                weeklyPlan,
                updatedAt: new Date(),
            });
            const [loggedAction] = await tx.insert(agentActions, {
                workspaceId: ctx.workspace.id,
                brandId: ctx.activeBrand.id,
                actionType: "strategy_update",
                title: "Generated weekly content plan",
                description: `${weeklyPlan.length} proposed slots for ${configuration.allowedPlatforms.join(", ")}. No posts have been drafted or approved.`,
                reasoning: "Generated from the supplied brand brief and configured objectives; review before creating posts.",
                status: "executed",
            });
            await tx.insert(auditLogs, {
                workspaceId: ctx.workspace.id,
                actorEmail: "agent@postif-ai.system",
                action: "agent.weekly_plan_generated",
                resourceType: "agent_action",
                resourceId: String(loggedAction.id),
            });
            return { config: updated, actionRecord: loggedAction };
            });
            return NextResponse.json({ ok: true, ...result, meta });
        }
        if (action === "resolve_proposal") {
            const actionId = Number(body.actionId);
            const decision = body.decision === "rejected" ? "rejected" : "approved";
            const [item] = await db.find(agentActions, and(eq("id", actionId), eq("workspaceId", ctx.workspace.id)), {});
            if (!item) {
                return NextResponse.json({ error: "Agent action not found" }, { status: 404 });
            }
            if (!canApprove(ctx.memberRole))
                throw new WorkflowError("Approval permission required.", 403);
            if (item.targetPostId) {
                await savePost({ workspaceId: ctx.workspace.id, userId: ctx.user.id, email: ctx.user.email, role: ctx.memberRole, brandId: ctx.activeBrand.id }, { status: decision === "approved" ? "approved" : "cancelled" }, item.targetPostId);
            }
            const [updated] = await db.update(agentActions, eq("id", actionId), { status: decision === "approved" ? "executed" : "rejected" });
            await db.insert(notifications, {
                workspaceId: ctx.workspace.id,
                userId: ctx.user.id,
                type: "agent_action",
                title: `Agent proposal ${decision}`,
                message: `'${item.title}' was ${decision} by ${ctx.user.name}.`,
                actionHref: "/app/agent",
            });
            await db.insert(auditLogs, {
                workspaceId: ctx.workspace.id,
                actorEmail: ctx.user.email,
                action: `agent.proposal_${decision}`,
                resourceType: "agent_action",
                resourceId: String(actionId),
            });
            return NextResponse.json({ ok: true, item: updated });
        }
        return NextResponse.json({ error: "Invalid agent action" }, { status: 400 });
    }
    catch (err) {
        if (err instanceof WorkflowError)
            return NextResponse.json({ error: err.message }, { status: err.status });
        console.error("Agent API error:", err);
        return NextResponse.json({ error: "Agent operation failed" }, { status: 500 });
    }
}
