"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { useTheme } from "./ThemeProvider";
import { useToast } from "./ToastProvider";
import { PulseStatusDot, SPRING_SNAPPY } from "./MotionPrimitives";
import { useAppLanguage } from "@/i18n/provider";
import { LanguageSelector } from "./LanguageSelector";
import { SidebarModeToggle, useSidebarMode } from "./SidebarModeToggle";
import {
  LayoutDashboard,
  Wand2,
  Repeat,
  CalendarClock,
  FileText,
  Megaphone,
  Share2,
  Bot,
  Image as ImageIcon,
  BarChart3,
  Building2,
  CreditCard,
  Settings,
  ShieldAlert,
  Bell,
  Sun,
  Moon,
  Menu,
  X,
  ChevronsUpDown,
  LogOut,
  PlusCircle,
  Cpu,
  KeyRound,
  CheckCheck,
} from "lucide-react";

interface NotificationDTO {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  actionHref: string;
  createdAt: string;
}

interface WorkspaceDTO {
  id: number;
  name: string;
  planSlug: string;
  aiBillingMode: string;
  aiCreditsBalance: number;
}

interface AppShellProps {
  children: React.ReactNode;
  user: {
    id: number;
    name: string;
    email: string;
    systemRole: string;
  };
  workspace: WorkspaceDTO;
  workspaces: WorkspaceDTO[];
  activeBrandName: string;
  memberRole: string;
  notifications: NotificationDTO[];
  pendingApprovalsCount: number;
}

const NAV_ITEMS = [
  { href: "/app", label: "overview", icon: LayoutDashboard },
  { href: "/app/studio", label: "studio", icon: Wand2 },
  { href: "/app/repurpose", label: "repurpose", icon: Repeat },
  { href: "/app/calendar", label: "calendar", icon: CalendarClock },
  { href: "/app/posts", label: "posts", icon: FileText, badgeKey: "approvals" as const },
  { href: "/app/campaigns", label: "campaigns", icon: Megaphone },
  { href: "/app/social", label: "social", icon: Share2 },
  { href: "/app/agent", label: "agent", icon: Bot },
  { href: "/app/media", label: "media", icon: ImageIcon },
  { href: "/app/analytics", label: "analytics", icon: BarChart3 },
  { href: "/app/workspaces", label: "workspaces", icon: Building2 },
  { href: "/app/billing", label: "billing", icon: CreditCard },
  { href: "/app/settings", label: "settings", icon: Settings },
];

