import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { PostsManagerClient } from "@/components/PostsManagerClient";
import { Wand2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    redirect("/login");
  }

  const wsPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.workspaceId, ctx.workspace.id))
    .orderBy(desc(posts.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Posts & Approval Lifecycle
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
            Draft → Pending Approval → Approved → Scheduled → Publishing → Published
          </p>
        </div>
        <Link
          href="/app/studio"
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg"
        >
          <Wand2 className="h-4 w-4" /> Create New Post
        </Link>
      </div>

      <PostsManagerClient
        posts={wsPosts.map((p) => ({
          id: p.id,
          title: p.title,
          baseContent: p.baseContent,
          contentType: p.contentType,
          status: p.status,
          platforms: p.platforms,
          scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
          createdByAgent: p.createdByAgent,
          approvalNote: p.approvalNote,
        }))}
      />
    </div>
  );
}
