import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import {
  Wand2,
  Bot,
  CalendarClock,
  Repeat,
  Image as ImageIcon,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export const metadata = {
  title: "Features — AI Content Studio, Autonomous Agent & Multi-Channel Scheduling",
};

export default function FeaturesPage() {
  const modules = [
    {
      id: "studio",
      badge: "AI Content Studio",
      icon: Wand2,
      title: "Generate Native Posts for 8 Social Networks Simultaneously",
      desc: "Input your brand voice, topic, audience, and objective once. POSTIF-AI produces tailored versions optimized for LinkedIn thought leadership, X threads, Instagram carousels, TikTok video scripts, YouTube Shorts, Threads, Facebook, and Pinterest.",
      bullets: [
        "12+ editorial transformations: Rewrite, Improve, Shorten, Expand, Translate, Change Tone, Hashtags & CTAs",
        "Realistic platform previews with live character limit counters",
        "Full editorial lifecycle: Draft → Pending Approval → Approved → Scheduled → Published",
      ],
    },
    {
      id: "agent",
      badge: "Competitive Differentiator",
      icon: Bot,
      title: "Autonomous AI Marketing Agent with Auditable Guardrails",
      desc: "Hire an AI marketing strategist that analyzes your brand pillars, builds weekly publishing plans, drafts platform-specific content, and optimizes cadence from engagement telemetry.",
      bullets: [
        "Three control tiers: Manual Mode, Assisted Mode, and rule-bounded Autopilot Mode",
        "Instant Pause Autopilot kill-switch, weekly post caps, and allowed-channel lock",
        "Human approval inbox and immutable audit logs for every autonomous action",
      ],
    },
    {
      id: "calendar",
      badge: "Durable Job Infrastructure",
      icon: CalendarClock,
      title: "Multi-View Content Calendar & Idempotent Publishing Queue",
      desc: "Plan visually across Monthly, Weekly, Daily, and List views backed by persistent PostgreSQL publishing jobs—never fragile browser timers.",
      bullets: [
        "Timezone-aware scheduling, post duplication, and campaign grouping",
        "Idempotency keys prevent duplicate social publications",
        "Automatic retry policies and one-click retry for failed jobs",
      ],
    },
    {
      id: "repurpose",
      badge: "Content Multiplication",
      icon: Repeat,
      title: "Smart Content Repurposing Engine",
      desc: "Feed a blog post, product changelog, or press announcement into POSTIF-AI and extract a cohesive multi-day social campaign while preserving brand voice.",
      bullets: [
        "Blog-to-thread, announcement-to-carousel, and evergreen post refreshers",
        "Brand voice preservation & anti-repetition controls",
        "Direct export into drafts or scheduled calendar slots",
      ],
    },
    {
      id: "media",
      badge: "Visual & Asset Studio",
      icon: ImageIcon,
      title: "AI Media Library, Aspect-Ratio Presets & Alt-Text Generator",
      desc: "Organize visual assets, generate AI image prompts, apply brand color presets, and optimize aspect ratios (1:1, 4:5, 16:9, 9:16) per platform.",
      bullets: [
        "Automated accessibility alt-text generation",
        "Reusable brand visual templates & video storyboard blueprints",
        "Tag-based asset search across multi-brand workspaces",
      ],
    },
    {
      id: "analytics",
      badge: "Grounded Intelligence",
      icon: BarChart3,
      title: "Performance Intelligence & Multi-Brand Governance",
      desc: "Monitor reach, engagement rate, link clicks, and follower growth with exportable CSV/JSON reports and AI recommendations grounded in real workspace data.",
      bullets: [
        "Role-based permissions: Owner, Administrator, Editor, Approver, Viewer",
        "Encrypted BYOK OpenAI Vault (AES-256-GCM) or Managed AI Credits",
        "Operator Admin Console with feature flags and system audit trails",
      ],
    },
  ];

  return (
    <PublicShell>
      <section className="border-b border-[var(--border-subtle)] py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
            Built by ExagonSoft on Next.js App Router & PostgreSQL
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Every Workflow Engineered for Autonomous Social Growth
          </h1>
          <p className="mt-4 text-base text-[var(--text-secondary)] sm:text-lg">
            Explore the full suite of AI creation, scheduling, approval governance, and analytics
            tools inside POSTIF-AI.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg"
            >
              Try Live Interactive Studio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-12 px-4 py-20 sm:px-6 lg:px-8">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.id}
              id={mod.id}
              className="surface-card grid gap-8 rounded-3xl p-8 lg:grid-cols-12 lg:items-center"
            >
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-xl bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-300">
                  <Icon className="h-4 w-4 text-cyan-400" />
                  {mod.badge}
                </div>
                <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">{mod.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                  {mod.desc}
                </p>
              </div>
              <div className="elevated-card space-y-3 rounded-2xl p-6 lg:col-span-5">
                {mod.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </PublicShell>
  );
}