export function AppShell({
  children,
  user,
  workspace,
  workspaces,
  activeBrandName,
  memberRole,
  notifications,
  pendingApprovalsCount,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { t, formatNumber } = useAppLanguage();
  const { collapsed: sidebarCollapsed, toggleSidebar } = useSidebarMode();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [router]);

  const switchWorkspace = async (workspaceId: number) => {
    setWsOpen(false);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "switch_workspace", workspaceId }),
    });
    if (res.ok) {
      toast(t("common.workspaceSwitched"), t("common.workspaceLoaded"));
      router.refresh();
    }
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    router.refresh();
  };

  const handleLogout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
    router.refresh();
  };

  const renderSidebarLinks = (onNavigate?: () => void, isMobile = false) => {
    const compact = sidebarCollapsed && !isMobile;
    return (
    <nav id={isMobile ? undefined : "customer-sidebar-navigation"} className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t("common.sidebar")}>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={compact ? t(`common.nav.${item.label}`) : undefined}
            className={`relative flex items-center rounded-xl py-2.5 text-xs font-semibold transition-colors ${compact ? "justify-center px-2" : "justify-between px-3"} ${
              active
                ? "text-white"
                : "text-[var(--text-secondary)] hover:bg-violet-500/10 hover:text-[var(--text-primary)]"
            }`}
          >
            {active && !isMobile && (
              <motion.span
                layoutId="activeSidebarPill"
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600/90 to-indigo-600/90 shadow-lg shadow-violet-600/20"
              />
            )}
            {active && isMobile && (
              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600/90 to-indigo-600/90 shadow-lg shadow-violet-600/20" />
            )}
            <span className="relative z-10 flex items-center gap-2.5">
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-cyan-300" : ""}`} aria-hidden="true" />
              <span className={compact ? "sr-only" : undefined}>{t(`common.nav.${item.label}`)}</span>
            </span>
            {item.badgeKey === "approvals" && pendingApprovalsCount > 0 && (
              <span className={`z-10 rounded-full bg-amber-500/20 py-0.5 font-bold text-amber-300 ${compact ? "absolute right-0.5 top-0.5 px-1 text-[8px]" : "relative px-2 text-[10px]"}`}>
                {pendingApprovalsCount}
              </span>
            )}
          </Link>
        );
      })}

      {user.systemRole === "operator" && (
        <div className="pt-3">
          <div className={compact ? "sr-only" : "px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]"}>
            {t("common.operator")}
          </div>
          <Link
            href="/app/admin"
            onClick={onNavigate}
            title={compact ? t("common.adminConsole") : undefined}
            aria-current={pathname.startsWith("/app/admin") ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-xl py-2.5 text-xs font-semibold transition-all ${compact ? "justify-center px-2" : "px-3"} ${
              pathname.startsWith("/app/admin")
                ? "bg-rose-600 text-white"
                : "text-rose-400 hover:bg-rose-500/10"
            }`}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={compact ? "sr-only" : undefined}>{t("common.adminConsole")}</span>
          </Link>
        </div>
      )}
    </nav>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className={`relative hidden shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] lg:flex ${sidebarCollapsed ? "w-20" : "w-64"}`}>
        <div className={`flex h-16 items-center border-b border-[var(--border-subtle)] ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          <BrandLogo href="/app" compact={sidebarCollapsed} showByline />
        </div>
        <div className="absolute -right-4 top-4 z-40">
          <SidebarModeToggle collapsed={sidebarCollapsed} onToggle={toggleSidebar} controls="customer-sidebar-navigation" />
        </div>

        {/* Workspace Switcher */}
        <div className="relative border-b border-[var(--border-subtle)] p-3">
          <button
            type="button"
            onClick={() => setWsOpen((v) => !v)}
            aria-expanded={wsOpen}
            aria-controls="workspace-switcher-options"
            aria-label={sidebarCollapsed ? `${t("common.switchWorkspace")}: ${workspace.name}` : undefined}
            title={sidebarCollapsed ? `${t("common.switchWorkspace")}: ${workspace.name}` : undefined}
            className={`elevated-card flex w-full items-center rounded-xl py-2.5 text-left transition-colors hover:border-violet-500/40 ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-3"}`}
          >
            {sidebarCollapsed ? <Building2 className="h-5 w-5" aria-hidden="true" /> : <>
            <div className="min-w-0">
              <div className="truncate text-xs font-extrabold">{workspace.name}</div>
              <div className="truncate text-[11px] text-[var(--text-muted)]">
                {t("common.brand", { name: activeBrandName })} • {["owner", "admin", "editor", "viewer"].includes(memberRole) ? t(`common.role.${memberRole}`) : memberRole}
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            </>}
          </button>

          <AnimatePresence>
            {wsOpen && (
              <motion.div
                id="workspace-switcher-options"
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className={`surface-card absolute left-3 top-full z-30 mt-1 rounded-2xl p-2 shadow-2xl ${sidebarCollapsed ? "w-64" : "right-3"}`}
              >
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {t("common.switchWorkspace")}
                </div>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => switchWorkspace(ws.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold ${
                      ws.id === workspace.id
                        ? "bg-violet-600/20 text-violet-300"
                        : "hover:bg-violet-500/10"
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
                    <span className="text-[10px] uppercase text-[var(--text-muted)]">
                      {ws.planSlug.replace("_", " ")}
                    </span>
                  </button>
                ))}
                <Link
                  href="/onboarding?mode=create"
                  onClick={() => setWsOpen(false)}
                  className="mt-1 flex items-center gap-1.5 rounded-xl border-t border-[var(--border-subtle)] px-2.5 py-2 text-xs font-bold text-cyan-400 hover:bg-cyan-500/10"
                >
                  <PlusCircle className="h-3.5 w-3.5" /> {t("common.newBrand")}
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {renderSidebarLinks()}

        {/* User Footer */}
        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className={`elevated-card flex items-center rounded-xl py-2.5 ${sidebarCollapsed ? "justify-center px-1" : "justify-between px-3"}`}>
            <div className={sidebarCollapsed ? "sr-only" : "min-w-0"}>
              <div className="truncate text-xs font-bold">{user.name}</div>
              <div className="truncate text-[10px] text-[var(--text-muted)]">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-rose-400"
              title={t("common.signOut")}
              aria-label={t("common.signOut")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="surface-card relative z-10 flex w-72 flex-col"
            >
              <div className="flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-4">
                <BrandLogo href="/app" showByline />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg p-1.5"
                  aria-label={t("common.closeMenu")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {renderSidebarLinks(() => setMobileNavOpen(false), true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Command Header */}
        <header className="glass-panel sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-xl border border-[var(--border-subtle)] p-2 lg:hidden"
              aria-label={t("common.openMenu")}
            >
              <Menu className="h-5 w-5" />
            </button>

          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <LanguageSelector />
            {/* AI Mode / Credits Pill */}
            <Link
              href="/app/billing"
              aria-label={t("common.nav.billing")}
              className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors hover:border-violet-500/40"
            >
              {workspace.aiBillingMode === "byok" ? (
                <>
                  <KeyRound className="h-3.5 w-3.5 text-violet-400" />
                  <span className="hidden sm:inline">BYOK OpenAI</span>
                </>
              ) : (
                <>
                  <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">{t("common.aiCredits", { count: formatNumber(workspace.aiCreditsBalance) })}</span>
                </>
              )}
            </Link>

            {/* Notification Bell */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="elevated-card relative rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                aria-label={t("common.notifications")}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </motion.button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={SPRING_SNAPPY}
                    className="surface-card absolute right-0 top-full z-40 mt-2 w-80 rounded-2xl p-3 shadow-2xl sm:w-96"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                      <span className="text-xs font-extrabold">{t("common.notificationCenter")}</span>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:underline"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> {t("common.markRead")}
                      </button>
                    </div>
                    <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                          {t("common.noNotifications")}
                        </p>
                      ) : (
                        notifications.map((n) => (
                          <Link
                            key={n.id}
                            href={n.actionHref || "/app"}
                            onClick={() => setNotifOpen(false)}
                            className={`block rounded-xl p-2.5 transition-colors ${
                              n.isRead
                                ? "opacity-70 hover:bg-violet-500/5"
                                : "elevated-card border border-violet-500/30"
                            }`}
                          >
                            <div className="text-xs font-bold">{n.title}</div>
                            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                              {n.message}
                            </p>
                          </Link>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme Toggle */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={toggleTheme}
              className="elevated-card rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label={t("common.theme")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/app/studio"
                className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-3.5 py-2 text-xs font-bold text-white shadow-md sm:inline-flex"
              >
                <Wand2 className="h-3.5 w-3.5" /> {t("common.createPost")}
              </Link>
            </motion.div>
          </div>
        </header>

        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 p-4 sm:p-6 lg:p-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
