"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import type { PlanDefinition } from "@/lib/plans";
import { useAppLanguage } from "@/i18n/provider";
import { translations } from "@/i18n/config";
import {
  KeyRound,
  Cpu,
  ShieldCheck,
  Check,
  Trash2,
  CreditCard,
} from "lucide-react";

interface UsageRow {
  id: number;
  operation: string;
  model: string;
  billingMode: string;
  creditsUsed: number;
  tokensEstimate: number;
  executionSource: string;
  createdAt: string;
}

export function BillingClient({
  plans,
  currentPlanSlug,
  currentPlanVersionId,
  billingCycle,
  aiBillingMode,
  creditsBalance,
  creditsAllowance,
  keyLast4,
  keyValidated,
  preferredModel,
  usageRecords,
  subscription,
  billingReady,
  billingMissing,
  isOwner,
  allowsConfigurableAiMode,
  defaultAiMode,
}: {
  plans: PlanDefinition[];
  currentPlanSlug: string;
  currentPlanVersionId: number | null;
  billingCycle: string;
  aiBillingMode: string;
  creditsBalance: number;
  creditsAllowance: number;
  keyLast4: string | null;
  keyValidated: boolean;
  preferredModel: string;
  usageRecords: UsageRow[];
  subscription: { status: string; paidThrough: string | null; cancelAtPeriodEnd: boolean; hasCustomer: boolean; canChange: boolean; pendingPlanSlug: string | null; pendingInterval: string | null; pendingEffectiveAt: string | null };
  billingReady: boolean;
  billingMissing: string[];
  isOwner: boolean;
  allowsConfigurableAiMode: boolean;
  defaultAiMode: "managed" | "byok";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { t, formatDate, formatNumber } = useAppLanguage();
  const message = (value: string | undefined) => {
    const key = Object.entries(translations.en).find(([key, text]) => key.startsWith("billing.") && text === value)?.[0];
    return key ? t(key) : value;
  };

  const [selectedMode, setMode] = useState<"managed" | "byok">(
    aiBillingMode === "byok" ? "byok" : "managed"
  );
  const mode = allowsConfigurableAiMode ? selectedMode : defaultAiMode;
  const [model, setModel] = useState(preferredModel || "gpt-4o-mini");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "annual">(
    billingCycle === "annual" ? "annual" : "monthly"
  );
  const [saving, setSaving] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const canWithdrawCheckout = currentPlanSlug === "free" && !!subscription.pendingPlanSlug;
  const hasApprovedSubscription = subscription.hasCustomer && !["inactive", "APPROVAL_PENDING"].includes(subscription.status);

  const handleSaveAIConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_ai_config",
          mode,
          preferredModel: model,
          apiKey: apiKeyInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(t("billing.configError"), data.error || t("billing.keyInvalid"), "error");
        return;
      }
      toast(t("billing.providerUpdated"), message(data.message));
      setApiKeyInput("");
      router.refresh();
    } catch {
      toast(t("billing.configError"), t("billing.serverUnavailable"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeKey = async () => {
    try {
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke_byok" }),
    });
    if (res.ok) {
      toast(t("billing.keyRevoked"), t("billing.keyRemoved"));
      router.refresh();
    } else {
      const data = await res.json();
      toast(t("billing.revokeFailed"), data.error || t("billing.retry"), "error");
    }
    } catch { toast(t("billing.revokeFailed"), t("billing.serverUnavailable"), "error"); }
  };

  const handlePlanSwitch = async (plan: Pick<PlanDefinition, "slug" | "catalogVersionId">) => {
    const isLocalChange = plan.slug === "free" || subscription.canChange;
    setRedirecting(true);
    try {
    const res = await fetch(isLocalChange ? "/api/billing" : "/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isLocalChange ? { action: "change_plan" } : {}),
        planSlug: plan.slug,
        catalogVersionId: plan.catalogVersionId,
        billingCycle: cycle,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(t("billing.switchBlocked"), data.error || t("billing.ownerRequired"), "error");
      return;
    }
    if (typeof data.url === "string") {
      window.location.assign(data.url);
    } else if (isLocalChange) {
      toast(t("billing.changeSaved"), message(data.message));
      router.refresh();
    } else {
      if (typeof data.url !== "string") throw new Error("Missing redirect URL");
      window.location.assign(data.url);
    }
    } catch {
      toast(t("billing.unavailable"), t("billing.paypalOpenError"), "error");
    } finally { setRedirecting(false); }
  };
  const openPortal = async () => {
    setRedirecting(true);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") { toast(t("billing.unavailable"), data.error || t("billing.paypalOpenFailed"), "error"); return; }
      window.location.assign(data.url);
    } catch { toast(t("billing.unavailable"), t("billing.paypalUnreachable"), "error"); }
    finally { setRedirecting(false); }
  };
  const refreshSubscription = async () => {
    setRedirecting(true);
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh_subscription" }) });
      const data = await response.json();
      if (!response.ok) { toast(t("billing.reconciliationPending"), data.error || t("billing.retry"), "error"); return; }
      toast(t("billing.statusRefreshed"), message(data.message));
      router.refresh();
    } catch { toast(t("billing.paypalUnavailable"), t("billing.refreshError"), "error"); }
    finally { setRedirecting(false); }
  };

  return (
    <div className="space-y-8">
      <div className="surface-card rounded-3xl p-6 text-sm">
        <p>{t("billing.currentAccess")} <strong>{currentPlanSlug === "free" ? t("billing.free") : currentPlanSlug.replaceAll("_", " ")}</strong>{currentPlanSlug === "free" && t("billing.freeActive")}</p>
        <p>{t("billing.paypalStatus")} <strong>{subscription.status}</strong></p>
        <p>{subscription.paidThrough ? t("billing.paidThrough", { date: formatDate(subscription.paidThrough) }) : t("billing.noPaidPeriod")} {subscription.cancelAtPeriodEnd ? t("billing.cancellationScheduled") : ""}</p>
        {subscription.pendingPlanSlug && <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4">
          <p className="text-cyan-300">{subscription.canChange ? t("billing.pendingChange") : t("billing.pendingCheckout")}: {subscription.pendingPlanSlug.replaceAll("_", " ")} {subscription.pendingInterval === "year" ? t("common.annual") : subscription.pendingInterval === "month" ? t("common.monthly") : ""}{subscription.pendingEffectiveAt ? t("billing.from", { date: formatDate(subscription.pendingEffectiveAt) }) : ""}.</p>
          {canWithdrawCheckout ? <>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("billing.pendingExplanation")}</p>
            <button type="button" disabled={!isOwner || redirecting} onClick={() => handlePlanSwitch({ slug: "free" })} className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold disabled:opacity-50">{t("billing.withdraw")}</button>
          </> : <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("billing.verifiedTerms")}</p>}
        </div>}
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{t("billing.paymentPolicy")}</p>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{t("billing.refundPolicy")}</p>
        {hasApprovedSubscription && <p className="mt-2 text-xs text-[var(--text-secondary)]">{t("billing.revisionPolicy")}</p>}
        {!billingReady && <p className="mt-2 text-amber-400">{t("billing.billingUnavailable")} {billingMissing.length ? t("billing.configurationRequired", { fields: billingMissing.join(", ") }) : t("billing.disabled")}</p>}
        {hasApprovedSubscription && <button type="button" disabled={!isOwner || redirecting} onClick={openPortal} className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold disabled:opacity-50">{t("billing.managePayments")}</button>}
        {subscription.pendingPlanSlug && <button type="button" disabled={!isOwner || redirecting} onClick={refreshSubscription} className="ml-2 mt-3 rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-50">{t("billing.refresh")}</button>}
        {!isOwner && <p className="mt-2 text-xs">{t("billing.onlyOwner")}</p>}
      </div>
      {/* Dimension 1: AI Consumption Model (BYOK vs Managed AI) */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">{t("billing.providerTitle")}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{t("billing.providerDescription")}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400">
            <ShieldCheck className="h-4 w-4" />{t("billing.noSecrets")}</span>
        </div>

        <form onSubmit={handleSaveAIConfig} className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              disabled={!allowsConfigurableAiMode && defaultAiMode !== "managed"}
              onClick={() => setMode("managed")}
              className={`rounded-2xl p-5 text-left transition-all ${
                mode === "managed"
                  ? "border-2 border-cyan-400 bg-cyan-500/10"
                  : "elevated-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <Cpu className="h-6 w-6 text-cyan-400" />
                <span className="text-xs font-extrabold text-cyan-300">
                  {formatNumber(creditsBalance)} / {formatNumber(creditsAllowance)} {t("billing.credits")}</span>
              </div>
              <div className="mt-3 text-base font-extrabold">{t("billing.managedTitle")}</div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("billing.managedDescription")}</p>
            </button>

            <button
              type="button"
              disabled={!allowsConfigurableAiMode && defaultAiMode !== "byok"}
              onClick={() => setMode("byok")}
              className={`rounded-2xl p-5 text-left transition-all ${
                mode === "byok"
                  ? "border-2 border-violet-500 bg-violet-500/10"
                  : "elevated-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <KeyRound className="h-6 w-6 text-violet-400" />
                {keyValidated && keyLast4 && (
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                    {t("billing.vaultKey")} ••••{keyLast4}
                  </span>
                )}
              </div>
              <div className="mt-3 text-base font-extrabold">{t("billing.byokTitle")}</div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("billing.byokDescription")}</p>
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">{t("billing.preferredModel")}</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-xs font-bold"
              >
                <option value="gpt-4o-mini">{t("billing.modelMini")}</option>
                <option value="gpt-4o">{t("billing.modelFlagship")}</option>
                <option value="o3-mini">{t("billing.modelStrategy")}</option>
              </select>
            </div>

            {mode === "byok" && (
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                  {keyLast4
                    ? t("billing.replaceKey", { last4: keyLast4 })
                    : t("billing.enterKey")}
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-proj-..."
                  className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-xs"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg"
              >{t("billing.saveConfig")}</button>

              {mode === "managed" && <span className="self-center text-xs text-[var(--text-muted)]">{t("billing.topupsUnavailable")}</span>}
            </div>

            {keyLast4 && (
              <button
                type="button"
                onClick={handleRevokeKey}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />{t("billing.revokeKey")}</button>
            )}
          </div>
        </form>
      </div>

      {/* Dimension 2: Platform Subscription Tiers */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-violet-400" />
            <div>
              <h2 className="text-lg font-extrabold">{t("billing.planTitle")}</h2>
              <p className="text-xs text-[var(--text-secondary)]">{t("billing.planDescription")}</p>
            </div>
          </div>

          <div className="flex gap-1.5 rounded-xl bg-[var(--bg-elevated)] p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                cycle === "monthly" ? "bg-violet-600 text-white" : "text-[var(--text-secondary)]"
              }`}
            >{t("billing.monthly")}</button>
            <button
              type="button"
              onClick={() => setCycle("annual")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                cycle === "annual" ? "bg-violet-600 text-white" : "text-[var(--text-secondary)]"
              }`}
            >{t("billing.annual")}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.slug === currentPlanSlug && (plan.slug === "free" || cycle === billingCycle) && (!currentPlanVersionId || currentPlanVersionId === plan.catalogVersionId);
            const canWithdrawFromCard = plan.slug === "free" && canWithdrawCheckout;
            const price = cycle === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice;
            return (
              <div
                key={plan.slug}
                className={`rounded-2xl p-5 ${
                  isCurrent
                    ? "border-2 border-cyan-400 bg-cyan-500/10"
                    : "elevated-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold">{plan.name}</span>
                  <span className="text-lg font-extrabold text-cyan-400">{t("billing.price", { amount: formatNumber(price, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{plan.tagline}</p>
                {cycle === "annual" && plan.slug !== "free" && <p className="mt-1 text-xs">{t("billing.annualPrice", { amount: formatNumber(plan.annualMonthlyPrice * 12, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</p>}
                <ul className="mt-4 space-y-1.5 text-xs text-[var(--text-secondary)]">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={(isCurrent && !canWithdrawFromCard) || !isOwner || redirecting || (plan.slug !== "free" && (!billingReady || !plan.purchasable || (!!subscription.paidThrough && new Date(subscription.paidThrough) > new Date() && !subscription.canChange)))}
                  onClick={() => handlePlanSwitch(plan)}
                  className={`mt-5 w-full rounded-xl py-2 text-xs font-bold ${
                    isCurrent
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-violet-600 text-white hover:bg-violet-500"
                  }`}
                >
                  {canWithdrawFromCard ? t("billing.withdraw") : isCurrent ? t("billing.currentPlan") : plan.slug === "free" ? t("billing.stopRenewals") : !plan.purchasable ? t("billing.notPublished") : subscription.canChange ? t("billing.changePlan", { name: plan.name, cycle: t(cycle === "annual" ? "common.annual" : "common.monthly") }) : t("billing.checkoutPlan", { name: plan.name })}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Usage Ledger */}
      <div className="surface-card rounded-3xl p-6">
        <h3 className="text-base font-extrabold">{t("billing.ledger")}</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[11px] uppercase text-[var(--text-muted)]">
                <th className="py-2.5 pr-4">{t("billing.operation")}</th>
                <th className="py-2.5 pr-4">{t("billing.model")}</th>
                <th className="py-2.5 pr-4">{t("billing.mode")}</th>
                <th className="py-2.5 pr-4">{t("billing.charged")}</th>
                <th className="py-2.5 pr-4">{t("billing.tokens")}</th>
                <th className="py-2.5">{t("billing.source")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {usageRecords.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-4 font-semibold">{u.operation}</td>
                  <td className="py-2.5 pr-4 font-mono text-cyan-400">{u.model}</td>
                  <td className="py-2.5 pr-4 uppercase">{u.billingMode === "managed" ? t("billing.managed") : u.billingMode}</td>
                  <td className="py-2.5 pr-4 font-bold">{formatNumber(u.creditsUsed)}</td>
                  <td className="py-2.5 pr-4">{formatNumber(u.tokensEstimate)}</td>
                  <td className="py-2.5 text-[var(--text-muted)]">{u.executionSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
