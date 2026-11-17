import Link from "next/link";
import { getServerI18n } from "@/i18n/server";
import { LEGAL_DOCUMENTS, type LegalDocumentKind } from "@/lib/legal-content";
import { PublicShell } from "./PublicShell";

export async function LegalDocument({ kind }: { kind: LegalDocumentKind }) {
  const { t, locale } = await getServerI18n();
  const document = LEGAL_DOCUMENTS[kind];
  const headingId = `${kind}-title`;
  const linkClass = "text-[var(--text-primary)] underline underline-offset-4 break-words focus-visible:outline-2 focus-visible:outline-offset-4";

  return (
    <PublicShell>
      <article lang={locale} aria-labelledby={headingId} className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)]">POSTIF-AI / ExagonSoft</p>
          <h1 id={headingId} className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t(`legal.${kind}.title`)}</h1>
          <p className="text-base leading-8 text-[var(--text-secondary)]">{t(`legal.${kind}.intro`)}</p>
          <p className="rounded-2xl border border-[var(--border-subtle)] p-4 text-sm leading-7 text-[var(--text-secondary)]">
            {t("legal.operatorReview")}
          </p>
        </header>

        <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label={t("legal.contents")} className="surface-card rounded-2xl p-5 lg:sticky lg:top-24">
            <h2 className="mb-4 font-bold">{t("legal.contents")}</h2>
            <ol className="grid gap-3 text-sm leading-6 sm:grid-cols-2 lg:grid-cols-1">
              {document.sections.map(section => (
                <li key={section}>
                  <a className={linkClass} href={`#${kind}-${section}`}>{t(`legal.${kind}.${section}.title`)}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 space-y-10">
            {document.sections.map(section => (
              <section key={section} id={`${kind}-${section}`} aria-labelledby={`${kind}-${section}-heading`} className="scroll-mt-24 space-y-4">
                <h2 id={`${kind}-${section}-heading`} className="text-xl font-bold sm:text-2xl">{t(`legal.${kind}.${section}.title`)}</h2>
                <p className="max-w-prose whitespace-pre-line break-words text-base leading-8 text-[var(--text-secondary)]">{t(`legal.${kind}.${section}.body`)}</p>
              </section>
            ))}

            <section aria-labelledby="legal-contact" className="surface-card space-y-4 rounded-2xl p-5 sm:p-8">
              <h2 id="legal-contact" className="text-xl font-bold">{t("legal.contact")}</h2>
              <p className="text-sm leading-7 text-[var(--text-secondary)]">{t("legal.contactHelp")}</p>
              <a className={linkClass} href="mailto:exagonsoft@exagonsoft.uk">exagonsoft@exagonsoft.uk</a>
              <nav aria-label={t("legal.related")} className="flex flex-wrap gap-x-6 gap-y-3 border-t border-[var(--border-subtle)] pt-5 text-sm">
                {Object.entries(LEGAL_DOCUMENTS).map(([key, value]) => (
                  <Link key={key} href={value.path} aria-current={key === kind ? "page" : undefined} className={linkClass}>{t(`legal.${key}.title`)}</Link>
                ))}
              </nav>
            </section>
          </div>
        </div>
      </article>
    </PublicShell>
  );
}
