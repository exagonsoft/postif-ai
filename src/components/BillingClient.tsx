"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";
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
  currentPlanSlug,
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
  currentPlanSlug: string;
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
        toast("AI Configuration Error", data.error || "Could not validate key.", "error");
        return;
      }
      toast("AI Provider Updated", data.message);
      setApiKeyInput("");
      router.refresh();
    } catch {
      toast("AI Configuration Error", "Could not reach the server. Please retry.", "error");
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
      toast("BYOK Key Revoked", "Stored key removed. AI mode is unchanged; BYOK generation requires a new key.");
      router.refresh();
    } else {
      const data = await res.json();
      toast("Could not revoke key", data.error || "Please retry.", "error");
    }
    } catch { toast("Could not revoke key", "Could not reach the server. Please retry.", "error"); }
  };

  const handlePlanSwitch = async (planSlug: string) => {
    setRedirecting(true);
    try {
    const res = await fetch(subscription.canChange ? "/api/billing" : "/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(subscription.canChange ? { action: "change_plan" } : {}),
        planSlug,
        billingCycle: cycle,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast("Plan switch blocked", data.error || "Requires Owner/Admin role.", "error");
      return;
    }
    if (subscription.canChange) {
      toast("Billing change saved", data.message);
      router.refresh();
    } else {
      if (typeof data.url !== "string") throw new Error("Missing redirect URL");
      window.location.assign(data.url);
    }
    } catch {
      toast("Billing unavailable", "Could not open Stripe. Please retry.", "error");
    } finally { setRedirecting(false); }
  };
  const openPortal = async () => {
    setRedirecting(true);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") { toast("Billing unavailable", data.error || "Could not open Stripe.", "error"); return; }
      window.location.assign(data.url);
    } catch { toast("Billing unavailable", "Could not reach Stripe.", "error"); }
    finally { setRedirecting(false); }
  };

  return (
    <div className="space-y-8">
      <div className="surface-card rounded-3xl p-6 text-sm">
        <p>Subscription: <strong>{subscription.status}</strong> · Current access: <strong>{currentPlanSlug.replaceAll("_", " ")}</strong></p>
        <p>{subscription.paidThrough ? `Paid through ${new Date(subscription.paidThrough).toLocaleString()}.` : "No verified paid period."} {subscription.cancelAtPeriodEnd ? "Cancellation scheduled; paid access remains until the paid-through date." : ""}</p>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">No trials. Access activates only after verified payment. Included credits reset each paid anniversary month without rollover, including annual plans. Expiry returns to Free BYOK without deleting workspace data. Top-ups are unavailable pending pricing.</p>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">Refunded or disputed payments invalidate the affected paid term and unused credits, without deleting data. Replayed invoices cannot restore them; a fresh verified payment is required.</p>
        {subscription.hasCustomer && <p className="mt-2 text-xs text-[var(--text-secondary)]">Upgrades, downgrades and billing-cycle changes take effect at your existing paid-through boundary, without proration. The new term activates only after its payment is verified. Choose your existing plan/cycle to remove a scheduled change or resume renewal.</p>}
        {subscription.pendingPlanSlug && <p className="mt-2 text-cyan-300">Scheduled: {subscription.pendingPlanSlug.replaceAll("_", " ")} {subscription.pendingInterval === "year" ? "annual" : subscription.pendingInterval === "month" ? "monthly" : ""} from {subscription.pendingEffectiveAt ? new Date(subscription.pendingEffectiveAt).toLocaleString() : "the next paid term"}.</p>}
        {!billingReady && <p className="mt-2 text-amber-400">Billing unavailable. {billingMissing.length ? `Operator configuration required: ${billingMissing.join(", ")}.` : "Billing is disabled by the operator."}</p>}
        {subscription.hasCustomer && <button type="button" disabled={!isOwner || !billingReady || redirecting} onClick={openPortal} className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold disabled:opacity-50">Manage payment methods / invoices in Stripe</button>}
        {!isOwner && <p className="mt-2 text-xs">Only the workspace owner can purchase or manage subscriptions.</p>}
      </div>
      {/* Dimension 1: AI Consumption Model (BYOK vs Managed AI) */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">
              Dimension 1: AI Provider & Consumption Mode (BYOK vs. Managed AI)
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Route all AI requests securely through POSTIF-AI’s backend using either Managed AI
              credits or your own AES-256-GCM encrypted OpenAI API key.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400">
            <ShieldCheck className="h-4 w-4" /> Zero Frontend Secret Exposure
          </span>
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
                  {creditsBalance} / {creditsAllowance} Credits
                </span>
              </div>
              <div className="mt-3 text-base font-extrabold">Managed AI Credits</div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Turnkey OpenAI integration managed by POSTIF-AI. Deducts operation credits per
                generation.
              </p>
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
                    Vault Key ••••{keyLast4}
                  </span>
                )}
              </div>
              <div className="mt-3 text-base font-extrabold">
                Bring Your Own OpenAI Key (BYOK)
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Pay OpenAI directly for tokens while consuming 0 POSTIF-AI credits.
              </p>
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                Preferred OpenAI Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-xs font-bold"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Fast, High-Efficiency)</option>
                <option value="gpt-4o">gpt-4o (Flagship Multimodal Reasoning)</option>
                <option value="o3-mini">o3-mini (Structured Strategy & Campaign Logic)</option>
              </select>
            </div>

            {mode === "byok" && (
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                  {keyLast4
                    ? `Replace OpenAI API Key (Current: ••••${keyLast4})`
                    : "Enter OpenAI API Key (sk-...)"}
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
              >
                Save AI Provider Configuration
              </button>

              {mode === "managed" && <span className="self-center text-xs text-[var(--text-muted)]">Credit top-ups unavailable — pricing pending.</span>}
            </div>

            {keyLast4 && (
              <button
                type="button"
                onClick={handleRevokeKey}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke Stored Key
              </button>
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
              <h2 className="text-lg font-extrabold">
                Platform Subscription Plan
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Determines brand limits, connected channels, monthly publishing caps, and
                Autopilot access.
              </p>
            </div>
          </div>

          <div className="flex gap-1.5 rounded-xl bg-[var(--bg-elevated)] p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                cycle === "monthly" ? "bg-violet-600 text-white" : "text-[var(--text-secondary)]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("annual")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                cycle === "annual" ? "bg-violet-600 text-white" : "text-[var(--text-secondary)]"
              }`}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.values(SUBSCRIPTION_PLANS).map((plan) => {
            const isCurrent = plan.slug === currentPlanSlug && (plan.slug === "free" || cycle === billingCycle);
            const canResume = isCurrent && (subscription.cancelAtPeriodEnd || Boolean(subscription.pendingPlanSlug));
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
                  <span className="text-lg font-extrabold text-cyan-400">${price} USD/mo</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{plan.tagline}</p>
                {cycle === "annual" && plan.slug !== "free" && <p className="mt-1 text-xs">${plan.annualMonthlyPrice * 12} USD billed annually; included credits renew monthly.</p>}
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
                  disabled={(isCurrent && !canResume) || !isOwner || !billingReady || redirecting || (plan.slug === "free" && !subscription.canChange)}
                  onClick={() => handlePlanSwitch(plan.slug)}
                  className={`mt-5 w-full rounded-xl py-2 text-xs font-bold ${
                    isCurrent
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-violet-600 text-white hover:bg-violet-500"
                  }`}
                >
                  {canResume ? "Keep current plan / resume renewal" : isCurrent ? "Current Active Plan" : plan.slug === "free" ? "Cancel at paid-through date" : subscription.canChange ? `Schedule ${plan.name} ${cycle}` : `Checkout ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Usage Ledger */}
      <div className="surface-card rounded-3xl p-6">
        <h3 className="text-base font-extrabold">AI Consumption & Token Ledger</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[11px] uppercase text-[var(--text-muted)]">
                <th className="py-2.5 pr-4">Operation</th>
                <th className="py-2.5 pr-4">Model</th>
                <th className="py-2.5 pr-4">Billing Mode</th>
                <th className="py-2.5 pr-4">Credits Charged</th>
                <th className="py-2.5 pr-4">Est. Tokens</th>
                <th className="py-2.5">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {usageRecords.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-4 font-semibold">{u.operation}</td>
                  <td className="py-2.5 pr-4 font-mono text-cyan-400">{u.model}</td>
                  <td className="py-2.5 pr-4 uppercase">{u.billingMode}</td>
                  <td className="py-2.5 pr-4 font-bold">{u.creditsUsed}</td>
                  <td className="py-2.5 pr-4">{u.tokensEstimate}</td>
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
