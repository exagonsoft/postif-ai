import React from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { MediaStudioClient } from "@/components/MediaStudioClient";

export const dynamic = "force-dynamic";

export default async function MediaLibraryPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    redirect("/login");
  }

  const assets = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.workspaceId, ctx.workspace.id))
    .orderBy(desc(mediaAssets.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          AI Image & Media Studio
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Manage visual templates, multi-platform aspect ratios, brand presets, and accessibility
          alt-text.
        </p>
      </div>

      <MediaStudioClient
        assets={assets.map((a) => ({
          id: a.id,
          title: a.title,
          prompt: a.prompt,
          assetType: a.assetType,
          aspectRatio: a.aspectRatio,
          url: a.url,
          tags: a.tags,
          altText: a.altText,
          brandPreset: a.brandPreset,
          isSampleData: a.isSampleData,
        }))}
      />
    </div>
  );
}
