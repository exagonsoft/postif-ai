"use client";

import { useRef, useState } from "react";
import type { AdminCatalog, CatalogSourceComparison as SourceComparison, CatalogVerification, PayPalSetupSelection } from "@/lib/billing-catalog";
import type { PayPalCatalogConnection } from "@/lib/paypal";
import type { PlanDefinition } from "@/lib/plans";
import { PayPalCatalogBrowser } from "./PayPalCatalogBrowser";
import { CatalogPlanCard } from "./CatalogPlanCard";
import { PayPalSetupForm } from "./PayPalSetupForm";
import { PayPalPlanNameUpdate } from "./PayPalPlanNameUpdate";
import { CatalogSourceComparison } from "./CatalogSourceComparison";
import { CatalogBlockControls } from "./CatalogBlockControls";
import { normalizePayPalPlanDescription } from "@/lib/paypal-catalog-text";
import { useAppLanguage } from "@/i18n/provider";
import { adminStatus } from "@/app/app/admin/_display";

const numericFields = ["monthlyPrice", "annualMonthlyPrice", "maxBrands", "maxChannels", "maxPostsPerMonth", "includedMonthlyCredits"] as const;
const booleanFields = ["allowsConfigurableAiMode", "autopilotEnabled", "teamCollaboration", "campaignsEnabled", "advancedAnalytics", "popular"] as const;
const newDefinition: PlanDefinition = {
  slug: "", name: "", description: "", tagline: "", monthlyPrice: 9, annualMonthlyPrice: 7,
  defaultAiMode: "byok", allowsConfigurableAiMode: false,
  maxBrands: 1, maxChannels: 3, maxPostsPerMonth: 30, includedMonthlyCredits: 0,
  autopilotEnabled: false, teamCollaboration: false, campaignsEnabled: true,
  advancedAnalytics: false, features: [],
};

