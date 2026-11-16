import { db } from "@/db";
import { agentConfigurations, agentActions, brands, posts, workspaces, workspaceMembers } from "@/db/schema";
import { planningRuns, planningSchedules, type PlanningRun } from "@/db/worker-schema";
import { assertBrandEntitlement, assertFeature, getPublishingUsage } from "./entitlements";
import { generateWeeklyPlan, generateMultiPlatformPosts } from "./ai-engine";
import { WorkflowError } from "./post-policy";
import { hasTime, type WorkerOptions } from "./worker-budget";

type Connection = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function setRecurringPlanning(tx: Connection, workspaceId: number, userId: number, enabled: boolean, intervalDays = 7) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 28) throw new WorkflowError("Planning interval must be between 1 and 28 days.");
  if (enabled) await assertFeature(workspaceId, "planning", tx);
  const [existing] = await tx.find(planningSchedules, { workspaceId }, { lock: true });
  const nextRunAt = existing?.enabled ? existing.nextRunAt : new Date();
  await tx.upsert(planningSchedules, "workspaceId", { workspaceId, enabledBy: userId }, {
    enabled, enabledBy: userId, intervalDays, nextRunAt, lastError: null, updatedAt: new Date(),
  });
}

async function plannerContext(workspaceId: number, tx: Connection = db) {
  const { plan } = await assertFeature(workspaceId, "planning", tx);
  const [configuration] = await tx.find(agentConfigurations, { workspaceId });
  if (!configuration || configuration.isPaused || !["assisted", "autopilot"].includes(configuration.mode)) throw new WorkflowError("Recurring planning is paused or in manual mode.", 409);
  await assertBrandEntitlement(workspaceId, configuration.brandId, tx);
  const [brand] = await tx.find(brands, { id: configuration.brandId, workspaceId });
  if (!brand) throw new WorkflowError("Planning brand no longer exists.", 409);
  return { plan, configuration, brand };
}
async function finishRun(run: PlanningRun, status: string, error: string | null = null) {
  await db.transaction(async tx => {
    const [schedule] = await tx.find(planningSchedules, { workspaceId: run.workspaceId }, { lock: true });
    await tx.update(planningRuns, { id: run.id }, { status, error, updatedAt: new Date() });
    if (schedule) await tx.update(planningSchedules, { id: schedule.id }, {
      nextRunAt: new Date(Math.max(Date.now(), run.periodStart.getTime()) + schedule.intervalDays * 86400000),
      lastError: error, updatedAt: new Date(),
    });
  });
}

