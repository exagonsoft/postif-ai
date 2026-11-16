import { getServerI18n } from "@/i18n/server";
import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { Sparkles, Check, ArrowRight } from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("creators", locale);
}

export default async function CreatorsSolutionPage() {
  const { t } = await getServerI18n();
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />{t("public.creators.text01")}</span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("public.creators.text02")}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">{t("public.creators.text03")}</p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: t("public.creators.text04"),
              desc: t("public.creators.text05"),
            },
            {
              title: t("public.creators.text06"),
              desc: t("public.creators.text07"),
            },
            {
              title: t("public.creators.text08"),
              desc: t("public.creators.text09"),
            },
          ].map((item) => (
            <div key={item.title} className="surface-card rounded-3xl p-6">
              <Check className="h-5 w-5 text-emerald-400" />
              <h2 className="mt-3 text-lg font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white"
          >{t("public.creators.text10")}{" "}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
