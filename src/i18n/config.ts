import { createI18n, getText } from "flat-i18n";
import translations from "./translations.json";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export type TranslationValues = Record<string, string | number>;
export type Translator = (key: string, values?: TranslationValues) => string;

createI18n(translations, DEFAULT_LOCALE);

export function interpolate(text: string, values: TranslationValues = {}) {
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder);
}

export function translate(locale: Locale, key: string, values?: TranslationValues) {
  return interpolate(getText(key, locale), values);
}

export function languageTools(locale: Locale) {
  return {
    locale,
    t: (key: string, values?: TranslationValues) => translate(locale, key, values),
    formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
  };
}

export { translations };
