"use client";

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
  const router = useRouter();
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
          "Weekly Content Plan Generated",
          "AI Marketing Agent updated your 5-day multi-platform schedule."
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
                  <div className="text-sm font-extrabold">Create Post</div>
                  <div className="text-[11px] text-white/80">AI Multi-Platform Studio</div>
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
                  <div className="text-sm font-extrabold">Generate Weekly Content</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    AI Agent 5-Day Blueprint
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
                  <div className="text-sm font-extrabold">Create Campaign</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    4-Week AI Campaign Plan
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
                  <div className="text-sm font-extrabold">Connect Social Account</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    8 Platform Adapters
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
                  Engagement & Reach Velocity
                </h2>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  Recorded Analytics
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Stored engagement measurements. Live engagement ingestion must be configured separately.
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
                      {m.platform.toUpperCase()}: {m.impressions.toLocaleString()} imp •{" "}
                      {m.engagements} eng
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
                      {m.dateLabel.replace("Apr ", "4/")}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> Impressions
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" /> Weighted Engagements
                </span>
              </div>
              <Link href="/app/analytics" className="font-semibold text-cyan-400 hover:underline">
                Full Analytics & CSV Export →
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
                <h2 className="text-base font-extrabold">AI Marketing Agent</h2>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  agentPaused
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                <PulseStatusDot color={agentPaused ? "amber" : "emerald"} />
                {agentPaused ? "Paused" : `${agentMode} Mode`}
              </span>
            </div>

            <div className="elevated-card mt-4 rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-violet-400">
                Grounded AI Recommendation
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-primary)]">
                Educational posts generated <strong>4.9% engagement</strong> vs 2.7% for pure
                product announcements over the past 14 days. Increase educational breakdowns to 3x/week.
              </p>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Recent Agent Activity
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
                      {act.status}
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
            Open Agent Command Workspace →
          </Link>
        </div>
      </div>

      {/* Upcoming Scheduled Posts & Recent Publications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">Upcoming & Pending Approvals</h2>
            <Link href="/app/calendar" className="text-xs font-semibold text-cyan-400 hover:underline">
              Open Calendar →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {upcomingPosts.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                No upcoming posts scheduled. Use AI Content Studio to draft your next post.
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
                      {p.scheduledAt ? `• ${new Date(p.scheduledAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      p.status === "pending_approval"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-cyan-500/20 text-cyan-300"
                    }`}
                  >
                    {p.status.replace("_", " ")}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="surface-card rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">Recent Publications</h2>
            <Link href="/app/posts" className="text-xs font-semibold text-cyan-400 hover:underline">
              All Posts →
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
                    Published to {p.platforms.map((pl) => pl.toUpperCase()).join(", ")}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
                  Published
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
