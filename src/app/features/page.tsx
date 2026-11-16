import { getServerI18n } from "@/i18n/server";
import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { publicPageMetadata } from "@/lib/seo";
import {
  Wand2,
  Bot,
  CalendarClock,
  Repeat,
  Image as ImageIcon,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("features", locale);
}

export default async function FeaturesPage() {
  const { t } = await getServerI18n();
  const modules = [
    {
      id: "studio",
      badge: t("public.home.text12"),
      icon: Wand2,
      title: t("public.features.text01"),
      desc: t("public.features.text02"),
      bullets: [
        t("public.features.text03"),
        t("public.features.text04"),
        t("public.features.text05"),
      ],
    },
    {
      id: "agent",
      badge: t("public.features.text06"),
      icon: Bot,
      title: t("public.features.text07"),
      desc: t("public.features.text08"),
      bullets: [
        t("public.features.text09"),
        t("public.features.text10"),
        t("public.features.text11"),
      ],
    },
    {
      id: "calendar",
      badge: t("public.features.text12"),
      icon: CalendarClock,
      title: t("public.features.text13"),
      desc: t("public.features.text14"),
      bullets: [
        t("public.features.text15"),
        t("public.features.text16"),
        t("public.features.text17"),
      ],
    },
    {
      id: "repurpose",
      badge: t("public.features.text18"),
      icon: Repeat,
      title: t("public.features.text19"),
      desc: t("public.features.text20"),
      bullets: [
        t("public.features.text21"),
        t("public.features.text22"),
        t("public.features.text23"),
      ],
    },
    {
      id: "media",
      badge: t("public.features.text24"),
      icon: ImageIcon,
      title: t("public.features.text25"),
      desc: t("public.features.text26"),
      bullets: [
        t("public.features.text27"),
        t("public.features.text28"),
        t("public.features.text29"),
      ],
    },
    {
      id: "analytics",
      badge: t("public.features.text30"),
      icon: BarChart3,
      title: t("public.features.text31"),
      desc: t("public.features.text32"),
      bullets: [
        t("public.features.text33"),
        t("public.features.text34"),
        t("public.features.text35"),
      ],
    },
  ];

  return (
    <PublicShell>
      <section className="border-b border-[var(--border-subtle)] py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />{t("public.features.text36")}</span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("public.features.text37")}</h1>
          <p className="mt-4 text-base text-[var(--text-secondary)] sm:text-lg">{t("public.features.text38")}</p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg"
            >{t("public.features.text39")}{" "}<ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-12 px-4 py-20 sm:px-6 lg:px-8">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.id}
              id={mod.id}
              className="surface-card grid gap-8 rounded-3xl p-8 lg:grid-cols-12 lg:items-center"
            >
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-xl bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-300">
                  <Icon className="h-4 w-4 text-cyan-400" />
                  {mod.badge}
                </div>
                <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">{mod.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                  {mod.desc}
                </p>
              </div>
              <div className="elevated-card space-y-3 rounded-2xl p-6 lg:col-span-5">
                {mod.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </PublicShell>
  );
}
