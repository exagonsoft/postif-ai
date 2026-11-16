import { getServerI18n } from "@/i18n/server";
import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { AI_OPERATION_COSTS } from "@/lib/plans";
import { getCatalogPlans } from "@/lib/billing-catalog";
import { Check, Sparkles, KeyRound, Cpu } from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("pricing", locale);
}
export default async function PricingPage() {
  const { t, formatNumber } = await getServerI18n();
  const plans = await getCatalogPlans();

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400">
            <Sparkles className="h-3.5 w-3.5" />{t("public.pricing.text01")}</span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("public.pricing.text02")}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)]">{t("public.pricing.text03")}</p>

          <p className="mt-8 text-sm text-[var(--text-secondary)]">{t("public.pricing.text04")}</p>
        </div>

        {/* All 6 Plans */}
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const price = plan.monthlyPrice;
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
                          <Cpu className="h-3 w-3" />{" "}{t("public.pricing.text05")}</>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{plan.description ?? plan.tagline}</p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">{formatNumber(price, { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 })}</span>
                    <span className="text-xs text-[var(--text-muted)]">{t("public.home.text41")}</span>
                  </div>
                  {price > 0 && <p className="mt-2 text-xs text-[var(--text-secondary)]">{t("public.pricing.annual", { monthly: formatNumber(plan.annualMonthlyPrice, { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 }), yearly: formatNumber(plan.annualMonthlyPrice * 12, { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 }) })}</p>}

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
                  href={plan.purchasable ? "/app/billing" : "/pricing"}
                  className={`mt-8 block rounded-xl py-3 text-center text-xs font-bold transition-all ${
                    plan.popular
                      ? "bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg"
                      : "elevated-card hover:border-violet-500/40"
                  }`}
                >
                  {plan.purchasable ? t("public.pricing.viewPlan", { name: plan.name }) : t("public.pricing.text06")}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Managed AI Operation Credit Table */}
        <div className="surface-card mt-16 rounded-3xl p-8">
          <h3 className="text-xl font-extrabold">{t("public.pricing.text07")}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("public.pricing.text08")}{" "}
            <span className="font-semibold text-violet-400">{t("public.pricing.text09")}</span>{" "}{t("public.pricing.text10")}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(AI_OPERATION_COSTS).map(([key, item]) => (
              <div key={key} className="elevated-card rounded-2xl p-4">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  {t(`public.operation.${key}`)}
                </div>
                <div className="mt-1.5 text-lg font-extrabold text-cyan-400">
                  {t("public.pricing.credits", { count: formatNumber(item.credits) })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
