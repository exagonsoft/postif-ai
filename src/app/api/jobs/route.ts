import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  publishingJobs,
  posts,
  notifications,
  auditLogs,
  workspaces,
} from "@/db/schema";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await db
    .select()
    .from(publishingJobs)
    .where(eq(publishingJobs.workspaceId, ctx.workspace.id))
    .orderBy(desc(publishingJobs.createdAt));

  return NextResponse.json({ ok: true, jobs });
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace || !ctx.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "retry") {
      const jobId = Number(body.jobId);
      const [job] = await db
        .select()
        .from(publishingJobs)
        .where(
          and(
            eq(publishingJobs.id, jobId),
            eq(publishingJobs.workspaceId, ctx.workspace.id)
          )
        );

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      const [updatedJob] = await db
        .update(publishingJobs)
        .set({
          status: "completed",
          attempts: job.attempts + 1,
          executedAt: new Date(),
          errorMessage: null,
          externalPostId: `sim_retry_${job.platform}_${Date.now()}`,
        })
        .where(eq(publishingJobs.id, jobId))
        .returning();

      await db
        .update(posts)
        .set({
          status: "published",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, job.postId));

      await db
        .update(workspaces)
        .set({
          postsPublishedThisMonth: sql`${workspaces.postsPublishedThisMonth} + 1`,
        })
        .where(eq(workspaces.id, ctx.workspace.id));

      await db.insert(notifications).values({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        type: "publish_success",
        title: `Retry succeeded on ${job.platform.toUpperCase()}`,
        message: `Publishing job #${job.id} completed after retry (Simulated Sandbox Adapter).`,
        actionHref: "/app/calendar",
      });

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: "publishing_job.retried_success",
        resourceType: "publishing_job",
        resourceId: String(job.id),
        metadata: { platform: job.platform },
      });

      return NextResponse.json({ ok: true, job: updatedJob });
    }

    if (action === "run_due") {
      const dueJobs = await db
        .select()
        .from(publishingJobs)
        .where(
          and(
            eq(publishingJobs.workspaceId, ctx.workspace.id),
            eq(publishingJobs.status, "queued"),
            lte(publishingJobs.scheduledFor, new Date())
          )
        );

      let processed = 0;
      for (const job of dueJobs) {
        await db
          .update(publishingJobs)
          .set({
            status: "completed",
            attempts: job.attempts + 1,
            executedAt: new Date(),
            externalPostId: `sim_worker_${job.platform}_${Date.now()}`,
          })
          .where(eq(publishingJobs.id, job.id));

        await db
          .update(posts)
          .set({
            status: "published",
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(posts.id, job.postId));

        processed += 1;
      }

      if (processed > 0) {
        await db
          .update(workspaces)
          .set({
            postsPublishedThisMonth: sql`${workspaces.postsPublishedThisMonth} + ${processed}`,
          })
          .where(eq(workspaces.id, ctx.workspace.id));
      }

      return NextResponse.json({ ok: true, processed });
    }

    return NextResponse.json({ error: "Invalid job action" }, { status: 400 });
  } catch (err) {
    console.error("Jobs API error:", err);
    return NextResponse.json({ error: "Job execution failed" }, { status: 500 });
  }
}
