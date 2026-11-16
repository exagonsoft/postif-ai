import { getServerI18n } from "@/i18n/server";
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
import { getCatalogPlans } from "@/lib/billing-catalog";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import { publicPageMetadata, siteStructuredData } from "@/lib/seo";
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

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("home", locale);
}
export default async function HomePage() {
  const { t, locale, formatNumber } = await getServerI18n();
  const catalogPlans = await getCatalogPlans();
  const featuredSlugs = ["free", "starter_byok", "pro_ai", "agency"];
  const featuredPlans = [
    ...featuredSlugs.flatMap(slug => catalogPlans.filter(plan => plan.slug === slug)),
    ...catalogPlans.filter(plan => !featuredSlugs.includes(plan.slug)),
  ].slice(0, 4);

  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData(locale)).replace(/</g, "\\u003c") }} />
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[var(--border-subtle)] pt-16 pb-24 sm:pt-24">
        <AmbientAura />

        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <FadeInUp distance={14}>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-300">
              <PulseStatusDot color="cyan" />
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />{t("public.home.text01")}</div>
          </FadeInUp>

          <FadeInUp delay={0.08} distance={20}>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">{t("public.home.text02")}{" "}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">{t("public.home.text03")}</span>
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.14} distance={18}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-xl">{t("public.home.text04")}</p>
          </FadeInUp>

          <FadeInUp delay={0.2} distance={16}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <HoverLiftCard>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-7 py-4 text-sm font-bold text-white shadow-xl shadow-violet-600/30 sm:text-base"
                >{t("public.home.text05")}<ArrowRight className="h-4 w-4" />
                </Link>
              </HoverLiftCard>
              <HoverLiftCard>
                <Link
                  href="/login"
                  className="surface-card inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-sm font-bold transition-colors hover:border-violet-500/50 sm:text-base"
                >{t("public.home.text06")}</Link>
              </HoverLiftCard>
            </div>
          </FadeInUp>

          {/* Supported Platform Logos Bar */}
          <div className="mt-14">
            <FadeInUp delay={0.24}>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">{t("public.home.text07")}</p>
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
                    <span>{platform.id === "facebook" || platform.id === "instagram" ? t(`public.platform.${platform.id}.name`) : platform.name}</span>
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
          <span className="text-xs font-bold uppercase tracking-widest text-violet-400">{t("public.home.text08")}</span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("public.home.text09")}</h2>
        </FadeInUp>

        <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Bot,
              title: t("public.home.text10"),
              desc: t("public.home.text11"),
            },
            {
              icon: Wand2,
              title: t("public.home.text12"),
              desc: t("public.home.text13"),
            },
            {
              icon: CalendarClock,
              title: t("public.home.text14"),
              desc: t("public.home.text15"),
            },
            {
              icon: Repeat,
              title: t("public.home.text16"),
              desc: t("public.home.text17"),
            },
            {
              icon: BarChart3,
              title: t("public.home.text18"),
              desc: t("public.home.text19"),
            },
            {
              icon: Users,
              title: t("public.home.text20"),
              desc: t("public.home.text21"),
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
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">{t("public.home.text22")}</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("public.home.text23")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">{t("public.home.text24")}</p>
          </FadeInUp>

          <StaggerContainer className="mt-12 grid gap-8 lg:grid-cols-2">
            <StaggerItem>
              <HoverLiftCard className="elevated-card h-full rounded-3xl p-8">
                <div className="inline-flex items-center gap-2 rounded-xl bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-300">
                  <KeyRound className="h-4 w-4" />{t("public.home.text25")}</div>
                <h3 className="mt-4 text-2xl font-extrabold">{t("public.home.text26")}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("public.home.text27")}</p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-violet-400" />{t("public.home.text28")}</li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-violet-400" />{t("public.home.text29")}</li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-violet-400" />{t("public.home.text30")}</li>
                </ul>
              </HoverLiftCard>
            </StaggerItem>

            <StaggerItem>
              <HoverLiftCard className="elevated-card h-full rounded-3xl p-8">
                <div className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300">
                  <Cpu className="h-4 w-4" />{t("public.home.text31")}</div>
                <h3 className="mt-4 text-2xl font-extrabold">{t("public.home.text32")}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("public.home.text33")}</p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-cyan-400" />{t("public.home.text34")}</li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-cyan-400" />{t("public.home.text35")}</li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-cyan-400" />{t("public.home.text36")}</li>
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
            <span className="text-xs font-bold uppercase tracking-widest text-violet-400">{t("public.home.text37")}</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("public.home.text38")}</h2>
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-400 hover:underline"
          >{t("public.home.text39")}{" "}<ArrowRight className="h-4 w-4" />
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
                      <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">{t("public.home.text40")}</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{plan.description ?? plan.tagline}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold">{formatNumber(plan.monthlyPrice, { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 })}</span>
                    <span className="text-xs text-[var(--text-muted)]">{t("public.home.text41")}</span>
                  </div>
                  {!plan.purchasable && <p className="mt-2 text-xs text-amber-300">{t("public.home.text42")}</p>}
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
                  href="/register"
                  className={`mt-6 block rounded-xl py-2.5 text-center text-xs font-bold transition-all ${
                    plan.popular
                      ? "bg-gradient-to-r from-violet-600 to-cyan-500 text-white"
                      : "elevated-card hover:border-violet-500/40"
                  }`}
                >
                  {t("public.pricing.choosePlan", { name: plan.name })}
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
                <ShieldCheck className="h-4 w-4" />{t("public.home.text44")}</div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("public.home.text45")}</h2>
              <p className="mt-3 text-sm text-white/85 sm:text-base">{t("public.home.text46")}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <HoverLiftCard>
                  <Link
                    href="/register"
                    className="inline-block rounded-2xl bg-slate-950 px-7 py-3.5 text-sm font-bold text-white shadow-xl"
                  >{t("public.home.text47")}</Link>
                </HoverLiftCard>
                <HoverLiftCard>
                  <Link
                    href="/login?next=/onboarding"
                    className="inline-block rounded-2xl bg-white/15 px-7 py-3.5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/25"
                  >{t("public.home.text48")}</Link>
                </HoverLiftCard>
              </div>
            </div>
          </div>
        </FadeInUp>
      </section>
    </PublicShell>
  );
}
