import { getServerI18n } from "@/i18n/server";
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
  const { t } = await getServerI18n();

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
            {isTeamWorkspace ? t("customer.text.47") : t("customer.text.48")}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
            {isTeamWorkspace ? t("customer.text.49") : t("customer.text.50")}
          </p>
        </div>
        <Link href="/app/studio" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg">
          <Wand2 className="h-4 w-4"/> {t("customer.text.51")}
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
