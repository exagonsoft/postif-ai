"use client";

import { useAppLanguage } from "@/i18n/provider";

import React, { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { useTheme } from "./ThemeProvider";
import { LanguageSelector } from "@/components/LanguageSelector";
import {
  Sun,
  Moon,
  Menu,
  X,
  ChevronDown,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { t } = useAppLanguage();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Navigation */}
      <header className="glass-panel sticky top-0 z-40 border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLogo href="/" showByline />

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-7 lg:flex" aria-label={t("public.publicShell.text01")}>
            <Link
              href="/features"
              className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >{t("public.publicShell.text02")}</Link>

            <div
              className="relative"
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
            >
              <button
                type="button"
                onClick={() => setSolutionsOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >{t("public.publicShell.text03")}<motion.span
                  animate={{ rotate: solutionsOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
              </button>
              <AnimatePresence>
                {solutionsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    className="surface-card absolute left-0 top-full mt-2 w-64 rounded-2xl p-2 shadow-2xl"
                  >
                    <Link
                      href="/solutions/creators"
                      className="block rounded-xl px-3.5 py-2.5 transition-colors hover:bg-violet-500/10"
                    >
                      <div className="text-sm font-semibold">{t("public.publicShell.text04")}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{t("public.publicShell.text05")}</div>
                    </Link>
                    <Link
                      href="/solutions/small-businesses"
                      className="block rounded-xl px-3.5 py-2.5 transition-colors hover:bg-violet-500/10"
                    >
                      <div className="text-sm font-semibold">{t("public.publicShell.text06")}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{t("public.publicShell.text07")}</div>
                    </Link>
                    <Link
                      href="/solutions/agencies"
                      className="block rounded-xl px-3.5 py-2.5 transition-colors hover:bg-violet-500/10"
                    >
                      <div className="text-sm font-semibold">{t("public.publicShell.text08")}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{t("public.publicShell.text09")}</div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link
              href="/pricing"
              className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >{t("public.publicShell.text10")}</Link>
            <Link
              href="/about"
              className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >{t("public.publicShell.text11")}</Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden items-center gap-3 lg:flex">
            <LanguageSelector />
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              aria-label={t("public.publicShell.text12")}
              title={theme === "dark" ? t("public.publicShell.text13") : t("public.publicShell.text14")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>
            <Link
              href="/login"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >{t("public.publicShell.text15")}</Link>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition-all hover:opacity-95"
              >
                <Sparkles className="h-4 w-4" />{t("public.publicShell.text16")}</Link>
            </motion.div>
          </div>

          {/* Mobile Controls */}
          <div className="flex items-center gap-2 lg:hidden">
            <LanguageSelector />
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)]"
              aria-label={t("public.publicShell.text12")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-primary)]"
              aria-label={t("public.publicShell.text17")}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="surface-card space-y-2 overflow-hidden border-t border-[var(--border-subtle)] px-4 py-4 lg:hidden"
            >
              <Link
                href="/features"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >{t("public.publicShell.text02")}</Link>
              <Link
                href="/solutions/creators"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >{t("public.publicShell.text18")}</Link>
              <Link
                href="/solutions/small-businesses"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >{t("public.publicShell.text19")}</Link>
              <Link
                href="/solutions/agencies"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >{t("public.publicShell.text20")}</Link>
              <Link
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >{t("public.publicShell.text10")}</Link>
              <Link
                href="/about"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >{t("public.publicShell.text21")}</Link>
              <div className="flex gap-2 pt-2">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 rounded-xl border border-[var(--border-subtle)] py-2.5 text-center text-sm font-semibold"
                >{t("public.publicShell.text15")}</Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 py-2.5 text-center text-sm font-semibold text-white"
                >{t("public.publicShell.text22")}</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <BrandLogo href="/" showByline />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">{t("public.publicShell.text23")}{" "}
                <span className="font-semibold text-[var(--text-primary)]">ExagonSoft</span>.</p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />{t("public.publicShell.text25")}</div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{t("public.publicShell.text26")}</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
                <li>
                  <Link href="/features" className="hover:text-[var(--text-primary)]">{t("public.home.text12")}</Link>
                </li>
                <li>
                  <Link href="/features#agent" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text27")}</Link>
                </li>
                <li>
                  <Link href="/features#calendar" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text28")}</Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text29")}</Link>
                </li>
                <li>
                  <Link href="/app" className="inline-flex items-center gap-1 font-medium text-cyan-400 hover:underline">{t("public.publicShell.text30")}{" "}<ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{t("public.publicShell.text03")}</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
                <li>
                  <Link href="/solutions/creators" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text31")}</Link>
                </li>
                <li>
                  <Link href="/solutions/small-businesses" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text32")}</Link>
                </li>
                <li>
                  <Link href="/solutions/agencies" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text33")}</Link>
                </li>
                <li>
                  <Link href="/register" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text34")}</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{t("public.publicShell.text35")}</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
                <li>
                  <Link href="/about" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text36")}</Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-[var(--text-primary)]">{t("public.publicShell.text37")}</Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-[var(--text-primary)]">{t("legal.privacy.title")}</Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-[var(--text-primary)]">{t("legal.terms.title")}</Link>
                </li>
                <li>
                  <Link href="/data-deletion" className="hover:text-[var(--text-primary)]">{t("legal.dataDeletion.title")}</Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-8 text-xs text-[var(--text-muted)] sm:flex-row">
            <p>{t("public.footer.copyright", { year: new Date().getFullYear() })}</p>
            <p>{t("public.publicShell.text38")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
