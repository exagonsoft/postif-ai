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
  PlusCircle,
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
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [mode, setMode] = useState<"managed" | "byok">(
    aiBillingMode === "byok" ? "byok" : "managed"
  );
  const [model, setModel] = useState(preferredModel || "gpt-4o-mini");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "annual">(
    billingCycle === "annual" ? "annual" : "monthly"
  );
  const [saving, setSaving] = useState(false);

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
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeKey = async () => {
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke_byok" }),
    });
    if (res.ok) {
      setMode("managed");
      toast("BYOK Key Revoked", "Encrypted key wiped from vault; reverted to Managed AI.");
      router.refresh();
    }
  };

  const handlePlanSwitch = async (planSlug: string) => {
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "change_plan",
        planSlug,
        billingCycle: cycle,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast("Plan switch blocked", data.error || "Requires Owner/Admin role.", "error");
      return;
    }
    toast("Subscription Updated", `Active plan set to ${planSlug.replace("_", " ").toUpperCase()}.`);
    router.refresh();
  };

  const handleTopUp = async () => {
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "topup_credits", amount: 500 }),
    });
    if (res.ok) {
      toast("Credits Added", "+500 Managed AI credits credited to your workspace.");
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
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

              {mode === "managed" && (
                <button
                  type="button"
                  onClick={handleTopUp}
                  className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold hover:border-cyan-400/50"
                >
                  <PlusCircle className="h-3.5 w-3.5 text-cyan-400" /> Top Up +500 Demo Credits
                </button>
              )}
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
                Dimension 2: Platform Subscription Plan (Stripe-Ready Architecture)
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
              Annual (-20%)
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.values(SUBSCRIPTION_PLANS).map((plan) => {
            const isCurrent = plan.slug === currentPlanSlug;
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
                  <span className="text-lg font-extrabold text-cyan-400">${price}/mo</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{plan.tagline}</p>
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
                  disabled={isCurrent}
                  onClick={() => handlePlanSwitch(plan.slug)}
                  className={`mt-5 w-full rounded-xl py-2 text-xs font-bold ${
                    isCurrent
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-violet-600 text-white hover:bg-violet-500"
                  }`}
                >
                  {isCurrent ? "Current Active Plan" : `Switch to ${plan.name}`}
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
