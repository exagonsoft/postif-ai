import { getServerI18n } from "@/i18n/server";
import React from "react";
import { PublicShell } from "@/components/PublicShell";
import { ShieldCheck, Cpu, Server, Sparkles } from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("about", locale);
}

export default async function AboutPage() {
  const { t } = await getServerI18n();
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />{t("public.about.text01")}</span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("public.about.text02")}</h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          <strong>POSTIF-AI</strong>{" "}{t("public.about.text03")}{" "}<strong>ExagonSoft</strong>{" "}{t("public.about.text04")}</p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="surface-card rounded-3xl p-6">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <h2 className="mt-3 text-base font-bold">{t("public.about.text05")}</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{t("public.about.text06")}</p>
          </div>
          <div className="surface-card rounded-3xl p-6">
            <Cpu className="h-6 w-6 text-violet-400" />
            <h2 className="mt-3 text-base font-bold">{t("public.about.text07")}</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{t("public.about.text08")}</p>
          </div>
          <div className="surface-card rounded-3xl p-6">
            <Server className="h-6 w-6 text-cyan-400" />
            <h2 className="mt-3 text-base font-bold">{t("public.about.text09")}</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{t("public.about.text10")}</p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
