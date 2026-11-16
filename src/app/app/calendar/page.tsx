import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { posts, publishingJobs } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { CalendarClient } from "@/components/CalendarClient";
export const dynamic = "force-dynamic";
export default async function ContentCalendarPage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const [wsPosts, wsJobs] = await Promise.all([
        db.find(posts, eq("workspaceId", ctx.workspace.id), { sort: { createdAt: -1 } }),
        db.find(publishingJobs, eq("workspaceId", ctx.workspace.id), { sort: { createdAt: -1 } }),
    ]);
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Content Calendar & Publishing Queue
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Drag-and-drop scheduling across Monthly, Weekly, Daily, and List views backed by
          idempotent server-side jobs.
        </p>
      </div>

      <CalendarClient posts={wsPosts.map((p) => ({
            id: p.id,
            title: p.title,
            baseContent: p.baseContent,
            status: p.status,
            platforms: p.platforms,
            scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
            timezone: p.timezone,
        }))} jobs={wsJobs.map((j) => ({
            id: j.id,
            postId: j.postId,
            platform: j.platform,
            status: j.status,
            attempts: j.attempts,
            maxAttempts: j.maxAttempts,
            scheduledFor: j.scheduledFor.toISOString(),
            errorMessage: j.errorMessage,
            idempotencyKey: j.idempotencyKey,
        }))}/>
    </div>);
}
