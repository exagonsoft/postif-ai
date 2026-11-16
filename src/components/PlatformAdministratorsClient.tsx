"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { useAppLanguage } from "@/i18n/provider";

export function PlatformAdministratorsClient() {
  const { t } = useAppLanguage();
  const router = useRouter(), { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, fields = new FormData(form);
    const password = String(fields.get("password") || "");
    if (password !== fields.get("confirmation")) { toast(t("admin.administrators.mismatch"), t("admin.administrators.reenter"), "error"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_admin", name: fields.get("name"), email: fields.get("email"), password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("admin.administrators.failed"));
      form.reset();
      toast(t("admin.administrators.created"), t("admin.administrators.secure"));
      router.refresh();
    } catch (error) {
      toast(t("admin.administrators.unavailable"), error instanceof Error ? error.message : t("admin.administrators.refresh"), "error");
    } finally { setBusy(false); }
  }
  return <section className="surface-card rounded-3xl p-6">
    <h2 className="text-base font-bold">{t("admin.administrators.title")}</h2>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("admin.administrators.help")}</p>
    <form onSubmit={create} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold">{t("admin.name")}<input name="name" required maxLength={200} autoComplete="name" className="elevated-card mt-2 w-full rounded-xl p-3" /></label>
      <label className="text-xs font-semibold">{t("admin.email")}<input name="email" type="email" required maxLength={254} autoComplete="off" className="elevated-card mt-2 w-full rounded-xl p-3" /></label>
      <label className="text-xs font-semibold">{t("admin.administrators.password")}<input name="password" type="password" required minLength={12} maxLength={1024} autoComplete="new-password" className="elevated-card mt-2 w-full rounded-xl p-3" /></label>
      <label className="text-xs font-semibold">{t("admin.administrators.confirm")}<input name="confirmation" type="password" required minLength={12} maxLength={1024} autoComplete="new-password" className="elevated-card mt-2 w-full rounded-xl p-3" /></label>
      <button type="submit" disabled={busy} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{t(busy ? "admin.administrators.creating" : "admin.administrators.create")}</button>
    </form>
  </section>;
}
