import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  posts,
  publishingJobs,
  notifications,
  auditLogs,
  workspaces,
  PlatformVariant,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspacePosts = await db
    .select()
    .from(posts)
    .where(eq(posts.workspaceId, ctx.workspace.id))
    .orderBy(desc(posts.createdAt));

  return NextResponse.json({ ok: true, posts: workspacePosts });
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace || !ctx.user || !ctx.activeBrand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (ctx.memberRole === "viewer") {
      return NextResponse.json(
        { error: "Viewer role does not have permission to create or modify posts." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const plan = getPlanDefinition(ctx.workspace.planSlug);
      if (
        (body.status === "published" || body.status === "scheduled") &&
        ctx.workspace.postsPublishedThisMonth >= plan.maxPostsPerMonth
      ) {
        return NextResponse.json(
          {
            error: `Monthly publishing limit (${plan.maxPostsPerMonth} posts) reached for ${plan.name}. Upgrade plan to publish more.`,
          },
          { status: 403 }
        );
      }

      const platforms: string[] = Array.isArray(body.platforms)
        ? body.platforms
        : ["linkedin"];
      const variants: Record<string, PlatformVariant> = body.variants || {};
      const status = String(body.status || "draft");
      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      const publishedAt = status === "published" ? new Date() : null;
      const idempotencyKey = `post-${ctx.workspace.id}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const [created] = await db
        .insert(posts)
        .values({
          workspaceId: ctx.workspace.id,
          brandId: Number(body.brandId || ctx.activeBrand.id),
          campaignId: body.campaignId ? Number(body.campaignId) : null,
          title: String(body.title || body.topic || "Untitled Post").trim(),
          topic: String(body.topic || "").trim(),
          baseContent: String(body.baseContent || "").trim(),
          contentType: String(body.contentType || "Educational Post"),
          tone: String(body.tone || "Professional"),
          status,
          scheduledAt,
          publishedAt,
          timezone: String(body.timezone || "America/New_York"),
          platforms,
          variants,
          mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds : [],
          createdByAgent: Boolean(body.createdByAgent),
          idempotencyKey,
        })
        .returning();

      if (status === "scheduled" && scheduledAt) {
        for (const platform of platforms) {
          await db.insert(publishingJobs).values({
            workspaceId: ctx.workspace.id,
            postId: created.id,
            platform,
            status: "queued",
            attempts: 0,
            maxAttempts: 3,
            scheduledFor: scheduledAt,
            idempotencyKey: `job-${created.id}-${platform}-${scheduledAt.getTime()}`,
          });
        }
      }

      if (status === "published") {
        for (const platform of platforms) {
          await db.insert(publishingJobs).values({
            workspaceId: ctx.workspace.id,
            postId: created.id,
            platform,
            status: "completed",
            attempts: 1,
            maxAttempts: 3,
            scheduledFor: new Date(),
            executedAt: new Date(),
            externalPostId: `sim_${platform}_${Date.now()}`,
            idempotencyKey: `job-now-${created.id}-${platform}`,
          });
        }
        await db
          .update(workspaces)
          .set({
            postsPublishedThisMonth: sql`${workspaces.postsPublishedThisMonth} + 1`,
          })
          .where(eq(workspaces.id, ctx.workspace.id));
      }

      if (status === "pending_approval") {
        await db.insert(notifications).values({
          workspaceId: ctx.workspace.id,
          userId: ctx.user.id,
          type: "approval_requested",
          title: "New post submitted for approval",
          message: `'${created.title}' is ready for review before scheduling.`,
          actionHref: "/app/posts",
        });
      }

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: `post.${status}`,
        resourceType: "post",
        resourceId: String(created.id),
        metadata: { platforms, title: created.title },
      });

      return NextResponse.json({ ok: true, post: created });
    }

    if (action === "update") {
      const postId = Number(body.postId);
      const [existing] = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspace.id)));

      if (!existing) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      if (
        (body.status === "approved" || body.status === "published") &&
        ctx.memberRole === "editor"
      ) {
        return NextResponse.json(
          { error: "Editor role must submit posts for Approver/Admin sign-off." },
          { status: 403 }
        );
      }

      const nextStatus = body.status ? String(body.status) : existing.status;
      const nextScheduledAt =
        body.scheduledAt !== undefined
          ? body.scheduledAt
            ? new Date(body.scheduledAt)
            : null
          : existing.scheduledAt;

      const [updated] = await db
        .update(posts)
        .set({
          title: body.title !== undefined ? String(body.title) : existing.title,
          baseContent:
            body.baseContent !== undefined ? String(body.baseContent) : existing.baseContent,
          platforms: Array.isArray(body.platforms) ? body.platforms : existing.platforms,
          variants: body.variants !== undefined ? body.variants : existing.variants,
          status: nextStatus,
          scheduledAt: nextScheduledAt,
          publishedAt: nextStatus === "published" ? new Date() : existing.publishedAt,
          timezone: body.timezone ? String(body.timezone) : existing.timezone,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId))
        .returning();

      if (nextStatus === "scheduled" && nextScheduledAt) {
        for (const platform of updated.platforms) {
          const idemKey = `job-${updated.id}-${platform}-${nextScheduledAt.getTime()}`;
          await db
            .insert(publishingJobs)
            .values({
              workspaceId: ctx.workspace.id,
              postId: updated.id,
              platform,
              status: "queued",
              attempts: 0,
              maxAttempts: 3,
              scheduledFor: nextScheduledAt,
              idempotencyKey: idemKey,
            })
            .onConflictDoNothing();
        }
      }

      if (nextStatus === "published" && existing.status !== "published") {
        await db
          .update(workspaces)
          .set({
            postsPublishedThisMonth: sql`${workspaces.postsPublishedThisMonth} + 1`,
          })
          .where(eq(workspaces.id, ctx.workspace.id));
      }

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: `post.updated_${nextStatus}`,
        resourceType: "post",
        resourceId: String(postId),
        metadata: { status: nextStatus },
      });

      return NextResponse.json({ ok: true, post: updated });
    }

    if (action === "duplicate") {
      const postId = Number(body.postId);
      const [existing] = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspace.id)));

      if (!existing) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      const [copy] = await db
        .insert(posts)
        .values({
          workspaceId: ctx.workspace.id,
          brandId: existing.brandId,
          campaignId: existing.campaignId,
          title: `${existing.title} (Copy)`,
          topic: existing.topic,
          baseContent: existing.baseContent,
          contentType: existing.contentType,
          tone: existing.tone,
          status: "draft",
          scheduledAt: null,
          timezone: existing.timezone,
          platforms: existing.platforms,
          variants: existing.variants,
          mediaIds: existing.mediaIds,
          createdByAgent: false,
        })
        .returning();

      return NextResponse.json({ ok: true, post: copy });
    }

    if (action === "delete") {
      const postId = Number(body.postId);
      await db
        .delete(posts)
        .where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspace.id)));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid post action" }, { status: 400 });
  } catch (err) {
    console.error("Posts API error:", err);
    return NextResponse.json({ error: "Failed to process post action" }, { status: 500 });
  }
}
