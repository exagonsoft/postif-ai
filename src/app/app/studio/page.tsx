import React from "react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ContentStudioClient } from "@/components/ContentStudioClient";
import { getWorkspacePublishing } from "@/lib/workspace-publishing";

export const dynamic = "force-dynamic";

export default async function AIContentStudioPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace) {
    redirect("/login");
  }

  const { isTeamWorkspace } = await getWorkspacePublishing(ctx.workspace.id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          AI Content Studio
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Generate, refine, preview, and schedule platform-native social content from a single
          creative brief.
        </p>
      </div>

      <ContentStudioClient
        key={`${ctx.workspace.id}-${isTeamWorkspace}`}
        isTeamWorkspace={isTeamWorkspace}
        memberRole={ctx.memberRole}
        brands={ctx.brands.map((b) => ({
          id: b.id,
          name: b.name,
          tone: b.tone,
          targetAudience: b.targetAudience,
          suggestedHashtags: b.suggestedHashtags,
        }))}
        defaultBrandId={ctx.activeBrand?.id || ctx.brands[0]?.id || 1}
      />
    </div>
  );
}
