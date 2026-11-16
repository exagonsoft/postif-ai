"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { I18nProvider as FlatI18nProvider, useI18n } from "flat-i18n/react";
import { interpolate, languageTools, type TranslationValues } from "./config";
import { isLocale, localeCookie, type Locale } from "./locale";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  isPending: boolean;
}
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function AppLanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) throw new Error("Unsupported application language.");
    document.cookie = localeCookie(next, window.location.protocol === "https:");
    updateLocale(next);
    startTransition(() => router.refresh());
  }, [router]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, isPending }), [locale, setLocale, isPending]);

  return <LanguageContext.Provider value={value}>
    <FlatI18nProvider currentLang={locale}>{children}</FlatI18nProvider>
  </LanguageContext.Provider>;
}

export function useAppLanguage() {
  const language = useContext(LanguageContext);
  const { t: getText } = useI18n();
  const t = useCallback((key: string, values?: TranslationValues) => interpolate(getText(key), values), [getText]);
  if (!language) throw new Error("useAppLanguage requires AppLanguageProvider.");
  const tools = useMemo(() => languageTools(language.locale), [language.locale]);
  return {
    ...tools,
    ...language,
    t,
  };
}