export function BillingCatalogAdmin({ initialCatalog }: { initialCatalog: AdminCatalog }) {
  const { t, formatDate, formatNumber } = useAppLanguage();
  const label = (value: string) => t(`admin.planFields.${value}`);
  const catalogRef = useRef<HTMLElement>(null);
  const draftRef = useRef<HTMLDetailsElement>(null);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [busy, setBusy] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [feedbackPlanId, setFeedbackPlanId] = useState<number | null>(null);
  const [configuringId, setConfiguringId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<PayPalCatalogConnection | null>(null);
  const [verifications, setVerifications] = useState<Record<number, CatalogVerification>>({});
  const [comparisons, setComparisons] = useState<Record<number, SourceComparison>>({});
  const [comparisonErrors, setComparisonErrors] = useState<Record<number, string>>({});
  const [readingVersionId, setReadingVersionId] = useState<number | null>(null);
  const [product, setProduct] = useState({ id: 0, revision: 0, slug: "", name: "", description: "" });
  const [editingId, setEditingId] = useState(0);
  const [editingRevision, setEditingRevision] = useState(0);
  const [productId, setProductId] = useState(catalog.products[0]?.id ?? 0);
  const [definition, setDefinition] = useState<PlanDefinition>(newDefinition);
  const control = "elevated-card w-full rounded-xl p-2 text-sm";
  const paidPlans = catalog.plans.filter(plan => plan.slug !== "free" && !plan.archived);
  const linkedPlans = paidPlans.filter(plan => catalog.versions.some(version => version.id === plan.currentVersions[catalog.environment] &&
    version.environment === catalog.environment && version.status === "published" && version.paypalProductId && version.paypalMonthPlanId && version.paypalYearPlanId));
  const visibleVersionId = (plan: AdminCatalog["plans"][number]) => plan.currentVersions[plan.slug === "free" ? "local" : catalog.environment] ?? plan.publishingVersionId ?? 0;
  async function perform(action: object, success: string, planId: number | null = null) {
    setBusy(true); setError(""); setMessage("");
    setComparisons({}); setComparisonErrors({});
    setFeedbackPlanId(planId);
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("admin.catalog.failed"));
      setCatalog(data);
      setConnection(null); setVerifications({});
      setMessage(success);
      if (planId !== null) setConfiguringId(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("admin.catalog.failed"));
      if (planId !== null) {
        try {
          const response = await fetch("/api/admin/catalog", { cache: "no-store" });
          if (!response.ok) throw new Error(t("admin.catalog.refreshFailed"));
          setCatalog(await response.json());
        } catch { setError(previous => `${previous} ${t("admin.catalog.reloadPending")}`); }
      }
    }
    finally { setBusy(false); }
  }
  async function readSources(versionId: number) {
    setBusy(true); setReadingVersionId(versionId);
    setComparisons(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => Number(id) !== versionId)));
    setComparisonErrors(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => Number(id) !== versionId)));
    try {
      const response = await fetch(`/api/admin/catalog?readVersionId=${versionId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("admin.catalog.sourcesFailed"));
      if (data.environment !== catalog.environment || data.versionId !== versionId) throw new Error(t("admin.catalog.mappingChanged"));
      setComparisons(previous => ({ ...previous, [versionId]: data }));
    } catch (failure) {
      setComparisonErrors(previous => ({ ...previous, [versionId]: failure instanceof Error ? failure.message : t("admin.catalog.sourcesFailed") }));
    } finally { setBusy(false); setReadingVersionId(null); }
  }
  async function refreshMongo() {
    setBusy(true); setError(""); setMessage(""); setFeedbackPlanId(null);
    setComparisons({}); setComparisonErrors({});
    try {
      const response = await fetch("/api/admin/catalog", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("admin.catalog.mongoFailed"));
      setCatalog(data); setVerifications({}); setConnection(null);
      setMessage(t("admin.catalog.mongoRefreshed"));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("admin.catalog.mongoFailed")); }
    finally { setBusy(false); }
  }
  async function verify(versionId?: number) {
    setBusy(true); setError(""); setMessage("");
    setFeedbackPlanId(null);
    if (versionId === undefined) setConnection(null);
    else setVerifications(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => Number(id) !== versionId)));
    try {
      const query = versionId === undefined ? "checkConnection=true" : `verifyVersionId=${versionId}`;
      const response = await fetch(`/api/admin/catalog?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("admin.catalog.verifyFailed"));
      if (versionId === undefined) setConnection(data);
      else setVerifications(previous => ({ ...previous, [versionId]: data }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("admin.catalog.verifyFailed")); }
    finally { setBusy(false); }
  }
  async function publish(plan: AdminCatalog["plans"][number], setup?: PayPalSetupSelection) {
    if (!setup && plan.slug !== "free" && !plan.publishingVersionId && !plan.currentVersions[catalog.environment]) {
      setConfiguringId(plan.id);
      return;
    }
    setPublishingId(plan.id);
    try {
      await perform(setup ? { action: "use_paypal_setup", id: plan.id, revision: plan.revision, setup } : { action: "publish_plan", id: plan.id, revision: plan.revision },
        plan.slug === "free" ? t("admin.catalog.freePublished") : t("admin.catalog.published", { name: plan.draft.name }), plan.id);
    } finally { setPublishingId(null); }
  }
  return <section ref={catalogRef} className="surface-card space-y-6 rounded-3xl p-6">
    <div>
      <h2 className="text-xl font-bold">{t("admin.catalog.title", { environment: catalog.environment })}</h2>
      <CatalogBlockControls containerRef={catalogRef} />
      <p className="mt-2 text-xs text-[var(--text-muted)]">{t("admin.catalog.blocksHelp")}</p>
      <details className="mt-4 rounded-xl border border-[var(--border-subtle)] p-4">
        <summary className="cursor-pointer py-2 font-semibold">{t("admin.catalog.statusHelp")}</summary>
        <div className="pt-2">
      <p className="mt-2 text-sm"><strong>{t("admin.catalog.mongoLocal")}</strong> {t("admin.catalog.recordsHelp")}</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{t("admin.catalog.readAt", { date: formatDate(catalog.readAt) })}</p>
      <button className="mt-3 mr-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50" type="button" disabled={busy} onClick={() => void refreshMongo()}>{t("admin.catalog.refreshMongo")}</button>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("admin.catalog.setupHelp")}</p>
      <p className="mt-2 text-sm">{t("admin.catalog.freeHelp")}</p>
      <p className="mt-2 text-sm">{t("admin.catalog.customerBilling")} <strong>{t(catalog.billing.enabled ? "admin.enabled" : "admin.disabled")}</strong>. {t("admin.catalog.mappingCount", { linked: formatNumber(linkedPlans.length), paid: formatNumber(paidPlans.length), environment: catalog.environment })}</p>
      {!!catalog.billing.missing.length && <p className="mt-2 text-sm text-amber-400">{t("admin.catalog.missingConfig", { names: catalog.billing.missing.join(", ") })}</p>}
      {!!catalog.billing.invalid.length && <p className="mt-2 text-sm text-amber-400">{t("admin.catalog.invalidConfig", { names: catalog.billing.invalid.join(", ") })}</p>}
      <button className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="button" disabled={busy} onClick={() => void verify()}>{t("admin.catalog.checkConnection")}</button>
      {connection && <p role="status" className="mt-3 text-sm text-emerald-400">{t("admin.catalog.connectionVerified", { environment: connection.environment, date: formatDate(connection.checkedAt), products: formatNumber(connection.products), plans: formatNumber(connection.plans) })}</p>}
        </div>
      </details>
    </div>
    {feedbackPlanId === null && error && <p role="alert" className="text-rose-400">{error}</p>}
    {feedbackPlanId === null && message && <p role="status" className="text-emerald-400">{message}</p>}
    <fieldset disabled={busy} className="space-y-6 disabled:opacity-60">
      {!catalog.products.length && !catalog.plans.length && <button className={control} type="button" onClick={() => void perform({ action: "initialize_defaults" }, t("admin.catalog.initialized"))}>{t("admin.catalog.initialize")}</button>}
      <details open className="rounded-2xl border border-[var(--border-subtle)] p-4">
        <summary className="cursor-pointer py-2 text-lg font-bold">{t("admin.catalog.plans", { count: formatNumber(catalog.plans.length) })}</summary>
        <div className="space-y-3 pt-3">
        <p className="text-sm text-[var(--text-secondary)]">{t("admin.catalog.chooseHelp")}</p>
        {catalog.plans.map(plan => <CatalogPlanCard key={plan.id} plan={plan}
          product={catalog.products.find(product => product.id === plan.productId)}
          currentVersion={catalog.versions.find(version => version.id === plan.currentVersions[plan.slug === "free" ? "local" : catalog.environment])}
          environment={catalog.environment} busy={busy} publishing={publishingId === plan.id}
          onPublish={() => void publish(plan)}
          onConfigure={() => setConfiguringId(plan.id)}
          onEdit={() => {
            setEditingId(plan.id); setEditingRevision(plan.revision); setProductId(plan.productId); setDefinition({ ...plan.draft, description: plan.draft.description ?? "" });
            if (draftRef.current) { draftRef.current.open = true; draftRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }
          }}
          onArchive={() => void perform({ action: "archive_plan", id: plan.id, revision: plan.revision, archived: !plan.archived }, t("admin.catalog.planVisibility"))}>
          {feedbackPlanId === plan.id && error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          {feedbackPlanId === plan.id && message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
          <CatalogSourceComparison plan={plan}
            version={catalog.versions.find(version => version.id === visibleVersionId(plan))}
            environment={catalog.environment} mongoReadAt={catalog.readAt} busy={busy}
            reading={readingVersionId === visibleVersionId(plan)}
            comparison={comparisons[visibleVersionId(plan)]}
            error={comparisonErrors[visibleVersionId(plan)]}
            onRefresh={() => {
              const versionId = visibleVersionId(plan);
              if (versionId) void readSources(versionId);
            }} />
          {configuringId === plan.id && <details open className="mt-3 rounded-xl border border-[var(--border-subtle)] p-3">
            <summary className="cursor-pointer py-2 font-semibold">{t("admin.setup.label", { name: plan.draft.name })}</summary>
            <PayPalSetupForm key={`${plan.id}:${plan.publishingVersionId ?? "new"}:${catalog.environment}`} plan={plan} environment={catalog.environment} busy={busy}
            linkedProductId={catalog.products.find(product => product.id === plan.productId)?.paypalProductIds[catalog.environment]}
            onSubmit={setup => void publish(plan, setup)} onCancel={() => setConfiguringId(null)} />
          </details>}
          {catalog.versions.filter(version => version.id === plan.currentVersions[catalog.environment]).map(version => <PayPalPlanNameUpdate key={version.id} version={version} environment={catalog.environment} busy={busy}
            onConfirm={details => void perform({ action: "update_plan_details", versionId: version.id, revision: plan.revision, ...details, confirm: true }, t("admin.catalog.detailsSaved"), plan.id)} />)}
          <details><summary className="cursor-pointer rounded-lg py-2 text-sm font-semibold text-[var(--text-secondary)]">{t("admin.catalog.history")}</summary>{catalog.versions.filter(version => version.planId === plan.id).map(version => <details key={version.id} className="mt-3 rounded-lg border border-[var(--border-subtle)] p-3 text-xs">
            <summary className="cursor-pointer py-2 font-semibold">{t("admin.catalog.versionSummary", { id: version.id, environment: version.environment, status: adminStatus(t, version.status), monthly: formatNumber(version.definition.monthlyPrice), annual: formatNumber(version.definition.annualMonthlyPrice * 12, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), credits: formatNumber(version.definition.includedMonthlyCredits) })}</summary>
            <div className="space-y-2 pt-2">
            <p>{t("admin.catalog.savedIds", { product: version.paypalProductId || t("admin.catalog.noProduct"), monthly: version.paypalMonthPlanId || t("admin.catalog.noMonthlyId"), annual: version.paypalYearPlanId || t("admin.catalog.noAnnualId") })}</p>
            {([["Monthly", version.monthPaymentPolicy], ["Annual", version.yearPaymentPolicy]] as const).map(([interval, policy]) => policy && <p key={interval}>{t(interval === "Monthly" ? "admin.catalog.monthPolicy" : "admin.catalog.annualPolicy", { enabled: t(policy.autoBillOutstanding ? "admin.enabled" : "admin.disabled"), threshold: policy.paymentFailureThreshold })}</p>)}
            {version.status === "pending" && <p>{t("admin.catalog.manualPending", { attempts: version.publicationAttempts })}</p>}
            {version.publicationError && <p role="alert" className="text-rose-400">{version.publicationError}</p>}
            <p>{t("admin.catalog.lastVerification", { status: adminStatus(t, version.syncStatus), date: version.syncCheckedAt ? formatDate(version.syncCheckedAt) : t("admin.notRecorded") })}</p>
            {version.syncError && <p role="alert" className="text-rose-400">{version.syncError}</p>}
            <button type="button" disabled={version.status !== "published" || (version.environment !== "local" && version.environment !== catalog.environment)} onClick={() => void verify(version.id)}>{t("admin.catalog.verifyProduct")}</button>
            {version.id !== plan.currentVersions[catalog.environment] && <PayPalPlanNameUpdate version={version} environment={catalog.environment} busy={busy}
              onConfirm={details => void perform({ action: "update_plan_details", versionId: version.id, revision: plan.revision, ...details, confirm: true }, t("admin.catalog.historicalSaved"), plan.id)} />}
            {verifications[version.id] && <p className="text-emerald-400">{t(verifications[version.id].status === "local_only" ? "admin.catalog.localVerified" : "admin.catalog.paypalVerified")} {t("admin.catalog.checkedAt", { date: formatDate(verifications[version.id].checkedAt) })}</p>}
            </div>
          </details>)}</details>
        </CatalogPlanCard>)}
        </div>
      </details>
      <details ref={draftRef} className="rounded-2xl border border-[var(--border-subtle)] p-4">
        <summary className="cursor-pointer py-2 text-lg font-bold">{t(editingId ? "admin.catalog.editDraft" : "admin.catalog.createDraft")}</summary>
        <div className="space-y-3 pt-3">
        <p className="text-sm text-[var(--text-secondary)]">{t("admin.catalog.draftHelp")}</p>
        <p className="text-sm text-[var(--text-secondary)]">{t("admin.catalog.editDetailsHelp")}</p>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={event => {
          event.preventDefault();
          void perform(editingId ? { action: "edit_plan", id: editingId, revision: editingRevision, definition } : { action: "create_plan", productId, definition }, t("admin.catalog.draftSaved"));
        }}>
          <label>{t("admin.product")}<select className={control} required disabled={!!editingId} value={productId} onChange={event => setProductId(Number(event.target.value))}><option value={0}>{t("admin.catalog.selectProduct")}</option>{catalog.products.filter(item => !item.archived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {(["slug", "name", "tagline"] as const).map(field => <label key={field}>{label(field)}<input className={control} required disabled={field === "slug" && !!editingId} maxLength={field === "slug" ? 64 : field === "name" ? 127 : 500} value={definition[field]} onChange={event => setDefinition({ ...definition, [field]: event.target.value })} /></label>)}
          <label className="sm:col-span-3">{t("admin.catalog.description")}<textarea className={`${control} resize-y`} rows={4} name="description" required maxLength={127} value={definition.description ?? ""} onChange={event => setDefinition({ ...definition, description: event.target.value })} /></label>
          <p className="sm:col-span-3 text-xs text-[var(--text-secondary)]">{t("admin.catalog.descriptionHelp")} {normalizePayPalPlanDescription(definition.description ?? "") || t("admin.enterDescription")}</p>
          {numericFields.map(field => <label key={field}>{label(field)}{field.includes("Price") ? " (USD)" : ""}<input className={control} type="number" required min={0} max={field.includes("Price") ? 100000 : 10000000} step={field.includes("Price") ? "0.01" : "1"} value={definition[field]} onChange={event => setDefinition({ ...definition, [field]: Number(event.target.value) })} /></label>)}
          <label>{t("admin.catalog.defaultAi")}<select className={control} value={definition.defaultAiMode} onChange={event => setDefinition({ ...definition, defaultAiMode: event.target.value as "managed" | "byok" })}><option value="byok">BYOK</option><option value="managed">{t("admin.catalog.managed")}</option></select></label>
          {booleanFields.map(field => <label key={field} className="flex items-center gap-2"><input type="checkbox" checked={definition[field] ?? false} onChange={event => setDefinition({ ...definition, [field]: event.target.checked })} />{label(field)}</label>)}
          <label className="sm:col-span-3">{t("admin.catalog.features")}<textarea className={control} value={definition.features.join("\n")} onChange={event => setDefinition({ ...definition, features: event.target.value.split("\n") })} /></label>
          <button className={control} type="submit">{t(editingId ? "admin.catalog.saveRevision" : "admin.catalog.createLocalPlan")}</button>
          <button type="button" onClick={() => { setEditingId(0); setEditingRevision(0); setDefinition(newDefinition); }}>{t("admin.catalog.newPlan")}</button>
        </form>
        </div>
      </details>
      <details className="rounded-2xl border border-[var(--border-subtle)] p-4">
        <summary className="cursor-pointer py-2 font-semibold">{t("admin.catalog.products")}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">{t("admin.catalog.productsHelp")}</p>
          {catalog.products.map(item => <div key={item.id} className="elevated-card flex flex-wrap items-center gap-3 rounded-xl p-3">
            <span>{t("admin.catalog.productSummary", { name: item.name, slug: item.slug, revision: item.revision, status: t(item.archived ? "admin.catalog.archived" : "admin.catalog.productDraft") })}{item.publishingVersionId ? ` · ${t("admin.catalog.publishing")}` : ""}</span>
            <button type="button" disabled={!!item.publishingVersionId} onClick={() => setProduct({ id: item.id, revision: item.revision, slug: item.slug, name: item.name, description: item.description })}>{t("admin.edit")}</button>
            <button type="button" disabled={!!item.publishingVersionId} onClick={() => void perform({ action: "archive_product", id: item.id, revision: item.revision, archived: !item.archived }, t("admin.catalog.productVisibility"))}>{t(item.archived ? "admin.restore" : "admin.archive")}</button>
          </div>)}
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={event => {
            event.preventDefault();
            void perform(product.id ? { action: "edit_product", id: product.id, revision: product.revision, name: product.name, description: product.description } : { action: "create_product", slug: product.slug, name: product.name, description: product.description }, t("admin.catalog.productSaved"));
          }}>
            <label>{t("admin.catalog.productSlug")}<input className={control} required maxLength={64} disabled={!!product.id} value={product.slug} onChange={event => setProduct({ ...product, slug: event.target.value })} /></label>
            <label>{t("admin.name")}<input className={control} required maxLength={127} value={product.name} onChange={event => setProduct({ ...product, name: event.target.value })} /></label>
            <label className="sm:col-span-3">{t("admin.catalog.productDescription")}<textarea className={`${control} resize-y`} rows={4} name="description" required maxLength={256} value={product.description} onChange={event => setProduct({ ...product, description: event.target.value })} /></label>
            <button className={control} type="submit">{t(product.id ? "admin.catalog.saveProduct" : "admin.catalog.createLocalProduct")}</button>
            <button type="button" onClick={() => setProduct({ id: 0, revision: 0, slug: "", name: "", description: "" })}>{t("admin.catalog.newProduct")}</button>
          </form>
        </div>
      </details>
    </fieldset>
    <PayPalCatalogBrowser key={catalog.versions.map(version => `${version.id}:${version.status}:${version.paypalMonthName}:${version.paypalYearName}:${version.paypalMonthDescription}:${version.paypalYearDescription}:${version.nameUpdatePending}`).join(",")} catalog={catalog} />
  </section>;
}
