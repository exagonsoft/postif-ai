"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { SUBSCRIPTION_PLANS, AI_OPERATION_COSTS } from "@/lib/plans";
import { Check, Sparkles, KeyRound, Cpu } from "lucide-react";

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400">
            <Sparkles className="h-3.5 w-3.5" />
            Platform Subscription + Independent AI Billing Mode
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Predictable SaaS Pricing. Choose BYOK or Managed AI.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)]">
            Bring your own OpenAI API key to pay wholesale token rates directly, or choose Managed
            AI plans with turnkey monthly credits included.
          </p>

          {/* Monthly / Annual Switch */}
          <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                !annual ? "bg-violet-600 text-white" : "text-[var(--text-secondary)]"
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                annual ? "bg-violet-600 text-white" : "text-[var(--text-secondary)]"
              }`}
            >
              Annual Billing (Save ~20%)
            </button>
          </div>
        </div>

        {/* All 6 Plans */}
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Object.values(SUBSCRIPTION_PLANS).map((plan) => {
            const price = annual ? plan.annualMonthlyPrice : plan.monthlyPrice;
            return (
              <div
                key={plan.slug}
                className={`surface-card flex flex-col justify-between rounded-3xl p-7 ${
                  plan.popular ? "ring-2 ring-violet-500" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl font-extrabold">{plan.name}</h2>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        plan.defaultAiMode === "byok"
                          ? "bg-violet-500/15 text-violet-300"
                          : "bg-cyan-500/15 text-cyan-300"
                      }`}
                    >
                      {plan.defaultAiMode === "byok" ? (
                        <>
                          <KeyRound className="h-3 w-3" /> BYOK
                        </>
                      ) : (
                        <>
                          <Cpu className="h-3 w-3" /> Managed AI
                        </>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{plan.tagline}</p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">${price}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      /month {annual && price > 0 ? "(billed annually)" : ""}
                    </span>
                  </div>

                  <ul className="mt-6 space-y-3 text-sm text-[var(--text-secondary)]">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/app/billing"
                  className={`mt-8 block rounded-xl py-3 text-center text-xs font-bold transition-all ${
                    plan.popular
                      ? "bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg"
                      : "elevated-card hover:border-violet-500/40"
                  }`}
                >
                  Select {plan.name}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Managed AI Operation Credit Table */}
        <div className="surface-card mt-16 rounded-3xl p-8">
          <h3 className="text-xl font-extrabold">
            Managed AI Credit Consumption Schedule
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            When using Managed AI mode, credits are deducted per operation. BYOK workspaces consume{" "}
            <span className="font-semibold text-violet-400">0 POSTIF-AI credits</span> and bill
            directly to your OpenAI account.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(AI_OPERATION_COSTS).map(([key, item]) => (
              <div key={key} className="elevated-card rounded-2xl p-4">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  {item.label}
                </div>
                <div className="mt-1.5 text-lg font-extrabold text-cyan-400">
                  {item.credits} credits
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
