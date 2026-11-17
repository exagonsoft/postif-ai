import { NextResponse } from "next/server";
import { db } from "@/db";
import { publishingJobs, posts } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { canApprove, isPublishable, WorkflowError } from "@/lib/post-policy";
import { processDuePosts, processImmediatePost } from "@/lib/publishing-worker";
export async function GET() {
    const ctx = await getAuthContext();
    if (!ctx?.workspace)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jobs = await db.find(publishingJobs, eq("workspaceId", ctx.workspace.id), { sort: { createdAt: -1 } });
    return NextResponse.json({ ok: true, jobs: jobs.map(({ encryptedProviderState, ...job }) => ({ ...job, hasProviderState: !!encryptedProviderState })) });
}
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx?.workspace || !canApprove(ctx.memberRole))
            return NextResponse.json({ error: "Publishing permission required." }, { status: 403 });
        const body = await req.json();
        if (body.action === "run_due")
            return NextResponse.json({ ok: true, processed: await processDuePosts(ctx.workspace.id) });
        if (body.action === "check_immediate") {
            const [job] = await db.find(publishingJobs, { id: Number(body.jobId), workspaceId: ctx.workspace.id, deliveryMode: "immediate" });
            if (!job) throw new WorkflowError("Job not found.", 404);
            await processImmediatePost(ctx.workspace.id, job.postId, job.id);
            const [updated] = await db.find(publishingJobs, { id: job.id, workspaceId: ctx.workspace.id });
            return NextResponse.json({ ok: true, status: updated.status, errorMessage: updated.errorMessage });
        }
        if (body.action === "retry") {
            const jobToRetry = await db.transaction(async (tx) => {
                const [job] = await tx.find(publishingJobs, and(eq("id", Number(body.jobId)), eq("workspaceId", ctx.workspace!.id)), { lock: true });
                if (!job)
                    throw new WorkflowError("Job not found.", 404);
                const [post] = await tx.find(posts, eq("id", job.postId), {});
                if (!["failed", "blocked"].includes(job.status) || !post || !isPublishable(post.status === "failed" && job.deliveryMode === "immediate" ? { ...post, status: "scheduled" } : post))
                    throw new WorkflowError("This job cannot be retried until the post is approved and scheduled.", 409);
                if (job.attempts >= job.maxAttempts)
                    throw new WorkflowError("Retry limit reached. Review the post before rescheduling.", 409);
                await tx.update(publishingJobs, eq("id", job.id), { status: "queued", errorMessage: null, nextCheckAt: null });
                if (post.status === "failed") await tx.update(posts, eq("id", post.id), { status: "publishing", updatedAt: new Date() });
                return job;
            });
            if (jobToRetry.deliveryMode === "immediate") await processImmediatePost(ctx.workspace.id, jobToRetry.postId, jobToRetry.id);
            return NextResponse.json({ ok: true });
        }
        throw new WorkflowError("Invalid job action.");
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof WorkflowError ? error.message : "Job update failed." }, { status: error instanceof WorkflowError ? error.status : 500 });
    }
}
