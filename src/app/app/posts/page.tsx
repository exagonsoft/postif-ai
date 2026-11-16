import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { posts, mediaAssets } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { PostsManagerClient } from "@/components/PostsManagerClient";
import { Wand2 } from "lucide-react";
import { getWorkspacePublishing } from "@/lib/workspace-publishing";
export const dynamic = "force-dynamic";
export default async function PostsPage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    const wsPosts = await db.find(posts, eq("workspaceId", ctx.workspace.id), { sort: { createdAt: -1 } });
    const assets = await db.find(mediaAssets, eq("workspaceId", ctx.workspace.id), {});
    const { isTeamWorkspace } = await getWorkspacePublishing(ctx.workspace.id);
    return (<div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {isTeamWorkspace ? "Posts & Team Approvals" : "Your Posts"}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
            {isTeamWorkspace ? "Create, review, and schedule posts with your team." : "Generate, schedule, and publish. Review first only when you choose to."}
          </p>
        </div>
        <Link href="/app/studio" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg">
          <Wand2 className="h-4 w-4"/> Create New Post
        </Link>
      </div>

      <PostsManagerClient isTeamWorkspace={isTeamWorkspace} memberRole={ctx.memberRole} posts={wsPosts.map((p) => ({
            id: p.id,
            title: p.title,
            baseContent: p.baseContent,
            contentType: p.contentType,
            status: p.status,
            platforms: p.platforms,
            scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
            createdByAgent: p.createdByAgent,
            approvalNote: p.approvalNote,
            requiresApproval: p.requiresApproval,
            variants: p.variants,
            timezone: p.timezone,
            automaticMedia: p.automaticMedia,
            automaticMediaStatus: assets.find(asset => asset.id === p.automaticMediaId)?.generationStatus || null,
            media: assets.filter(asset => p.mediaIds.includes(asset.id)).map(asset => ({ id: asset.id, title: asset.title, assetType: asset.assetType, url: `/api/media/${asset.id}/content`, generationStatus: asset.generationStatus })),
        }))}/>
    </div>);
}
