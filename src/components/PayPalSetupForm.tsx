"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminCatalog, PayPalSetupSelection } from "@/lib/billing-catalog";
import type { PayPalCatalogPage, PayPalResourceKind } from "@/lib/paypal-catalog";
import { useAppLanguage } from "@/i18n/provider";
import { adminStatus } from "@/app/app/admin/_display";

const createNew = "__create_new__";
type Props = {
  plan: AdminCatalog["plans"][number];
  environment: AdminCatalog["environment"];
  linkedProductId?: string;
  busy: boolean;
  onSubmit: (setup: PayPalSetupSelection) => void;
  onCancel: () => void;
};
export function PayPalSetupForm({ plan, environment, linkedProductId, busy, onSubmit, onCancel }: Props) {
  const { t, formatNumber } = useAppLanguage();
  const [products, setProducts] = useState<PayPalCatalogPage | null>(null);
  const [plans, setPlans] = useState<PayPalCatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [productId, setProductId] = useState(linkedProductId ?? "");
  const [monthId, setMonthId] = useState("");
  const [yearId, setYearId] = useState("");
  const [replacePending, setReplacePending] = useState(false);
  const read = useCallback(async (kind: PayPalResourceKind, page: number, signal?: AbortSignal): Promise<PayPalCatalogPage> => {
    const response = await fetch(`/api/admin/catalog/paypal?kind=${kind}&page=${page}`, { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("admin.paypal.loadFailed"));
    if (data.environment !== environment) throw new Error(t("admin.setup.environmentChanged"));
    return data;
  }, [environment, t]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const [products, plans] = await Promise.all([read("products", 1, controller.signal), read("plans", 1, controller.signal)]);
        if (!controller.signal.aborted) { setProducts(products); setPlans(plans); }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : t("admin.paypal.loadFailed"));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [read, refresh, t]);
  async function more(kind: PayPalResourceKind) {
    const current = kind === "products" ? products : plans;
    if (!current || current.page >= current.pages) return;
    setLoading(true); setError("");
    try {
      const next = await read(kind, current.page + 1);
      const combined = { ...next, items: [...current.items, ...next.items] };
      if (kind === "products") setProducts(combined); else setPlans(combined);
    } catch (error) { setError(error instanceof Error ? error.message : t("admin.setup.moreFailed")); }
    finally { setLoading(false); }
  }
  const choices = plans?.items.filter(item => item.productId === productId) ?? [];
  const control = "elevated-card mt-2 w-full rounded-xl p-3 text-sm";
  return <form aria-label={t("admin.setup.label", { name: plan.draft.name })} className="space-y-4 rounded-xl border border-violet-500/40 bg-violet-500/5 p-4" onSubmit={event => {
    event.preventDefault();
    onSubmit({
      ...(productId !== createNew ? { productId } : {}),
      ...(productId !== createNew && monthId !== createNew ? { monthPlanId: monthId } : {}),
      ...(productId !== createNew && yearId !== createNew ? { yearPlanId: yearId } : {}),
      ...(plan.publishingVersionId && replacePending ? { replacePendingVersionId: plan.publishingVersionId } : {}),
    });
  }}>
    <h4 className="font-bold">{t("admin.setup.title", { name: plan.draft.name, environment })}</h4>
    <p className="text-sm text-[var(--text-secondary)]">{t("admin.setup.help")}</p>
    {loading && <p role="status">{t("admin.setup.loading")}</p>}
    {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    {error && <button type="button" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)} className="rounded-xl border px-3 py-2 text-sm">{t("admin.setup.reload")}</button>}
    <fieldset disabled={busy || loading || !!error} className="space-y-4 disabled:opacity-60">
      <label className="block text-sm font-semibold">{t("admin.setup.product")}
        <select required className={control} value={productId} disabled={!!linkedProductId} onChange={event => { setProductId(event.target.value); setMonthId(""); setYearId(""); }}>
          <option value="">{t("admin.setup.selectProduct")}</option>
          {linkedProductId && !products?.items.some(item => item.id === linkedProductId) && <option value={linkedProductId}>{t("admin.setup.linkedProduct", { id: linkedProductId })}</option>}
          {products?.items.map(item => <option key={item.id} value={item.id}>{item.name} - {item.id}</option>)}
          {!linkedProductId && <option value={createNew}>{t("admin.setup.newProduct")}</option>}
        </select>
      </label>
      {!!products && products.page < products.pages && <button type="button" onClick={() => void more("products")} className="rounded-lg border px-3 py-2 text-sm">{t("admin.setup.moreProducts")}</button>}
      {productId && productId !== createNew && <div className="grid gap-4 sm:grid-cols-2">
        {(["month", "year"] as const).map(interval => <label key={interval} className="text-sm font-semibold">{t(interval === "month" ? "admin.setup.monthlyPlan" : "admin.setup.annualPlan")}
          <select required className={control} value={interval === "month" ? monthId : yearId} onChange={event => (interval === "month" ? setMonthId : setYearId)(event.target.value)}>
            <option value="">{t("admin.setup.selectPlan")}</option>
            {choices.map(item => <option key={item.id} value={item.id} disabled={item.status !== "ACTIVE"}>{item.name} - {item.id} ({adminStatus(t, item.status ?? "")})</option>)}
            <option value={createNew}>{t(interval === "month" ? "admin.setup.createMonthly" : "admin.setup.createAnnual", { price: formatNumber(interval === "month" ? plan.draft.monthlyPrice : plan.draft.annualMonthlyPrice * 12, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</option>
          </select>
        </label>)}
      </div>}
      {!!plans && plans.page < plans.pages && <button type="button" onClick={() => void more("plans")} className="rounded-lg border px-3 py-2 text-sm">{t("admin.setup.morePlans")}</button>}
      {productId === createNew && <p className="text-sm">{t("admin.setup.createHelp")}</p>}
      {!!plan.publishingVersionId && <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" required checked={replacePending} onChange={event => setReplacePending(event.target.checked)} />
        <span>{t("admin.setup.replace", { id: plan.publishingVersionId })}</span>
      </label>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!productId || (productId !== createNew && (!monthId || !yearId)) || (!!plan.publishingVersionId && !replacePending)} className="min-h-12 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{t("admin.setup.submit")}</button>
      </div>
    </fieldset>
    <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border px-4 py-2 text-sm">{t("admin.setup.cancel")}</button>
  </form>;
}
