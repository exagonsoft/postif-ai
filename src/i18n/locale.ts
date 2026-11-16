export const LOCALES = ["en", "es", "de", "pt-BR"] as const;
export type Locale = typeof LOCALES[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "postif_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some(locale => locale === value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeCookie(locale: Locale, secure = false) {
  if (!isLocale(locale)) throw new Error("Unsupported application language.");
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
