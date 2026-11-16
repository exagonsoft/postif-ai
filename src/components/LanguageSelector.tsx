"use client";

import { useId } from "react";
import { useAppLanguage } from "@/i18n/provider";
import { isLocale } from "@/i18n/locale";

export function LanguageSelector() {
  const id = useId();
  const { locale, setLocale, isPending, t } = useAppLanguage();
  return <div className="shrink-0">
    <label htmlFor={id} className="sr-only">{t("common.language")}</label>
    <select id={id} value={locale} disabled={isPending} aria-busy={isPending}
      onChange={event => {
        if (isLocale(event.target.value)) setLocale(event.target.value);
      }}
      className="max-w-36 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50">
      <option value="en" lang="en">English</option>
      <option value="es" lang="es">Español</option>
      <option value="de" lang="de">Deutsch</option>
      <option value="pt-BR" lang="pt-BR">Português (BR)</option>
    </select>
  </div>;
}
