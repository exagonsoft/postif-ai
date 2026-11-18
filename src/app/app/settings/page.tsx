import { getServerI18n } from "@/i18n/server";
import React from "react";
import { NotificationSettings } from "@/components/NotificationSettings";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getBillingReadiness } from "@/lib/paypal";
import { ShieldCheck, KeyRound, Server, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getServerI18n();
  const displayStatus = (value: string) => ["owner","admin","editor","approver","viewer","member","user","operator"].includes(value) ? t(`customer.status.${value}`) : value;

  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace || !ctx.user) {
    redirect("/login");
  }

  const billingReady = getBillingReadiness().ready;
  const envChecks = [
    {
      name: t("customer.environment.mongo"),
      status: Boolean(process.env.MONGODB_URI) ? t("customer.text.84") : t("customer.text.85"),
      active: Boolean(process.env.MONGODB_URI),
    },
    {
      name: t("customer.environment.openai"),
      status: process.env.OPENAI_API_KEY ? t("customer.text.86") : t("customer.text.87"),
      active: Boolean(process.env.OPENAI_API_KEY),
    },
    {
      name: t("customer.environment.checkout"),
      status: t(billingReady ? "customer.text.86" : "customer.environment.unavailable"),
      active: billingReady,
    },
    {
      name: t("customer.environment.social"),
      status: t("customer.environment.customer"),
      active: true,
    },
  ];

  return (
    <div className="space-y-8">
      <NotificationSettings />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("customer.text.88")}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          {t("customer.text.89")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card space-y-4 rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-extrabold">{t("customer.text.90")}</h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">{t("customer.text.91")}</span>
              <span className="font-bold">{ctx.user.name}</span>
            </div>
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">{t("customer.text.92")}</span>
              <span className="font-bold">{ctx.user.email}</span>
            </div>
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">{t("customer.text.93")}</span>
              <span className="font-bold uppercase text-cyan-400">{displayStatus(ctx.memberRole)}</span>
            </div>
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">{t("customer.text.94")}</span>
              <span className="font-bold uppercase text-violet-400">
                {displayStatus(ctx.user.systemRole)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/app/billing"
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white"
            >
              <KeyRound className="h-3.5 w-3.5" /> {t("customer.text.95")}
            </Link>
            <Link
              href="/app/workspaces"
              className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
            >
              {t("customer.text.96")}{" "} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Operational vs Simulated Runtime Status */}
        <div className="surface-card space-y-4 rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-extrabold">
              {t("customer.text.97")}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {t("customer.text.98")}
          </p>

          <div className="space-y-2.5">
            {envChecks.map((item) => (
              <div
                key={item.name}
                className="elevated-card flex items-center justify-between rounded-xl p-3 text-xs"
              >
                <span className="font-semibold">{item.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    item.active
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
