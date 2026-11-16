"use client";

import { useEffect, useState } from "react";
import type { AdminCatalog } from "@/lib/billing-catalog";
import type { PayPalCatalogPage, PayPalCatalogPlan, PayPalResourceKind } from "@/lib/paypal-catalog";
import { useAppLanguage } from "@/i18n/provider";
import { adminStatus } from "@/app/app/admin/_display";

export function PayPalCatalogBrowser({ catalog }: { catalog: AdminCatalog }) {
  const { t, formatDate, formatNumber } = useAppLanguage();
  const [kind, setKind] = useState<PayPalResourceKind>("products");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ data?: PayPalCatalogPage; error?: string; kind: PayPalResourceKind; page: number; refresh: number; environment: string } | null>(null);
  const [detail, setDetail] = useState<PayPalCatalogPlan | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const current = result?.kind === kind && result.page === page && result.refresh === refresh && result.environment === catalog.environment ? result : null;
  const busy = current === null;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/admin/catalog/paypal?kind=${kind}&page=${page}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t("admin.paypal.loadFailed"));
        if (data.environment !== catalog.environment) throw new Error(t("admin.paypal.environmentChanged"));
        if (!controller.signal.aborted) setResult({ data, kind, page, refresh, environment: catalog.environment });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error instanceof Error ? error.message : t("admin.paypal.loadFailed"), kind, page, refresh, environment: catalog.environment });
      }
    }
    void load();
    return () => controller.abort();
  }, [kind, page, refresh, catalog.environment, t]);
  function navigate(nextKind: PayPalResourceKind, nextPage = 1) {
    setKind(nextKind); setPage(nextPage); setDetail(null); setDetailError("");
  }
  async function inspect(id: string) {
    setDetailBusy(true); setDetail(null); setDetailError("");
    try {
      const response = await fetch(`/api/admin/catalog/paypal?kind=plans&id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("admin.paypal.planFailed"));
      if (data.environment !== catalog.environment) throw new Error(t("admin.paypal.environmentChanged"));
      setDetail(data);
    } catch (error) { setDetailError(error instanceof Error ? error.message : t("admin.paypal.planFailed")); }
    finally { setDetailBusy(false); }
  }
  function mapping(id: string) {
    const versions = catalog.versions.filter(version => version.environment === catalog.environment &&
      (kind === "products" ? version.paypalProductId === id : version.paypalMonthPlanId === id || version.paypalYearPlanId === id));
    if (!versions.length) return t("admin.paypal.notLinked");
    return versions.map(version => {
      const plan = catalog.plans.find(plan => plan.id === version.planId);
      const active = plan?.currentVersions[catalog.environment] === version.id && version.status === "published";
      return `${version.definition.name} / v${version.id} (${t(active ? "admin.paypal.current" : version.status === "pending" ? "admin.paypal.pending" : "admin.paypal.historical")})`;
    }).join("; ");
  }
  return <section aria-label={t("admin.paypal.label")} className="elevated-card rounded-2xl p-4">
    <details>
    <summary className="cursor-pointer py-2 text-lg font-bold">{t("admin.paypal.title", { environment: catalog.environment })}</summary>
    <div className="space-y-4 pt-3">
    <p className="text-sm text-[var(--text-secondary)]">{t("admin.paypal.help")}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={detailBusy} aria-pressed={kind === "products"} onClick={() => navigate("products")} className="rounded-xl border px-3 py-2 text-sm">{t("admin.paypal.products")}</button>
      <button type="button" disabled={detailBusy} aria-pressed={kind === "plans"} onClick={() => navigate("plans")} className="rounded-xl border px-3 py-2 text-sm">{t("admin.paypal.plans")}</button>
      <button type="button" disabled={busy || detailBusy} onClick={() => { setDetail(null); setDetailError(""); setRefresh(value => value + 1); }} className="rounded-xl border px-3 py-2 text-sm">{t("admin.paypal.refresh")}</button>
    </div>
    {busy && <p role="status" className="text-sm">{t("admin.paypal.loading", { kind: t(`admin.paypal.kind.${kind}`) })}</p>}
    {current?.error && <p role="alert" className="text-sm text-rose-400">{current.error}</p>}
    {current?.data && <>
      <p className="text-xs text-[var(--text-muted)]">{t("admin.paypal.count", { total: formatNumber(current.data.total), kind: t(`admin.paypal.kind.${kind}`), page: formatNumber(current.data.page), pages: formatNumber(current.data.pages), environment: current.data.environment, date: formatDate(current.data.checkedAt) })}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr><th className="p-2">{t("admin.paypalId")}</th><th className="p-2">{t("admin.name")}</th><th className="p-2">{t("admin.paypal.descriptionStatus")}</th><th className="p-2">{t("admin.paypal.mapping")}</th>{kind === "plans" && <th className="p-2">{t("admin.paypal.terms")}</th>}</tr></thead>
        <tbody>{current.data.items.map(item => <tr key={item.id}>
          <td className="p-2 font-mono">{item.id}</td><td className="p-2">{item.name}</td>
          <td className="max-w-sm break-words p-2">{item.status && <strong>{adminStatus(t, item.status)} </strong>}{item.description || (item.status ? "" : t("admin.paypal.noDescription"))}{item.productId && <p>{t("admin.paypal.productValue", { id: item.productId })}</p>}{item.observedAt && <p>{t("admin.paypal.observed", { date: formatDate(item.observedAt) })}</p>}</td>
          <td className="p-2">{mapping(item.id)}</td>
          {kind === "plans" && <td className="p-2"><button type="button" disabled={detailBusy} onClick={() => void inspect(item.id)} className="text-cyan-400">{t("admin.paypal.viewPrice")}</button></td>}
        </tr>)}</tbody>
      </table></div>
      {!current.data.items.length && <p className="text-sm">{t("admin.paypal.empty", { kind: t(`admin.paypal.kind.${kind}`) })}</p>}
      <div className="flex gap-4 text-sm">
        <button type="button" disabled={page <= 1 || detailBusy} onClick={() => navigate(kind, page - 1)} className="text-cyan-400 disabled:opacity-40">{t("admin.previous")}</button>
        <button type="button" disabled={page >= current.data.pages || detailBusy} onClick={() => navigate(kind, page + 1)} className="text-cyan-400 disabled:opacity-40">{t("admin.next")}</button>
      </div>
    </>}
    {detailBusy && <p role="status" className="text-sm">{t("admin.paypal.loadingTerms")}</p>}
    {detailError && <p role="alert" className="text-sm text-rose-400">{detailError}</p>}
    {detail && detail.environment === catalog.environment && <details open className="border-t pt-4 text-sm">
      <summary className="cursor-pointer py-2 font-bold">{t("admin.paypal.selectedTerms")}</summary>
      <div className="space-y-2 pt-2">
      <h4 className="font-bold">{detail.name} / {detail.id}</h4>
      <p>{t("admin.paypal.detail", { status: adminStatus(t, detail.status), id: detail.productId, environment: detail.environment, date: formatDate(detail.checkedAt) })}</p>
      {detail.cycles.map(cycle => <p key={cycle.sequence}>{t("admin.billingCycle", { type: cycle.type, price: cycle.price ? `${cycle.price.currency_code} ${cycle.price.value}` : t("admin.paypal.noFixedPrice"), count: cycle.intervalCount, interval: cycle.interval, cycles: cycle.totalCycles === 0 ? t("admin.unlimited") : cycle.totalCycles })}</p>)}
      {!detail.cycles.length && <p>{t("admin.paypal.noCycles")}</p>}
      <p className="text-xs text-[var(--text-muted)]">{t("admin.paypal.termsHelp")}</p>
      </div>
    </details>}
    </div>
    </details>
  </section>;
}
