"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { useTheme } from "./ThemeProvider";
import { useToast } from "./ToastProvider";
import { PulseStatusDot, SPRING_SNAPPY } from "./MotionPrimitives";
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
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/studio", label: "AI Content Studio", icon: Wand2 },
  { href: "/app/repurpose", label: "Smart Repurpose", icon: Repeat },
  { href: "/app/calendar", label: "Content Calendar", icon: CalendarClock },
  { href: "/app/posts", label: "Posts", icon: FileText, badgeKey: "approvals" as const },
  { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/app/social", label: "Social Accounts", icon: Share2 },
  { href: "/app/agent", label: "AI Marketing Agent", icon: Bot },
  { href: "/app/media", label: "Media Library", icon: ImageIcon },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/workspaces", label: "Brands & Workspaces", icon: Building2 },
  { href: "/app/billing", label: "Billing & Usage", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
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
      toast("Workspace switched", "Loaded isolated tenant workspace.");
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

  const renderSidebarLinks = (onNavigate?: () => void, isMobile = false) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Application Sidebar">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
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
              <Icon className={`h-4 w-4 ${active ? "text-cyan-300" : ""}`} />
              <span>{item.label}</span>
            </span>
            {item.badgeKey === "approvals" && pendingApprovalsCount > 0 && (
              <span className="relative z-10 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                {pendingApprovalsCount}
              </span>
            )}
          </Link>
        );
      })}

      {user.systemRole === "operator" && (
        <div className="pt-3">
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            ExagonSoft Operator
          </div>
          <Link
            href="/app/admin"
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
              pathname.startsWith("/app/admin")
                ? "bg-rose-600 text-white"
                : "text-rose-400 hover:bg-rose-500/10"
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>Admin Console</span>
          </Link>
        </div>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-4">
          <BrandLogo href="/app" showByline />
        </div>

        {/* Workspace Switcher */}
        <div className="relative border-b border-[var(--border-subtle)] p-3">
          <button
            type="button"
            onClick={() => setWsOpen((v) => !v)}
            className="elevated-card flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:border-violet-500/40"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-extrabold">{workspace.name}</div>
              <div className="truncate text-[11px] text-[var(--text-muted)]">
                Brand: {activeBrandName} • {memberRole}
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          </button>

          <AnimatePresence>
            {wsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className="surface-card absolute left-3 right-3 top-full z-30 mt-1 rounded-2xl p-2 shadow-2xl"
              >
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Switch Workspace
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
                  <PlusCircle className="h-3.5 w-3.5" /> New Brand Wizard
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {renderSidebarLinks()}

        {/* User Footer */}
        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="elevated-card flex items-center justify-between rounded-xl px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-xs font-bold">{user.name}</div>
              <div className="truncate text-[10px] text-[var(--text-muted)]">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-rose-400"
              title="Sign Out"
              aria-label="Sign out"
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
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* AI Mode / Credits Pill */}
            <Link
              href="/app/billing"
              className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors hover:border-violet-500/40"
            >
              {workspace.aiBillingMode === "byok" ? (
                <>
                  <KeyRound className="h-3.5 w-3.5 text-violet-400" />
                  <span>BYOK OpenAI</span>
                </>
              ) : (
                <>
                  <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{workspace.aiCreditsBalance} AI Credits</span>
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
                aria-label="Notifications"
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
                      <span className="text-xs font-extrabold">Notification Center</span>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:underline"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                      </button>
                    </div>
                    <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                          No notifications yet.
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
              aria-label="Toggle color theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/app/studio"
                className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-3.5 py-2 text-xs font-bold text-white shadow-md sm:inline-flex"
              >
                <Wand2 className="h-3.5 w-3.5" /> Create Post
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
