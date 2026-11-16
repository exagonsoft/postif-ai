import { getServerI18n } from "@/i18n/server";
import React from "react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { MediaLibraryUploads } from "@/components/MediaLibraryUploads";
export const dynamic = "force-dynamic";
export default async function MediaLibraryPage() {
  const { t } = await getServerI18n();

    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
        redirect("/login");
    }
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("customer.text.43")}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          {t("customer.text.44")}
        </p>
      </div>

      <MediaLibraryUploads canManage={ctx.memberRole !== "viewer"} />
    </div>);
}
