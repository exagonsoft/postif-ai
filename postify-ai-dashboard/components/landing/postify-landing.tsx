"use client";

import "./i18n";
import { I18nProvider, useI18n } from "flat-i18n/react";
import { ArrowRight, Check, Moon, Sparkles, Sun } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

type Language = "en" | "es";
type Theme = "light" | "dark";

function subscribeToPreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function languageSnapshot(): Language {
  return localStorage.getItem("postify-language") === "es" ? "es" : "en";
}

function themeSnapshot(): Theme {
  return localStorage.getItem("postify-theme") === "dark" ? "dark" : "light";
}

function setPreference(key: "postify-language" | "postify-theme", value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

function LandingContent({ language, setLanguage, theme, setTheme }: { language: Language; setLanguage: (language: Language) => void; theme: Theme; setTheme: (theme: Theme) => void }) {
  const { t } = useI18n();
  const workflow = ["one", "two", "three"] as const;
  const proof = ["first", "second", "third"] as const;
  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return <div className="landing-shell" data-theme={theme}>
    <header className="landing-nav"><Link href="/" className="landing-brand"><span>p</span>Postify</Link><nav aria-label="Landing navigation"><a href="#product">{t("nav.product")}</a><a href="#workflow">{t("nav.workflow")}</a><a href="#pricing">{t("nav.pricing")}</a></nav><div className="landing-actions"><div className="language-switch" aria-label="Language"><button aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button><button aria-pressed={language === "es"} onClick={() => setLanguage("es")}>ES</button></div><button className="theme-switch" onClick={toggleTheme} aria-label={theme === "light" ? t("theme.dark") : t("theme.light")}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button><Link className="nav-login" href="/login">{t("nav.signIn")}</Link><Link className="nav-cta" href="/register">{t("nav.start")} <ArrowRight size={16} /></Link></div></header>
    <main>
      <section className="landing-hero" id="product"><div className="hero-copy"><p className="eyebrow"><Sparkles size={15} />{t("hero.eyebrow")}</p><h1>{t("hero.title")}</h1><p className="hero-description">{t("hero.description")}</p><div className="hero-actions"><Link className="primary-cta" href="/register">{t("hero.primary")} <ArrowRight size={18} /></Link><a className="secondary-cta" href="#workflow">{t("hero.secondary")}</a></div><p className="hero-note"><Check size={15} />{t("hero.note")}</p></div><div className="hero-board" aria-label="Postify publishing dashboard preview"><div className="board-top"><span>Today&apos;s plan</span><span>Aug 29</span></div><div className="board-focus"><p>Next post</p><h2>New collection, in the wild.</h2><div className="board-platforms"><i>in</i><i>f</i><i>p</i><span>3 destinations</span></div></div><div className="board-metric"><span>Engagement</span><strong>5.8%</strong><em>+0.8%</em></div><div className="board-calendar"><span className="calendar-mark">30</span><p>Friday</p><b>2 posts scheduled</b></div></div></section>
      <section className="proof-strip"><p>{t("proof.label")}</p><div>{proof.map((item) => <span key={item}><Check size={15} />{t(`proof.${item}`)}</span>)}</div></section>
      <section className="workflow-section" id="workflow"><div className="section-intro"><p className="eyebrow">{t("workflow.eyebrow")}</p><h2>{t("workflow.title")}</h2></div><div className="workflow-list">{workflow.map((item, index) => <article key={item}><span>0{index + 1}</span><h3>{t(`workflow.${item}.title`)}</h3><p>{t(`workflow.${item}.description`)}</p></article>)}</div></section>
      <section className="platform-section"><div><p className="eyebrow">{t("platforms.eyebrow")}</p><h2>{t("platforms.title")}</h2></div><p>{t("platforms.description")}</p><div className="network-row"><span>Instagram</span><span>LinkedIn</span><span>Facebook</span><span>Pinterest</span><span>YouTube</span><span>X</span></div></section>
      <section className="pricing-section" id="pricing"><p className="eyebrow">{t("pricing.eyebrow")}</p><h2>{t("pricing.title")}</h2><p>{t("pricing.description")}</p><Link className="primary-cta" href="/register">{t("pricing.cta")} <ArrowRight size={18} /></Link></section>
    </main>
    <footer className="landing-footer"><Link href="/" className="landing-brand"><span>p</span>Postify</Link><p>{t("footer.statement")}</p><div><Link href="/dashboard">{t("footer.dashboard")}</Link><Link href="/login">{t("footer.login")}</Link></div></footer>
  </div>;
}

export function PostifyLanding() {
  const language = useSyncExternalStore<Language>(subscribeToPreferences, languageSnapshot, () => "en");
  const theme = useSyncExternalStore<Theme>(subscribeToPreferences, themeSnapshot, () => "light");
  return <I18nProvider currentLang={language}><LandingContent language={language} setLanguage={(value) => setPreference("postify-language", value)} theme={theme} setTheme={(value) => setPreference("postify-theme", value)} /></I18nProvider>;
}