export async function runRecurringPlanning({ deadline = Date.now() + 20000, limit = 2 }: WorkerOptions = {}) {
  return db.withLease("recurring-planning", async () => {
    const schedules = await db.find(planningSchedules, { enabled: true, nextRunAt: { $lte: new Date() } }, { sort: { updatedAt: 1, id: 1 }, limit });
    let processed = 0;
    let blocked = 0;
    for (const schedule of schedules) {
      if (!hasTime(deadline, 3000)) break;
      let run: PlanningRun | undefined;
      try {
        const [workspace] = await db.find(workspaces, { id: schedule.workspaceId });
        const members = workspace?.ownerId === schedule.enabledBy ? [] : await db.find(workspaceMembers, { workspaceId: schedule.workspaceId, userId: schedule.enabledBy, status: "active", role: { $in: ["owner", "admin"] } });
        if (!workspace || (workspace.ownerId !== schedule.enabledBy && !members.length)) {
          await db.update(planningSchedules, { id: schedule.id }, { enabled: false, lastError: "Recurring planning must be re-enabled by a current owner or admin.", updatedAt: new Date() });
          blocked++; continue;
        }
        const { plan, configuration, brand } = await plannerContext(schedule.workspaceId);
        const key = `${schedule.workspaceId}:${schedule.nextRunAt.toISOString()}`;
        [run] = await db.find(planningRuns, { key });
        if (run && ["completed", "blocked"].includes(run.status)) {
          await finishRun(run, run.status, run.error); continue;
        }
        const usage = await getPublishingUsage(schedule.workspaceId);
        const pending = await db.find(posts, { workspaceId: schedule.workspaceId, createdByAgent: true, status: { $in: ["draft", "pending_approval", "approved", "waiting_media", "media_failed", "scheduled", "publishing"] } }, { projection: { id: 1 }, limit: plan.maxPostsPerMonth + 1 });
        const remaining = plan.maxPostsPerMonth - usage.used - pending.length;
        if (remaining <= 0) throw new WorkflowError("Publishing allowance is already used or allocated to existing agent drafts.", 403);
        if (!run) {
          [run] = await db.insert(planningRuns, { key, workspaceId: schedule.workspaceId, brandId: brand.id, periodStart: schedule.nextRunAt, total: Math.min(configuration.maxPostsPerWeek, remaining) });
        }
        if (run.brandId !== brand.id) throw new WorkflowError("Planning brand changed during a run. Re-enable recurring planning to start a new period.", 409);
        const { weeklyPlan } = await generateWeeklyPlan({
          workspaceId: schedule.workspaceId, userId: schedule.enabledBy, brandName: brand.name,
          description: brand.description, audience: brand.targetAudience, contentPillars: brand.contentPillars,
          objectives: configuration.objectives, platforms: configuration.allowedPlatforms, maxPostsPerWeek: run.total,
          requestKey: `planner:${run.key}:strategy`, deadline,
        });
        if (run.status === "planning") {
          await db.transaction(async tx => {
            await plannerContext(schedule.workspaceId, tx);
            await tx.update(agentConfigurations, { id: configuration.id }, { weeklyPlan, updatedAt: new Date() });
            await tx.update(planningRuns, { id: run!.id, status: "planning" }, { status: "drafting", updatedAt: new Date() });
            await tx.update(planningSchedules, { id: schedule.id }, { updatedAt: new Date() });
          });
          processed++;
          continue;
        }
        const slot = weeklyPlan[run.cursor];
        if (!slot) { await finishRun(run, "completed"); processed++; continue; }
        if (!hasTime(deadline, 3000)) break;
        const generated = await generateMultiPlatformPosts({
          workspaceId: schedule.workspaceId, userId: schedule.enabledBy, brandName: brand.name,
          topic: slot.concept, prompt: `${configuration.currentStrategy}\nContent pillar: ${slot.pillar}`,
          objective: configuration.objectives.join(", "), audience: brand.targetAudience,
          platforms: [slot.platform], tone: brand.tone || "Professional", language: "English",
          contentType: "Educational Post", length: "medium", keywords: [], cta: "",
          requestKey: `planner:${run.key}:draft:${run.cursor}`, deadline,
        });
        await db.transaction(async tx => {
          const [currentRun] = await tx.find(planningRuns, { id: run!.id }, { lock: true });
          const [currentSchedule] = await tx.find(planningSchedules, { id: schedule.id }, { lock: true });
          if (!currentSchedule?.enabled) throw new WorkflowError("Recurring planning was disabled.", 409);
          await plannerContext(schedule.workspaceId, tx);
          if (!currentRun || currentRun.cursor !== run!.cursor) return;
          const idempotencyKey = `planner:${run!.key}:${run!.cursor}`;
          const [existing] = await tx.find(posts, { workspaceId: schedule.workspaceId, idempotencyKey });
          if (!existing) {
            const [post] = await tx.insert(posts, {
              workspaceId: schedule.workspaceId, brandId: brand.id, title: slot.concept.slice(0, 300),
              topic: slot.concept, baseContent: generated.baseContent, platforms: [slot.platform],
              variants: generated.variants, status: "pending_approval", requiresApproval: true,
              approvedAt: null, approvedBy: null, createdByAgent: true, idempotencyKey,
            });
            await tx.insert(agentActions, { workspaceId: schedule.workspaceId, brandId: brand.id,
              actionType: "draft_created", title: post.title, description: `Generated a real ${slot.platform} draft for ${slot.day}. Review content and choose its publishing time.`,
              reasoning: "Recurring planning never approves promotional or client content. All generated drafts require server-authorized human approval.",
              status: "proposed", targetPostId: post.id });
          }
          await tx.update(planningRuns, { id: run!.id, cursor: run!.cursor }, { cursor: run!.cursor + 1, updatedAt: new Date() });
          await tx.update(planningSchedules, { id: schedule.id }, { lastError: null, updatedAt: new Date() });
        });
        if (run.cursor + 1 >= weeklyPlan.length) await finishRun(run, "completed");
        processed++;
      } catch (error) {
        const message = error instanceof WorkflowError ? error.message : "Planning could not finish. Check AI credits, credentials, and request status. Uncertain provider requests will not be automatically repeated.";
        if (run) await finishRun(run, "blocked", message);
        else await db.update(planningSchedules, { id: schedule.id }, { lastError: message, nextRunAt: new Date(Date.now() + 3600000), updatedAt: new Date() });
        blocked++;
      }
    }
    return { processed, blocked };
  }, { processed: 0, blocked: 0 });
}
