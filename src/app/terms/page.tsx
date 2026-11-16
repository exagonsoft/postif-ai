import { getServerI18n } from "@/i18n/server";
import React from "react";
import { PublicShell } from "@/components/PublicShell";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("terms", locale);
}

export default async function TermsPage() {
  const { t } = await getServerI18n();
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{t("public.terms.text01")}</h1>
        <p className="text-xs text-[var(--text-muted)]">{t("public.terms.text02")}</p>

        <div className="surface-card space-y-4 rounded-3xl p-8 text-sm leading-relaxed text-[var(--text-secondary)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{t("public.terms.text03")}</h2>
          <p>{t("public.terms.text04")}</p>

          <h2 className="text-lg font-bold text-[var(--text-primary)]">{t("public.terms.text05")}</h2>
          <p>{t("public.terms.text06")}</p>

          <h2 className="text-lg font-bold text-[var(--text-primary)]">{t("public.terms.text07")}</h2>
          <p>{t("public.terms.text08")}</p>
        </div>
      </article>
    </PublicShell>
  );
}
