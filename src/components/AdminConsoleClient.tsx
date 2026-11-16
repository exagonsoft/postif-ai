"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { useAppLanguage } from "@/i18n/provider";

interface FlagItem { id: number; key: string; name: string; description: string; enabled: boolean }
export function AdminConsoleClient({ flags }: { flags: FlagItem[] }) {
  const { t } = useAppLanguage();
  const router = useRouter(), { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  async function toggle(flag: FlagItem) {
    setBusy(flag.id);
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_flag", flagId: flag.id, enabled: !flag.enabled, expectedEnabled: flag.enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("admin.registry.failed"));
      toast(t("admin.registry.saved"), t("admin.registry.recorded"));
      router.refresh();
    } catch (error) {
      toast(t("admin.registry.unavailable"), error instanceof Error ? error.message : t("admin.refreshRetry"), "error");
    } finally { setBusy(null); }
  }
  return <section className="surface-card rounded-3xl p-6">
    <h2 className="text-base font-bold">{t("admin.registry.title")}</h2>
    <p className="mt-2 text-sm text-[var(--text-muted)]">{t("admin.registry.help")}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">{flags.map(flag => <div key={flag.id} className="elevated-card flex justify-between gap-3 rounded-2xl p-4">
      <div><h3 className="text-sm font-semibold">{flag.name}</h3><p className="mt-2 text-xs">{flag.description}</p><code className="text-xs text-cyan-400">{flag.key}</code></div>
      <button type="button" disabled={busy !== null} onClick={() => toggle(flag)} aria-label={t("admin.registry.change", { name: flag.name })} className="disabled:opacity-50">
        {flag.enabled ? <ToggleRight className="h-7 w-7 text-emerald-400" /> : <ToggleLeft className="h-7 w-7 text-slate-500" />}
      </button>
    </div>)}</div>
    {!flags.length && <p className="mt-4 text-sm text-[var(--text-muted)]">{t("admin.registry.empty")}</p>}
  </section>;
}
