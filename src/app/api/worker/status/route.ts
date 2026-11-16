import { NextResponse } from "next/server";
import { db } from "@/db";
import { publishingJobs, mediaAssets } from "@/db/schema";
import { aiRequests, planningSchedules, planningRuns, workerStates } from "@/db/worker-schema";
import { getAuthContext } from "@/lib/auth";
import { isWorkerAuthorized } from "@/lib/worker-auth";
import { mediaGenerationReadiness } from "@/lib/media-generation";
import { notificationReadiness } from "@/lib/notification-service";
import { getBillingReadiness } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const operator = isWorkerAuthorized(request);
    const context = operator ? null : await getAuthContext();
    if (!operator && (!context?.workspace || !["owner", "admin"].includes(context.memberRole))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }
    const [sweep] = await db.find(workerStates, { key: "sweep" });
    const heartbeat = sweep?.heartbeatAt || null;
    const health = { heartbeatAt: heartbeat, stale: !heartbeat || Date.now() - heartbeat.getTime() > 180000 };
    if (operator) {
      const phases = await db.find(workerStates, { key: { $ne: "sweep" } }, { sort: { phase: 1 } });
      return NextResponse.json({ ...health, sweep: sweep?.status || "never_run",
        phases: phases.map(phase => ({ phase: phase.phase, status: phase.status,
          startedAt: phase.startedAt, heartbeatAt: phase.heartbeatAt, completedAt: phase.completedAt,
          interrupted: phase.status === "running" && Date.now() - phase.heartbeatAt.getTime() > 45000 })),
        readiness: { media: mediaGenerationReadiness(), notifications: notificationReadiness(), billing: getBillingReadiness(),
          scheduler: "External authenticated HTTP trigger must be configured separately; no scheduler is deployed automatically." },
      }, { headers });
    }
    const workspaceId = context!.workspace!.id;
    const [schedule] = await db.find(planningSchedules, { workspaceId });
    const recentRuns = await db.find(planningRuns, { workspaceId }, { sort: { createdAt: -1 }, limit: 5 });
    const jobs = await db.find(publishingJobs, { workspaceId, status: { $in: ["queued", "retrying", "blocked", "uncertain", "processing"] } }, { projection: { status: 1 }, limit: 501 });
    const media = await db.find(mediaAssets, { workspaceId, generationStatus: { $in: ["queued", "processing", "failed"] } }, { projection: { generationStatus: 1 }, limit: 501 });
    const requests = await db.find(aiRequests, { workspaceId, status: { $in: ["sending", "uncertain"] } }, { projection: { status: 1 }, limit: 501 });
    const count = (values: string[]) => Object.fromEntries([...new Set(values)].map(value => [value, values.filter(item => item === value).length]));
    return NextResponse.json({
      worker: health, workspaceId, countsLimitedTo: 501, publishing: count(jobs.map(job => job.status)),
      media: count(media.map(asset => asset.generationStatus)), aiRequests: count(requests.map(item => item.status)),
      planning: { enabled: schedule?.enabled || false, nextRunAt: schedule?.nextRunAt || null, lastError: schedule?.lastError || null,
        runs: recentRuns.map(run => ({ status: run.status, drafted: run.cursor, total: run.total, error: run.error, updatedAt: run.updatedAt })) },
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Worker status is unavailable." }, { status: 503, headers });
  }
}
