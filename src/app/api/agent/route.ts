import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentConfigurations, agentActions, notifications, auditLogs } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { savePost } from "@/lib/post-workflow";
import { WorkflowError, canApprove } from "@/lib/post-policy";
import { generateWeeklyPlan } from "@/lib/ai-engine";
import { assertBrandEntitlement, assertFeature } from "@/lib/entitlements";
import { setRecurringPlanning } from "@/lib/recurring-planner";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 30;
const configurationInput = z.object({
    mode: z.enum(["manual", "assisted", "autopilot"]).default("assisted"),
    isPaused: z.boolean().optional(), recurringEnabled: z.boolean().optional(),
    intervalDays: z.number().int().min(1).max(28).default(7),
    maxPostsPerWeek: z.number().int().min(1).max(28).optional(),
    allowedPlatforms: z.array(z.string().refine(value => Object.hasOwn(SOCIAL_PLATFORM_SPECS, value))).min(1).max(8).optional(),
    currentStrategy: z.string().max(8000).optional(),
    objectives: z.array(z.string().max(500)).max(20).optional(),
});
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx || !ctx.workspace || !ctx.user || !ctx.activeBrand) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await req.json();
        const action = body.action as string;
        if (ctx.memberRole === "viewer") throw new WorkflowError("Your role cannot modify agent settings or plans.", 403);
        if (!["update_config", "toggle_pause"].includes(action)) {
            await assertFeature(ctx.workspace.id, "planning");
            await assertBrandEntitlement(ctx.workspace.id, ctx.activeBrand.id);
        }
        if (action === "update_config") {
            if (!["owner", "admin"].includes(ctx.memberRole)) throw new WorkflowError("Only owners and admins can enable or change recurring AI planning.", 403);
            const parsed = configurationInput.safeParse(body);
            if (!parsed.success) throw new WorkflowError(parsed.error.issues[0]?.message || "Invalid planning settings.");
            const input = parsed.data;
            const requestedMode = input.mode;
            if (requestedMode !== "manual") {
                await assertFeature(ctx.workspace.id, "planning");
                await assertBrandEntitlement(ctx.workspace.id, ctx.activeBrand.id);
            }
            const updated = await db.transaction(async tx => {
            const [current] = await tx.find(agentConfigurations, { workspaceId: ctx.workspace!.id }, { lock: true });
            if (!current) throw new WorkflowError("Agent configuration not found.", 404);
            const [saved] = await tx.update(agentConfigurations, eq("workspaceId", ctx.workspace!.id), {
                mode: requestedMode,
                isPaused: input.isPaused,
                maxPostsPerWeek: input.maxPostsPerWeek,
                allowedPlatforms: input.allowedPlatforms ? [...new Set(input.allowedPlatforms)] : undefined,
                requireApprovalForPromotions: true,
                currentStrategy: input.currentStrategy,
                objectives: input.objectives,
                updatedAt: new Date(),
            });
            if (requestedMode === "manual" || input.recurringEnabled !== undefined || requestedMode !== current.mode) {
                await setRecurringPlanning(tx, ctx.workspace!.id, ctx.user.id, requestedMode !== "manual" && (input.recurringEnabled ?? requestedMode === "autopilot"), input.intervalDays);
            }
            return saved;
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
            if (!["owner", "admin"].includes(ctx.memberRole)) throw new WorkflowError("Only owners and admins can pause or resume recurring planning.", 403);
            const [current] = await db.find(agentConfigurations, eq("workspaceId", ctx.workspace.id), {});
            if (!current) throw new WorkflowError("Agent configuration not found.", 404);
            const nextPaused = !current.isPaused;
            if (!nextPaused) await assertFeature(ctx.workspace.id, "planning");
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
                deadline: Date.now() + 20000,
                requestKey: typeof body.requestKey === "string" ? `manual-plan:${body.requestKey.slice(0, 100)}` : undefined,
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
            if (!Number.isSafeInteger(actionId) || actionId <= 0 || !["approved", "rejected"].includes(body.decision)) throw new WorkflowError("Choose a valid proposal and explicit approval decision.");
            const decision = body.decision as "approved" | "rejected";
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
