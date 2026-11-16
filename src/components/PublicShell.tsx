"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { useTheme } from "./ThemeProvider";
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
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main Navigation">
            <Link
              href="/features"
              className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Features
            </Link>

            <div
              className="relative"
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
            >
              <button
                type="button"
                onClick={() => setSolutionsOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Solutions
                <motion.span
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
                      <div className="text-sm font-semibold">For Creators</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Turn ideas into daily multi-channel posts
                      </div>
                    </Link>
                    <Link
                      href="/solutions/small-businesses"
                      className="block rounded-xl px-3.5 py-2.5 transition-colors hover:bg-violet-500/10"
                    >
                      <div className="text-sm font-semibold">For Small Businesses</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Consistent growth without hiring an agency
                      </div>
                    </Link>
                    <Link
                      href="/solutions/agencies"
                      className="block rounded-xl px-3.5 py-2.5 transition-colors hover:bg-violet-500/10"
                    >
                      <div className="text-sm font-semibold">For Agencies</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Multi-brand workspaces & client approvals
                      </div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link
              href="/pricing"
              className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Pricing
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Resources & About
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden items-center gap-3 lg:flex">
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              aria-label="Toggle color theme"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>
            <Link
              href="/login"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Login
            </Link>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition-all hover:opacity-95"
              >
                <Sparkles className="h-4 w-4" />
                Get Started
              </Link>
            </motion.div>
          </div>

          {/* Mobile Controls */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)]"
              aria-label="Toggle color theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-primary)]"
              aria-label="Toggle navigation menu"
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
              >
                Features
              </Link>
              <Link
                href="/solutions/creators"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >
                Solutions: Creators
              </Link>
              <Link
                href="/solutions/small-businesses"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >
                Solutions: Small Businesses
              </Link>
              <Link
                href="/solutions/agencies"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >
                Solutions: Agencies
              </Link>
              <Link
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >
                Pricing
              </Link>
              <Link
                href="/about"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-violet-500/10"
              >
                About & Resources
              </Link>
              <div className="flex gap-2 pt-2">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 rounded-xl border border-[var(--border-subtle)] py-2.5 text-center text-sm font-semibold"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Create Free Account
                </Link>
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
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
                Create Once. Publish Everywhere. Grow Automatically. The intelligent social media
                command center and autonomous marketing agent built by{" "}
                <span className="font-semibold text-[var(--text-primary)]">ExagonSoft</span>.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                AES-256-GCM BYOK Vault & Tenant-Isolated Workspaces
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Platform
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
                <li>
                  <Link href="/features" className="hover:text-[var(--text-primary)]">
                    AI Content Studio
                  </Link>
                </li>
                <li>
                  <Link href="/features#agent" className="hover:text-[var(--text-primary)]">
                    Autonomous Marketing Agent
                  </Link>
                </li>
                <li>
                  <Link href="/features#calendar" className="hover:text-[var(--text-primary)]">
                    Scheduling & Job Queue
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-[var(--text-primary)]">
                    BYOK vs Managed AI
                  </Link>
                </li>
                <li>
                  <Link href="/app" className="inline-flex items-center gap-1 font-medium text-cyan-400 hover:underline">
                    Interactive Command Center <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Solutions
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
                <li>
                  <Link href="/solutions/creators" className="hover:text-[var(--text-primary)]">
                    Creators & Educators
                  </Link>
                </li>
                <li>
                  <Link href="/solutions/small-businesses" className="hover:text-[var(--text-primary)]">
                    Small Businesses
                  </Link>
                </li>
                <li>
                  <Link href="/solutions/agencies" className="hover:text-[var(--text-primary)]">
                    Agencies & Multi-Brand
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="hover:text-[var(--text-primary)]">
                    Sign Up for Brand Setup
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Company & Legal
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-secondary)]">
                <li>
                  <Link href="/about" className="hover:text-[var(--text-primary)]">
                    About POSTIF-AI & ExagonSoft
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-[var(--text-primary)]">
                    Contact & Enterprise Sales
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-[var(--text-primary)]">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-[var(--text-primary)]">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-8 text-xs text-[var(--text-muted)] sm:flex-row">
            <p>© {new Date().getFullYear()} ExagonSoft. All rights reserved. POSTIF-AI is a product of ExagonSoft.</p>
            <p>
              Built on Next.js App Router, MongoDB & OpenAI Architecture. Connect your own social platform credentials.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
