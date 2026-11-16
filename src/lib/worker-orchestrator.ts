import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { workerStates } from "@/db/worker-schema";
import { processDuePosts } from "./publishing-worker";
import { reconcileAutomaticPostMedia } from "./automatic-post-media";
import { refreshPendingMedia } from "./media-generation";
import { deliverNotifications } from "./notification-service";
import { reconcileAIRequests } from "./ai-engine";
import { runRecurringPlanning } from "./recurring-planner";
import { refreshSubscriptionAllowances } from "./subscriptions";
import { renewSocialCredentials, syncSocialAnalytics } from "./social-lifecycle";
import { hasTime, workerBudgetMs, type WorkerOptions } from "./worker-budget";
import { withWorkerDeadline } from "./worker-network";
import { cleanupExpiredMediaUploads } from "./media-upload-intents";

type Phase = { name: string; budget: number; run: (options: WorkerOptions) => Promise<unknown> };
export async function runWorkerSweep() {
  const started = Date.now();
  const deadline = started + workerBudgetMs();
  const token = randomUUID();
  const critical: Phase[] = [
    { name: "publishing", budget: 8500, run: options => processDuePosts(undefined, { ...options, limit: 3 }) },
    { name: "subscriptions", budget: 2000, run: options => refreshSubscriptionAllowances({ ...options, limit: 10, reconcile: false }) },
    { name: "automatic_media", budget: 1500, run: options => reconcileAutomaticPostMedia({ ...options, limit: 10 }) },
    { name: "ai_reconciliation", budget: 1500, run: options => reconcileAIRequests({ ...options, limit: 5 }) },
    { name: "credentials", budget: 2500, run: options => renewSocialCredentials({ ...options, limit: 2 }) },
  ];
  const maintenance: Phase[] = [
    { name: "media", budget: 14000, run: options => refreshPendingMedia({ ...options, limit: 3 }) },
    { name: "planning", budget: 16000, run: options => runRecurringPlanning({ ...options, limit: 2 }) },
    { name: "analytics", budget: 5000, run: options => syncSocialAnalytics({ ...options, limit: 2 }) },
    { name: "notifications", budget: 5000, run: options => deliverNotifications({ ...options, limit: 2 }) },
    { name: "billing_reconciliation", budget: 5000, run: options => refreshSubscriptionAllowances({ ...options, limit: 1, reconcile: true }) },
    { name: "media_upload_cleanup", budget: 4000, run: options => cleanupExpiredMediaUploads({ ...options, limit: 3 }) },
  ];
  const claim = await db.transaction(async tx => {
    const [existing] = await tx.find(workerStates, { key: "sweep" }, { lock: true });
    if (existing?.status === "running" && existing.heartbeatAt.getTime() > Date.now() - 45000) return null;
    const previousCursor = Number((existing?.result as { cursor?: number } | null)?.cursor || 0);
    await tx.upsert(workerStates, "key", { key: "sweep", phase: "sweep", token }, {
      status: "running", token, startedAt: new Date(), heartbeatAt: new Date(), completedAt: null, error: null,
    });
    return { cursor: (previousCursor + 1) % maintenance.length };
  });
  if (!claim) return { ok: true, busy: true };
  const results: Record<string, { status: string; result?: unknown }> = {};
  const phases = [...critical, ...maintenance.slice(claim.cursor), ...maintenance.slice(0, claim.cursor)];
  let failed = false;
  try {
    for (const phase of phases) {
      if (!hasTime(deadline, 2000)) { results[phase.name] = { status: "deferred" }; continue; }
      const phaseDeadline = Math.min(deadline - 1000, Date.now() + phase.budget);
      await db.update(workerStates, { key: "sweep", token }, { heartbeatAt: new Date() });
      await db.upsert(workerStates, "key", { key: `phase:${phase.name}`, phase: phase.name, token }, {
        token, status: "running", startedAt: new Date(), heartbeatAt: new Date(), completedAt: null, error: null,
      });
      try {
        const result = await withWorkerDeadline(phaseDeadline, () => phase.run({ deadline: phaseDeadline }));
        const partial = !!result && typeof result === "object" && "failed" in result && Number(result.failed) > 0;
        if (partial) failed = true;
        results[phase.name] = { status: partial ? "degraded" : "completed", result };
        await db.update(workerStates, { key: `phase:${phase.name}`, token }, {
          status: partial ? "degraded" : "completed", heartbeatAt: new Date(), completedAt: new Date(), result,
        });
      } catch {
        failed = true;
        results[phase.name] = { status: "failed" };
        console.error("Worker phase failed", { phase: phase.name });
        await db.update(workerStates, { key: `phase:${phase.name}`, token }, {
          status: "failed", heartbeatAt: new Date(), completedAt: new Date(), error: "Phase failed. Inspect private application logs and configuration.",
        });
      }
    }
    return { ok: !failed, busy: false, elapsedMs: Date.now() - started, phases: results };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await db.update(workerStates, { key: "sweep", token }, {
      status: failed ? "degraded" : "completed", heartbeatAt: new Date(), completedAt: new Date(), result: { cursor: claim.cursor },
    });
  }
}
