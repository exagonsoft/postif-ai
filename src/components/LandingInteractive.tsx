"use client";

import { useAppLanguage } from "@/i18n/provider";

import Link from "next/link";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";

export function LandingInteractive() {
  const { t } = useAppLanguage();
  return <section className="mx-auto max-w-7xl space-y-6 px-4 py-16">
    <h2 className="text-center text-3xl font-extrabold">{t("public.landingInteractive.text01")}</h2>
    <p className="mx-auto max-w-3xl text-center text-[var(--text-secondary)]">{t("public.landingInteractive.text02")}</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Object.values(SOCIAL_PLATFORM_SPECS).map(platform => <div key={platform.id} className="surface-card rounded-2xl p-5"><h3 className="font-bold">{platform.id === "facebook" || platform.id === "instagram" ? t(`public.platform.${platform.id}.name`) : platform.name}</h3><p className="mt-2 text-xs text-[var(--text-secondary)]">{t(`public.platform.${platform.id}.notes`)}</p></div>)}</div>
    <div className="surface-card space-y-3 rounded-2xl p-6 text-sm">
      <h3 className="font-bold">{t("public.landingInteractive.text03")}</h3>
      <p>{t("public.landingInteractive.text04")}</p>
      <p>{t("public.landingInteractive.text05")}</p>
    </div>
  </section>;
}

export function HeroDashboardPreview() {
  const { t, formatNumber } = useAppLanguage();
  return <div className="surface-card mx-auto mt-12 max-w-4xl rounded-3xl p-8 text-left">
    <h2 className="text-xl font-bold">{t("public.landingInteractive.text06")}</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">{[t("public.landingInteractive.text07"), t("public.landingInteractive.text08"), t("public.landingInteractive.text09")].map((step, index) => <div key={step} className="elevated-card rounded-2xl p-5"><span className="text-xs text-cyan-400">{t("public.preview.step", { count: formatNumber(index + 1) })}</span><p className="mt-2 text-sm font-semibold">{step}</p></div>)}</div>
    <p className="mt-5 text-sm text-[var(--text-secondary)]">{t("public.landingInteractive.text10")}</p>
    <Link href="/register" className="mt-5 inline-block rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white">{t("public.landingInteractive.text11")}</Link>
  </div>;
}
