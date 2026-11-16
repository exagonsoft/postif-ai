"use client";

import type { AdminCatalog } from "@/lib/billing-catalog";
import { useState } from "react";
import { normalizePayPalPlanDescription } from "@/lib/paypal-catalog-text";
import { useAppLanguage } from "@/i18n/provider";

type Props = {
  version: AdminCatalog["versions"][number];
  environment: AdminCatalog["environment"];
  busy: boolean;
  onConfirm: (details: { name: string; description: string }) => void;
};
export function PayPalPlanNameUpdate({ version, environment, busy, onConfirm }: Props) {
  const { t } = useAppLanguage();
  const [name, setName] = useState(version.pendingDetails?.name ?? version.definition.name);
  const [description, setDescription] = useState(version.pendingDetails?.description ?? version.definition.description ?? "");
  const paypalDescription = normalizePayPalPlanDescription(description);
  if (version.status !== "published" || version.environment !== environment || version.definition.slug === "free") return null;
  const unavailable = !version.paypalMonthPlanId || !version.paypalYearPlanId || `POSTIF-AI ${name} \u2014 Monthly`.length > 127;
  const locked = busy || !!version.pendingDetails;
  return <details className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-3">
    <summary className="cursor-pointer py-2 text-sm font-bold text-violet-400">{t(version.nameUpdatePending ? "admin.nameUpdate.retry" : "admin.nameUpdate.edit")} - {t("admin.version", { id: version.id })}</summary>
    <form className="mt-3 space-y-3" aria-label={t("admin.nameUpdate.label", { id: version.id })} onSubmit={event => { event.preventDefault(); onConfirm({ name: name.trim(), description: paypalDescription }); }}>
      <p className="text-sm">{t("admin.nameUpdate.help", { environment })}</p>
      <label className="block text-sm">{t("admin.nameUpdate.baseName")}<input className="elevated-card mt-1 w-full rounded-xl p-2" name="name" required maxLength={127 - "POSTIF-AI  \u2014 Monthly".length} disabled={locked} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="block text-sm">{t("admin.nameUpdate.description")}<textarea className="elevated-card mt-1 w-full resize-y rounded-xl p-2" rows={4} name="description" required maxLength={127} disabled={locked} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <p className="text-xs text-[var(--text-secondary)]">{t("admin.nameUpdate.descriptionHelp")}</p>
      {([["Monthly", version.paypalMonthPlanId, version.paypalMonthName], ["Yearly", version.paypalYearPlanId, version.paypalYearName]] as const).map(([interval, id, name]) => <div key={interval} className="break-words text-sm">
        <p className="text-xs text-[var(--text-secondary)]">{t("admin.nameUpdate.savedName", { name: name || t("admin.notRecorded"), id: id || t("admin.missing") })}</p>
        <p className="text-xs text-[var(--text-secondary)]">{t(interval === "Monthly" ? "admin.nameUpdate.savedMonthly" : "admin.nameUpdate.savedYearly", { description: (interval === "Monthly" ? version.paypalMonthDescription : version.paypalYearDescription) || t("admin.notRecorded") })}</p>
      </div>)}
      <p className="break-words text-sm">{t("admin.nameUpdate.monthlyPreview")} POSTIF-AI {name.trim()} {"\u2014"} Monthly<br />{t("admin.nameUpdate.yearlyPreview")} POSTIF-AI {name.trim()} {"\u2014"} Yearly<br />{t("admin.nameUpdate.sentDescription")} {paypalDescription || t("admin.enterDescription")}</p>
      {version.nameUpdatePending && <p role="status" className="text-sm text-amber-400">{t("admin.nameUpdate.pending")}</p>}
      {!!version.nameUpdateError && <p role="alert" className="text-sm text-rose-400">{version.nameUpdateError}</p>}
      {unavailable && <p className="text-sm text-rose-400">{t("admin.nameUpdate.unavailable")}</p>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" required disabled={busy || unavailable} /><span>{t("admin.nameUpdate.confirm", { environment })}</span></label>
      <button type="submit" disabled={busy || unavailable} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{t("admin.nameUpdate.save", { environment: t(environment === "live" ? "admin.environment.live" : "admin.environment.sandbox") })}</button>
    </form>
  </details>;
}
