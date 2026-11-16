import React from "react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { MediaLibraryUploads } from "@/components/MediaLibraryUploads";
export const dynamic = "force-dynamic";
export default async function MediaLibraryPage() {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          AI Image & Media Studio
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Upload your media or generate real images, videos, and GIFs with your configured providers.
        </p>
      </div>

      <MediaLibraryUploads canManage={ctx.memberRole !== "viewer"} />
    </div>);
}
