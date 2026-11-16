"use client";

import type { AdminCatalog, CatalogSourceComparison as Comparison } from "@/lib/billing-catalog";
import { useAppLanguage } from "@/i18n/provider";
import { adminStatus } from "@/app/app/admin/_display";

type Props = {
  plan: AdminCatalog["plans"][number];
  version?: AdminCatalog["versions"][number];
  environment: AdminCatalog["environment"];
  mongoReadAt: string;
  comparison?: Comparison;
  busy: boolean;
  reading: boolean;
  error?: string;
  onRefresh: () => void;
};
type Row = { label: string; saved: string | null; remote: string | null; compare?: boolean };
function Records({ title, rows, error }: { title: string; rows: Row[]; error?: string }) {
  const { t } = useAppLanguage();
  return <details open className="rounded-lg border border-[var(--border-subtle)] p-3">
    <summary className="cursor-pointer py-1 font-bold">{title}</summary>
    <div className="space-y-2 pt-2">
    {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full table-fixed text-left text-xs">
      <thead><tr><th className="w-1/5 p-2">{t("admin.records.field")}</th><th className="w-2/5 p-2">{t("admin.records.saved")}</th><th className="w-2/5 p-2">{t("admin.records.remote")}</th></tr></thead>
      <tbody>{rows.map(row => {
        const different = row.compare && !error && row.saved !== null && row.saved !== row.remote;
        return <tr key={row.label} className={different ? "bg-amber-500/10" : ""}>
          <th className="break-words p-2 align-top font-semibold">{row.label}</th>
          <td className="break-words p-2 align-top">{row.saved === "" ? t("admin.records.empty") : row.saved ?? t("admin.records.notSaved")}</td>
          <td className="break-words p-2 align-top">{row.remote === "" ? t("admin.records.empty") : row.remote ?? t(error ? "admin.records.unavailable" : "admin.records.notReturned")}{different && <strong className="mt-1 block text-amber-400">{t("admin.records.different")}</strong>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    </div>
  </details>;
}
function policy(t: (key: string) => string, auto: boolean | undefined, threshold: number | undefined) {
  return `auto_bill_outstanding: ${auto === undefined ? t("admin.records.notReturnedValue") : String(auto)}; payment_failure_threshold: ${threshold ?? t("admin.records.notReturnedValue")}`;
}
export function CatalogSourceComparison({ plan, version, environment, mongoReadAt, comparison, busy, reading, error, onRefresh }: Props) {
  const { t, formatDate, formatNumber } = useAppLanguage();
  const mongo = comparison?.mongo;
  const draft = mongo?.draft ?? plan.draft;
  const product = comparison?.paypal.product;
  const remoteProduct = product?.status === "loaded" ? product.data : null;
  const canRead = !!version && version.environment === environment;
  return <section aria-label={t("admin.records.label", { slug: plan.slug })} className="rounded-xl border border-cyan-500/30 p-4">
    <details>
      <summary className="cursor-pointer py-2 font-bold">{t("admin.records.title")}</summary>
      <div className="space-y-4 pt-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {canRead && <button type="button" disabled={busy} onClick={onRefresh} className="min-h-10 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t(reading ? "admin.records.reading" : "admin.records.refresh")}</button>}
    </div>
    <p className="text-xs text-[var(--text-secondary)]">{t("admin.records.help")}</p>
    <details open className="rounded-lg border border-[var(--border-subtle)] p-3 text-sm">
      <summary className="cursor-pointer py-1 font-bold">{t("admin.records.draft", { id: mongo?.planId ?? plan.id, revision: mongo?.revision ?? plan.revision })}</summary>
      <div className="space-y-1 pt-2">
      <p className="break-words">{t("admin.records.baseName", { name: draft.name })}</p>
      <p className="break-words">{t("admin.records.descriptionValue", { description: draft.description ?? t("admin.records.notSaved") })}</p>
      <p>{t("admin.price", { monthly: formatNumber(draft.monthlyPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), annual: formatNumber(draft.annualMonthlyPrice * 12, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</p>
      {mongo?.product && <p className="mt-2 break-words">{t("admin.records.productDraft", { id: mongo.product.id, revision: mongo.product.revision, name: mongo.product.name, description: mongo.product.description })}</p>}
      <p className="text-xs text-[var(--text-muted)]">{t("admin.records.mongoRead", { date: formatDate(mongo?.readAt ?? mongoReadAt) })}</p>
      </div>
    </details>
    {!canRead && <p className="text-sm">{t(plan.slug === "free" ? "admin.records.free" : "admin.records.unmapped")}</p>}
    {canRead && !comparison && !reading && !error && <p className="text-sm text-amber-400">{t("admin.records.unread")}</p>}
    {reading && <p role="status" className="text-sm">{t("admin.records.fetching")}</p>}
    {error && <p role="alert" className="text-sm text-rose-400">{error} {t("admin.records.noCurrent")}</p>}
    {comparison && <div className="space-y-4">
      <p className="text-xs">{t("admin.records.completed", { environment: comparison.environment, date: formatDate(comparison.checkedAt), id: comparison.versionId, status: adminStatus(t, mongo?.publication.status ?? ""), mapping: t(mongo?.currentVersionId === comparison.versionId ? "admin.records.current" : "admin.records.notCurrent") })}</p>
      <p className="break-words text-sm">{t("admin.records.publishedDetails", { name: mongo?.publication.definition.name ?? "", description: mongo?.publication.definition.description ?? t("admin.records.notSaved") })}</p>
      <Records title={t("admin.records.linkedProduct")} error={product && product.status !== "loaded" ? product.error : undefined} rows={[
        { label: t("admin.paypalId"), saved: mongo?.mappings.product.id ?? null, remote: remoteProduct?.id ?? null, compare: true },
        { label: t("admin.name"), saved: mongo?.mappings.product.name ?? null, remote: remoteProduct?.name ?? null, compare: true },
        { label: t("admin.description"), saved: mongo?.mappings.product.description ?? null, remote: remoteProduct?.description ?? null, compare: true },
      ]} />
      {(["month", "year"] as const).map(interval => {
        const result = comparison.paypal[interval], remote = result.status === "loaded" ? result.data : null;
        const saved = comparison.mongo.mappings[interval], preferences = remote?.paymentPreferences;
        const published = comparison.mongo.publication.definition;
        const price = interval === "month" ? published.monthlyPrice : published.annualMonthlyPrice * 12;
        return <div key={interval} className="space-y-2">
          {saved.updatePending && <p role="status" className="text-sm text-amber-400">{t("admin.records.updatePending")}</p>}
          <Records title={t(interval === "month" ? "admin.monthlyPlan" : "admin.yearlyPlan")} error={result.status !== "loaded" ? result.error : undefined} rows={[
            { label: t("admin.paypalId"), saved: saved.id, remote: remote?.id ?? null, compare: true },
            { label: t("admin.records.exactName"), saved: saved.name, remote: remote?.name ?? null, compare: true },
            { label: t("admin.description"), saved: saved.description, remote: remote?.description ?? null, compare: true },
            { label: t("admin.fields.status"), saved: t("admin.records.publication", { status: adminStatus(t, comparison.mongo.publication.status) }), remote: remote?.status ? adminStatus(t, remote.status) : null },
            { label: t("admin.records.productId"), saved: comparison.mongo.mappings.product.id, remote: remote?.productId ?? null, compare: true },
            { label: t("admin.records.priceInterval"), saved: `USD ${price.toFixed(2)} / ${adminStatus(t, interval)}`, remote: remote ? remote.cycles.map(cycle => t("admin.billingCycle", { type: cycle.type, price: cycle.price ? `${cycle.price.currency_code} ${cycle.price.value}` : t("admin.noFixedPrice"), count: cycle.intervalCount, interval: cycle.interval, cycles: cycle.totalCycles === 0 ? t("admin.unlimited") : cycle.totalCycles })).join("; ") || t("admin.records.noCycles") : null },
            { label: t("admin.records.paymentPolicy"), saved: saved.paymentPolicy ? policy(t, saved.paymentPolicy.autoBillOutstanding, saved.paymentPolicy.paymentFailureThreshold) : null, remote: preferences ? policy(t, preferences.auto_bill_outstanding, preferences.payment_failure_threshold) : null, compare: true },
          ]} />
        </div>;
      })}
    </div>}
      </div>
    </details>
  </section>;
}
