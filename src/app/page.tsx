import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { HeroDashboardPreview, LandingInteractive } from "@/components/LandingInteractive";
import {
  AmbientAura,
  FadeInUp,
  StaggerContainer,
  StaggerItem,
  HoverLiftCard,
  PulseStatusDot,
} from "@/components/MotionPrimitives";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import {
  Sparkles,
  ArrowRight,
  Bot,
  CalendarClock,
  Wand2,
  BarChart3,
  KeyRound,
  Cpu,
  ShieldCheck,
  Check,
  Repeat,
  Users,
} from "lucide-react";

export default function HomePage() {
  const featuredPlans = [
    SUBSCRIPTION_PLANS.free,
    SUBSCRIPTION_PLANS.starter_byok,
    SUBSCRIPTION_PLANS.pro_ai,
    SUBSCRIPTION_PLANS.agency,
  ];

  return (
    <PublicShell>
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[var(--border-subtle)] pt-16 pb-24 sm:pt-24">
        <AmbientAura />

        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <FadeInUp distance={14}>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-300">
              <PulseStatusDot color="cyan" />
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              Create Once. Publish Everywhere. Grow Automatically. — By ExagonSoft
            </div>
          </FadeInUp>

          <FadeInUp delay={0.08} distance={20}>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              Your Social Media.{" "}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                On Autopilot.
              </span>
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.14} distance={18}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-xl">
              Create, schedule, and publish AI-powered content across all your social channels. One
              intelligent workspace. Endless possibilities.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.2} distance={16}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <HoverLiftCard>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-7 py-4 text-sm font-bold text-white shadow-xl shadow-violet-600/30 sm:text-base"
                >
                  Start for Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </HoverLiftCard>
              <HoverLiftCard>
                <Link
                  href="/app"
                  className="surface-card inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-sm font-bold transition-colors hover:border-violet-500/50 sm:text-base"
                >
                  Explore the Platform
                </Link>
              </HoverLiftCard>
            </div>
          </FadeInUp>

          {/* Supported Platform Logos Bar */}
          <div className="mt-14">
            <FadeInUp delay={0.24}>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Purpose-Built Publishing Adapters & Native Formatting For
              </p>
            </FadeInUp>
            <StaggerContainer
              staggerDelay={0.04}
              className="mt-5 flex flex-wrap items-center justify-center gap-3"
            >
              {Object.values(SOCIAL_PLATFORM_SPECS).map((platform) => (
                <StaggerItem key={platform.id}>
                  <HoverLiftCard className="surface-card inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-extrabold text-slate-950"
                      style={{ backgroundColor: platform.accentColor }}
                    >
                      {platform.shortLabel}
                    </span>
                    <span>{platform.name}</span>
                  </HoverLiftCard>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>

          {/* Interactive Product Dashboard Preview */}
          <HeroDashboardPreview />
        </div>
      </section>

      {/* Core Platform Capabilities */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <FadeInUp className="text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
            Command Center Architecture
          </span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything Your Marketing Team Needs in One Intelligent Workspace
          </h2>
        </FadeInUp>

        <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Bot,
              title: "Autonomous AI Marketing Agent",
              desc: "Move from manual posting to Manual, Assisted, or rule-bounded Autopilot execution with weekly plans, approval inboxes, and auditable guardrails.",
            },
            {
              icon: Wand2,
              title: "AI Content Studio",
              desc: "Generate, rewrite, shorten, expand, translate, and adapt a single topic into native LinkedIn, X, Instagram, TikTok, and YouTube variants.",
            },
            {
              icon: CalendarClock,
              title: "Persistent Job-Backed Calendar",
              desc: "Monthly, weekly, daily, and list views backed by idempotent MongoDB publishing jobs, retry policies, timezone awareness, and failure logs.",
            },
            {
              icon: Repeat,
              title: "Smart Content Repurposing",
              desc: "Transform blog articles, product announcements, and top-performing posts into fresh multi-platform campaigns without losing brand voice.",
            },
            {
              icon: BarChart3,
              title: "Grounded Performance Intelligence",
              desc: "Track reach, engagement rate, clicks, and follower velocity across channels with AI recommendations backed by actual workspace metrics.",
            },
            {
              icon: Users,
              title: "Multi-Brand & Agency RBAC",
              desc: "Isolate client brands, calendars, and social accounts with Owner, Administrator, Editor, Approver, and Viewer permissions.",
            },
          ].map((feat) => {
            const Icon = feat.icon;
            return (
              <StaggerItem key={feat.title}>
                <HoverLiftCard className="surface-card h-full rounded-3xl p-6 transition-colors hover:border-violet-500/40">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 text-cyan-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{feat.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {feat.desc}
                  </p>
                </HoverLiftCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </section>

      {/* Interactive Demo + FAQ */}
      <LandingInteractive />

      {/* BYOK vs Managed AI Section */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--bg-surface)] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeInUp className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">
              Transparent Dual-Dimension Commercial Model
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Bring Your Own Key (BYOK) or Managed AI Credits
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">
              POSTIF-AI separates platform subscription capabilities from AI token consumption—so
              you never pay hidden AI markups if you already have OpenAI API access.
            </p>
          </FadeInUp>

          <StaggerContainer className="mt-12 grid gap-8 lg:grid-cols-2">
            <StaggerItem>
              <HoverLiftCard className="elevated-card h-full rounded-3xl p-8">
                <div className="inline-flex items-center gap-2 rounded-xl bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-300">
                  <KeyRound className="h-4 w-4" />
                  Option 1: Bring Your Own Key (BYOK)
                </div>
                <h3 className="mt-4 text-2xl font-extrabold">Direct OpenAI Billing, Zero Markup</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Connect your own OpenAI API key (`sk-...`). Keys are encrypted at rest with
                  AES-256-GCM and never exposed to browser JavaScript or logs.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-violet-400" />
                    Pay OpenAI directly at wholesale token rates
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-violet-400" />
                    Choose GPT-4o, GPT-4o-mini, or o3-mini per workspace
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-violet-400" />
                    Rotate or revoke keys with one click anytime
                  </li>
                </ul>
              </HoverLiftCard>
            </StaggerItem>

            <StaggerItem>
              <HoverLiftCard className="elevated-card h-full rounded-3xl p-8">
                <div className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300">
                  <Cpu className="h-4 w-4" />
                  Option 2: Managed AI Credits
                </div>
                <h3 className="mt-4 text-2xl font-extrabold">Turnkey AI Ready in 10 Seconds</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  No external developer account required. Use POSTIF-AI’s managed OpenAI
                  infrastructure with predictable monthly credit allowances and usage telemetry.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-cyan-400" />
                    Included monthly AI credits on Free, Starter AI, Pro AI & Agency
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-cyan-400" />
                    Real-time operation cost transparency & credit ledger
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-cyan-400" />
                    Switch between Managed AI and BYOK as your volume scales
                  </li>
                </ul>
              </HoverLiftCard>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <FadeInUp className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
              Flexible Plans
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Start Free. Scale to Autonomous Agency Operations.
            </h2>
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-400 hover:underline"
          >
            Compare all 6 plans & credit costs <ArrowRight className="h-4 w-4" />
          </Link>
        </FadeInUp>

        <StaggerContainer className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {featuredPlans.map((plan) => (
            <StaggerItem key={plan.slug}>
              <HoverLiftCard
                className={`surface-card flex h-full flex-col justify-between rounded-3xl p-6 ${
                  plan.popular ? "ring-2 ring-violet-500" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-extrabold">{plan.name}</h3>
                    {plan.popular && (
                      <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
                        Most Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{plan.tagline}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold">${plan.monthlyPrice}</span>
                    <span className="text-xs text-[var(--text-muted)]">/month</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-xs text-[var(--text-secondary)]">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/onboarding"
                  className={`mt-6 block rounded-xl py-2.5 text-center text-xs font-bold transition-all ${
                    plan.popular
                      ? "bg-gradient-to-r from-violet-600 to-cyan-500 text-white"
                      : "elevated-card hover:border-violet-500/40"
                  }`}
                >
                  Choose {plan.name}
                </Link>
              </HoverLiftCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* Final Conversion Banner */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <FadeInUp>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-700 via-indigo-700 to-cyan-600 p-8 text-center text-white shadow-2xl sm:p-14">
            <div className="mx-auto max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1 text-xs font-bold">
                <ShieldCheck className="h-4 w-4" />
                No Credit Card Required to Explore
              </div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Put Your Social Growth on Intelligent Autopilot
              </h2>
              <p className="mt-3 text-sm text-white/85 sm:text-base">
                Create a workspace, configure your brand, and connect your own social accounts.
                AI suggestions require your configured provider and are always available for review.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <HoverLiftCard>
                  <Link
                    href="/register"
                    className="inline-block rounded-2xl bg-slate-950 px-7 py-3.5 text-sm font-bold text-white shadow-xl"
                  >
                    Create Your Workspace
                  </Link>
                </HoverLiftCard>
                <HoverLiftCard>
                  <Link
                    href="/onboarding"
                    className="inline-block rounded-2xl bg-white/15 px-7 py-3.5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/25"
                  >
                    Start Brand Onboarding
                  </Link>
                </HoverLiftCard>
              </div>
            </div>
          </div>
        </FadeInUp>
      </section>
    </PublicShell>
  );
}
