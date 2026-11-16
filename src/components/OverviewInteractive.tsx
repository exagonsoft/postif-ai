"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useToast } from "./ToastProvider";
import {
  StaggerContainer,
  StaggerItem,
  HoverLiftCard,
  PulseStatusDot,
  SPRING_SNAPPY,
} from "./MotionPrimitives";
import {
  Wand2,
  Bot,
  Megaphone,
  Share2,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface MetricPoint {
  dateLabel: string;
  platform: string;
  impressions: number;
  engagements: number;
  clicks: number;
  followers: number;
}

interface PostSummary {
  id: number;
  title: string;
  status: string;
  platforms: string[];
  scheduledAt: string | null;
  publishedAt: string | null;
  createdByAgent: boolean;
}

interface AgentActionSummary {
  id: number;
  title: string;
  description: string;
  status: string;
  actionType: string;
}

export function OverviewInteractive({
  metrics,
  posts,
  agentActions,
  agentMode,
  agentPaused,
}: {
  metrics: MetricPoint[];
  posts: PostSummary[];
  agentActions: AgentActionSummary[];
  agentMode: string;
  agentPaused: boolean;
}) {
  const { t, formatDate, formatNumber } = useAppLanguage();
  const displayStatus = (value: string) => ["draft","pending_approval","waiting_media","media_failed","approved","scheduled","publishing","published","failed","cancelled","proposed","rejected","executed","completed","manual","assisted","autopilot"].includes(value) ? t(`customer.status.${value}`) : value;

  const router = useRouter();
  const displayDate = (value: string) => {
    const monthDay = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/.exec(value);
    const date = monthDay ? new Date(Date.UTC(2000, ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthDay[1]), Number(monthDay[2]))) : /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? formatDate(date, { month: "short", day: "numeric", timeZone: "UTC" }) : value;
  };
  const { toast } = useToast();
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const filteredMetrics =
    platformFilter === "all"
      ? metrics
      : metrics.filter((m) => m.platform === platformFilter);

  const maxImp = Math.max(1000, ...filteredMetrics.map((m) => m.impressions));

  const upcomingPosts = posts
    .filter((p) => p.status === "scheduled" || p.status === "approved" || p.status === "pending_approval")
    .slice(0, 4);

  const recentPublished = posts.filter((p) => p.status === "published").slice(0, 4);

  const handleGenerateWeekly = async () => {
    setGeneratingPlan(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_plan" }),
      });
      if (res.ok) {
        toast(
          t("customer.text.497"),
          t("customer.text.498")
        );
        router.push("/app/agent");
        router.refresh();
      }
    } finally {
      setGeneratingPlan(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Prominent Quick Actions */}
      <StaggerContainer staggerDelay={0.06} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <HoverLiftCard>
            <Link
              href="/app/studio"
              className="group flex items-center justify-between rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-4 text-white shadow-lg shadow-violet-600/20"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/15 p-2.5">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold">{t("customer.text.499")}</div>
                  <div className="text-[11px] text-white/80">{t("customer.text.500")}</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </HoverLiftCard>
        </StaggerItem>

        <StaggerItem>
          <HoverLiftCard>
            <button
              type="button"
              disabled={generatingPlan}
              onClick={handleGenerateWeekly}
              className="surface-card group flex w-full items-center justify-between rounded-2xl p-4 text-left transition-colors hover:border-cyan-400/50"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-cyan-500/15 p-2.5 text-cyan-400">
                  {generatingPlan ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Bot className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-extrabold">{t("customer.text.501")}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {t("customer.text.502")}
                  </div>
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-cyan-400" />
            </button>
          </HoverLiftCard>
        </StaggerItem>

        <StaggerItem>
          <HoverLiftCard>
            <Link
              href="/app/campaigns"
              className="surface-card group flex items-center justify-between rounded-2xl p-4 transition-colors hover:border-violet-500/50"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-violet-500/15 p-2.5 text-violet-400">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold">{t("customer.text.503")}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {t("customer.text.504")}
                  </div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[var(--text-muted)]" />
            </Link>
          </HoverLiftCard>
        </StaggerItem>

        <StaggerItem>
          <HoverLiftCard>
            <Link
              href="/app/social"
              className="surface-card group flex items-center justify-between rounded-2xl p-4 transition-colors hover:border-emerald-500/50"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-400">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold">{t("customer.text.505")}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {t("customer.text.506")}
                  </div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[var(--text-muted)]" />
            </Link>
          </HoverLiftCard>
        </StaggerItem>
      </StaggerContainer>

      {/* Interactive Engagement & Audience Growth Chart + AI Agent Status */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="surface-card rounded-3xl p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold">
                  {t("customer.text.507")}
                </h2>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  {t("customer.text.255")}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {t("customer.text.509")}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {["all", "linkedin", "x", "instagram", "tiktok"].map((plat) => {
                const isSelected = platformFilter === plat;
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => setPlatformFilter(plat)}
                    className={`relative rounded-lg px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                      isSelected ? "text-white" : "elevated-card text-[var(--text-secondary)]"
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="overviewChartFilterPill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-lg bg-violet-600"
                      />
                    )}
                    <span className="relative z-10">{plat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Animated Bar Chart */}
          <div className="mt-6">
            <div className="grid h-52 grid-cols-5 items-end gap-3 border-b border-[var(--border-subtle)] pb-3 sm:grid-cols-10">
              {filteredMetrics.map((m, idx) => {
                const heightPct = Math.max(14, Math.round((m.impressions / maxImp) * 100));
                const engPct = Math.max(8, Math.round(((m.engagements * 12) / maxImp) * 100));
                return (
                  <div
                    key={`${platformFilter}-${m.dateLabel}-${m.platform}-${idx}`}
                    className="group relative flex h-full flex-col items-center justify-end"
                  >
                    <div className="pointer-events-none absolute -top-10 z-10 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white shadow-lg group-hover:block">
                      {m.platform.toUpperCase()}: {formatNumber(m.impressions)} {t("customer.text.511")}{" "}
                      {formatNumber(m.engagements)} {t("customer.text.512")}
                    </div>
                    <div className="flex h-44 w-full max-w-[34px] items-end justify-center gap-1">
                      <motion.div
                        initial={{ height: "0%" }}
                        animate={{ height: `${heightPct}%` }}
                        transition={{
                          type: "spring",
                          stiffness: 220,
                          damping: 22,
                          delay: idx * 0.03,
                        }}
                        className="w-1/2 rounded-t-md bg-gradient-to-t from-violet-600 to-indigo-400"
                      />
                      <motion.div
                        initial={{ height: "0%" }}
                        animate={{ height: `${Math.min(100, engPct)}%` }}
                        transition={{
                          type: "spring",
                          stiffness: 220,
                          damping: 22,
                          delay: idx * 0.03 + 0.05,
                        }}
                        className="w-1/2 rounded-t-md bg-cyan-400"
                      />
                    </div>
                    <span className="mt-2 text-[10px] font-medium text-[var(--text-muted)]">
                      {displayDate(m.dateLabel)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> {t("customer.text.280")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" /> {t("customer.text.515")}
                </span>
              </div>
              <Link href="/app/analytics" className="font-semibold text-cyan-400 hover:underline">
                {t("customer.text.516")}
              </Link>
            </div>
          </div>
        </div>

        {/* Autonomous Agent & AI Recommendations */}
        <div className="surface-card flex flex-col justify-between rounded-3xl p-6 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-cyan-400" />
                <h2 className="text-base font-extrabold">{t("customer.text.517")}</h2>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  agentPaused
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                <PulseStatusDot color={agentPaused ? "amber" : "emerald"} />
                {agentPaused ? t("customer.text.214") : t("customer.agentMode", { mode: displayStatus(agentMode) })}
              </span>
            </div>

            <div className="elevated-card mt-4 rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-violet-400">
                {t("customer.text.519")}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-primary)]">
                {t("customer.text.520")}{" "} <strong>{t("customer.text.521")}</strong> {t("customer.text.522")}
              </p>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t("customer.text.523")}
              </div>
              {agentActions.slice(0, 3).map((act) => (
                <motion.div
                  key={act.id}
                  whileHover={{ x: 3 }}
                  transition={SPRING_SNAPPY}
                  className="elevated-card rounded-xl p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold">{act.title}</span>
                    <span className="shrink-0 rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-300">
                      {displayStatus(act.status)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-secondary)]">
                    {act.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          <Link
            href="/app/agent"
            className="mt-5 block rounded-xl bg-violet-600/20 py-2.5 text-center text-xs font-bold text-violet-300 transition-colors hover:bg-violet-600/30"
          >
            {t("customer.text.524")}
          </Link>
        </div>
      </div>

      {/* Upcoming Scheduled Posts & Recent Publications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">{t("customer.text.525")}</h2>
            <Link href="/app/calendar" className="text-xs font-semibold text-cyan-400 hover:underline">
              {t("customer.text.526")}
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {upcomingPosts.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                {t("customer.text.527")}
              </p>
            ) : (
              upcomingPosts.map((p) => (
                <motion.div
                  key={p.id}
                  whileHover={{ x: 3 }}
                  transition={SPRING_SNAPPY}
                  className="elevated-card flex items-center justify-between gap-3 rounded-2xl p-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {p.status === "pending_approval" ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      )}
                      <span className="truncate text-xs font-bold">{p.title}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {p.platforms.map((pl) => pl.toUpperCase()).join(" • ")}{" "}
                      {p.scheduledAt ? `• ${formatDate(new Date(p.scheduledAt), { dateStyle: "medium" })}` : ""}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      p.status === "pending_approval"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-cyan-500/20 text-cyan-300"
                    }`}
                  >
                    {displayStatus(p.status)}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="surface-card rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">{t("customer.text.528")}</h2>
            <Link href="/app/posts" className="text-xs font-semibold text-cyan-400 hover:underline">
              {t("customer.text.529")}
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {recentPublished.map((p) => (
              <motion.div
                key={p.id}
                whileHover={{ x: 3 }}
                transition={SPRING_SNAPPY}
                className="elevated-card flex items-center justify-between gap-3 rounded-2xl p-3.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className="truncate text-xs font-bold">{p.title}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {t("customer.text.530")}{" "} {p.platforms.map((pl) => pl.toUpperCase()).join(", ")}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
                  {t("customer.text.305")}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
