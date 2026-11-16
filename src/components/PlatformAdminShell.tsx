"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { useTheme } from "./ThemeProvider";
import { useToast } from "./ToastProvider";
import { PLATFORM_ADMIN_NAV } from "@/lib/platform-admin-navigation";
import { useAppLanguage } from "@/i18n/provider";
import { LanguageSelector } from "./LanguageSelector";

export function PlatformAdminShell({ user, children }: {
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { t } = useAppLanguage();
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error(t("common.signOutError"));
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast(t("common.signOutFailed"), error instanceof Error ? error.message : t("common.tryAgain"), "error");
    } finally {
      setSigningOut(false);
    }
  }

  return <div className="min-h-screen">
    <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <BrandLogo href="/app/admin" />
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <div className="text-right">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
          </div>
          <button type="button" onClick={toggleTheme} aria-label={t("common.theme")} className="rounded-xl p-2 hover:bg-violet-500/10">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button type="button" onClick={logout} disabled={signingOut} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-violet-500/10 disabled:opacity-50">
            <LogOut className="h-4 w-4" />{t(signingOut ? "common.signingOut" : "common.signOut")}
          </button>
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside>
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-rose-400"><ShieldCheck className="h-5 w-5" />{t("common.platformConsole")}</div>
        <nav aria-label={t("common.platformNavigation")} className="flex flex-wrap gap-2 lg:flex-col">
          {PLATFORM_ADMIN_NAV.map(item => {
            const active = item.href === "/app/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={`rounded-xl px-4 py-3 text-xs font-semibold ${active ? "bg-violet-600 text-white" : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-violet-500/10"}`}>{t(`common.admin.${item.href === "/app/admin" ? "overview" : item.href.split("/").at(-1)}`)}</Link>;
          })}
        </nav>
        <p className="mt-5 text-xs text-[var(--text-muted)]">{t("common.internalAccess")}</p>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  </div>;
}
