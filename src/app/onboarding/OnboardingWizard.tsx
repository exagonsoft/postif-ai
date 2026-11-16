"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import { createIdempotentFetcher } from "@/lib/idempotent-fetch";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/components/ToastProvider";
import type { PlanDefinition } from "@/lib/plans";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import type { BrandsDocument } from "@/db/schema";
import {
  Sparkles,
  Globe,
  Check,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Cpu,
  Loader2,
} from "lucide-react";

type InitialBrand = Pick<BrandsDocument, "name" | "websiteUrl" | "industry" | "description" |
  "productsServices" | "targetAudience" | "brandVoice" | "tone" | "marketingGoals" |
  "contentPillars" | "suggestedHashtags">;

export default function OnboardingWizard({ workspaceId, createWorkspace, initialWorkspaceName, initialBrand, initialAiBillingMode, allowedAiModes, catalogPlans, currentPlan }: {
  workspaceId: number;
  createWorkspace: boolean;
  initialWorkspaceName: string;
  initialBrand: InitialBrand | null;
  initialAiBillingMode: "managed" | "byok";
  allowedAiModes: ("managed" | "byok")[];
  catalogPlans: PlanDefinition[];
  currentPlan: PlanDefinition;
}) {
  const { t, formatNumber } = useAppLanguage();

    const STEPS = [
      t("customer.text.109"),
      t("customer.text.110"),
      t("customer.text.111"),
      t("customer.text.112"),
      t("customer.text.113"),
      t("customer.text.114"),
      t("customer.text.115"),
      t("customer.text.116"),
      t("customer.text.117"),
      t("customer.text.118"),
      t("customer.text.119"),
    ];
  const displayLabel = (value: string) => ({
    "AI & Developer Infrastructure": t("customer.text.148"),
    "B2B SaaS": t("customer.text.149"),
    "E-Commerce & Consumer Brands": t("customer.text.150"),
    "Health, Fitness & Wellness": t("customer.text.151"),
    "Marketing Agency": t("customer.text.152"),
    "FinTech & Financial Services": t("customer.text.153"),
    "Innovative & Visionary": t("customer.text.158"),
    "Authoritative & Executive": t("customer.text.159"),
    "Friendly & Conversational": t("customer.text.160"),
    "Educational & Practical": t("customer.text.161"),
    "Bold & Provocative": t("customer.text.162"),
    "Empathetic & Community-First": t("customer.text.163")
  } as Record<string, string>)[value] ?? value;
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [discovering, setDiscovering] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [brandName, setBrandName] = useState(initialBrand?.name || "");
  const [websiteUrl, setWebsiteUrl] = useState(initialBrand?.websiteUrl || "");
  const [industry, setIndustry] = useState(initialBrand?.industry || "");
  const [description, setDescription] = useState(initialBrand?.description || "");
  const [productsServices, setProductsServices] = useState(initialBrand?.productsServices || "");
  const [targetAudience, setTargetAudience] = useState(initialBrand?.targetAudience || "");
  const [brandVoice, setBrandVoice] = useState(initialBrand?.brandVoice || "");
  const [tone, setTone] = useState(initialBrand?.tone || "Professional");
  const [marketingGoals, setMarketingGoals] = useState<string[]>(initialBrand?.marketingGoals || []);
  const [goalInput, setGoalInput] = useState("");
  const [contentPillars, setContentPillars] = useState<string[]>(initialBrand?.contentPillars || []);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>(initialBrand?.suggestedHashtags || []);
  const [initialStrategy, setInitialStrategy] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [aiBillingMode, setAiBillingMode] = useState(initialAiBillingMode);
  const [byokApiKey, setByokApiKey] = useState("");
  const [planSlug, setPlanSlug] = useState<string>("free");
  const [requestAi] = useState(createIdempotentFetcher);

  const runDiscovery = async () => {
    setDiscovering(true);
    try {
      const res = await requestAi("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          workspaceId,
          createWorkspace,
          brandName,
          websiteUrl,
          notes: productsServices,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(t("customer.text.121"), data.error || t("customer.text.122"), "error");
        return;
      }
      const d = data.discovery;
      setIndustry(d.industry);
      setDescription(d.description);
      setProductsServices(d.productsServices);
      setTargetAudience(d.targetAudience);
      setBrandVoice(d.brandVoice);
      setTone(d.tone);
      setContentPillars(d.contentPillars || []);
      setSuggestedHashtags(d.suggestedHashtags || []);
      setInitialStrategy(d.initialStrategy || "");
      toast(
        t("customer.text.123"),
        t("customer.discoverySuggestions", { source: data.meta?.executionSource ?? "" })
      );
    } catch (error) {
      toast(t("customer.text.124"), error instanceof Error ? error.message : t("customer.text.60"), "error");
    } finally {
      setDiscovering(false);
    }
  };

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const addGoal = () => {
    if (!goalInput.trim()) return;
    setMarketingGoals((prev) => [...prev, goalInput.trim()]);
    setGoalInput("");
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          workspaceId,
          createWorkspace,
          workspaceName,
          brandName,
          websiteUrl,
          industry,
          description,
          productsServices,
          targetAudience,
          brandVoice,
          tone,
          marketingGoals,
          contentPillars,
          suggestedHashtags,
          platforms,
          aiBillingMode,
          byokApiKey,
          planSlug,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(t("customer.text.126"), data.error || t("customer.text.127"), "error");
        return;
      }
      toast(t("customer.text.128"), t("customer.brandReady", { name: brandName }));
      router.push("/app");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <BrandLogo href="/" showByline />
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-bold text-violet-300">
            {t("customer.stepOf", { step: formatNumber(step + 1), total: formatNumber(STEPS.length), title: STEPS[step] })}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Step Pill Navigator */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {STEPS.map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(idx)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                idx === step
                  ? "bg-violet-600 text-white"
                  : idx < step
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "elevated-card text-[var(--text-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Main Card */}
        <div className="surface-card mt-6 rounded-3xl p-6 shadow-2xl sm:p-10">
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{createWorkspace ? t("customer.createWorkspace") : t("customer.configureWorkspace")}</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {createWorkspace
                  ? t("customer.text.135")
                  : t("customer.text.136")}
              </p>
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder={t("customer.text.137")}
                className="elevated-card w-full rounded-2xl px-4 py-3 text-base font-semibold focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{t("customer.text.138")}</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {t("customer.text.139")}
              </p>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={t("customer.text.140")}
                className="elevated-card w-full rounded-2xl px-4 py-3 text-base font-semibold focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-extrabold">{t("customer.text.141")}</h1>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {t("customer.text.142")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={discovering}
                  onClick={runDiscovery}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg disabled:opacity-60"
                >
                  {discovering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {t("customer.text.143")}
                </button>
              </div>

              <div className="relative">
                <Globe className="absolute left-4 top-3.5 h-4 w-4 text-cyan-400" />
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourcompany.com"
                  className="elevated-card w-full rounded-2xl py-3 pl-11 pr-4 text-sm focus:border-violet-500 focus:outline-none"
                />
              </div>

              {initialStrategy && (
                <div className="elevated-card space-y-3 rounded-2xl border border-cyan-500/30 p-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    {t("customer.text.144")}
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                    <strong>{t("customer.text.145")}</strong> {initialStrategy}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {contentPillars.map((p) => (
                      <span
                        key={p}
                        className="rounded-lg bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-300"
                      >
                        {t("customer.text.146")}{" "} {p}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedHashtags.map((h) => (
                      <span
                        key={h}
                        className="rounded-lg bg-cyan-500/15 px-2 py-0.5 text-xs font-medium text-cyan-300"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{t("customer.text.147")}</h1>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="elevated-card w-full rounded-2xl px-4 py-3 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {[
                  "AI & Developer Infrastructure",
                  "B2B SaaS",
                  "E-Commerce & Consumer Brands",
                  "Health, Fitness & Wellness",
                  "Marketing Agency",
                  "FinTech & Financial Services",
                ].map((ind) => (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setIndustry(ind)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${
                      industry === ind ? "bg-violet-600 text-white" : "elevated-card"
                    }`}
                  >
                    {displayLabel(ind)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{t("customer.text.154")}</h1>
              <textarea
                rows={4}
                value={productsServices}
                onChange={(e) => setProductsServices(e.target.value)}
                className="elevated-card w-full rounded-2xl p-4 text-sm"
              />
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("customer.text.155")}
                className="elevated-card w-full rounded-2xl p-4 text-sm"
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{t("customer.text.156")}</h1>
              <textarea
                rows={3}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="elevated-card w-full rounded-2xl p-4 text-sm"
              />
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{t("customer.text.157")}</h1>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  "Innovative & Visionary",
                  "Authoritative & Executive",
                  "Friendly & Conversational",
                  "Educational & Practical",
                  "Bold & Provocative",
                  "Empathetic & Community-First",
                ].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`rounded-2xl p-4 text-left text-xs font-bold transition-all ${
                      tone === t
                        ? "bg-violet-600 text-white shadow-lg"
                        : "elevated-card hover:border-violet-500/40"
                    }`}
                  >
                    {displayLabel(t)}
                  </button>
                ))}
              </div>
              <input
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder={t("customer.text.165")}
                className="elevated-card w-full rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{t("customer.text.166")}</h1>
              <div className="flex gap-2">
                <input
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder={t("customer.text.167")}
                  className="elevated-card flex-1 rounded-xl px-4 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={addGoal}
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white"
                >
                  {t("customer.text.168")}
                </button>
              </div>
              <div className="space-y-2">
                {marketingGoals.map((g, i) => (
                  <div
                    key={`${g}-${i}`}
                    className="elevated-card flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                  >
                    <span>{g}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMarketingGoals((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-xs text-rose-400 hover:underline"
                    >
                      {t("customer.text.169")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">{t("customer.text.170")}</h1>
              <p className="text-xs text-[var(--text-secondary)]">
                {t("customer.text.171")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.values(SOCIAL_PLATFORM_SPECS).map((p) => {
                  const selected = platforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlatform(p.id)}
                      className={`flex items-center justify-between rounded-2xl p-4 text-left text-xs font-bold transition-all ${
                        selected
                          ? "border border-cyan-400 bg-cyan-500/15 text-cyan-200"
                          : "elevated-card text-[var(--text-secondary)]"
                      }`}
                    >
                      <span>{p.name}</span>
                      {selected && <Check className="h-4 w-4 text-cyan-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-5">
              <h1 className="text-2xl font-extrabold">{t("customer.text.174")}</h1>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAiBillingMode("managed")}
                  disabled={!allowedAiModes.includes("managed")}
                  className={`rounded-2xl p-5 text-left transition-all ${
                    aiBillingMode === "managed"
                      ? "border-2 border-cyan-400 bg-cyan-500/10"
                      : "elevated-card"
                  }`}
                >
                  <Cpu className="h-6 w-6 text-cyan-400" />
                  <div className="mt-3 text-base font-extrabold">{t("customer.text.175")}</div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {t("customer.text.176")}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAiBillingMode("byok")}
                  disabled={!allowedAiModes.includes("byok")}
                  className={`rounded-2xl p-5 text-left transition-all ${
                    aiBillingMode === "byok"
                      ? "border-2 border-violet-500 bg-violet-500/10"
                      : "elevated-card"
                  }`}
                >
                  <KeyRound className="h-6 w-6 text-violet-400" />
                  <div className="mt-3 text-base font-extrabold">{t("customer.text.177")}</div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {t("customer.text.178")}
                  </p>
                </button>
              </div>

              {aiBillingMode === "byok" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    {t("customer.text.179")}
                  </label>
                  <input
                    type="password"
                    value={byokApiKey}
                    onChange={(e) => setByokApiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="elevated-card mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {step === 10 && (
            <div className="space-y-5">
              <h1 className="text-2xl font-extrabold">{t("customer.text.180")}</h1>
              <p className="text-sm text-[var(--text-secondary)]">{t("customer.text.181")}{" "} {currentPlan.name} · {formatNumber(currentPlan.maxBrands)} {t("customer.text.182")}{" "} {formatNumber(currentPlan.maxChannels)} {t("customer.text.183")}{" "} {formatNumber(currentPlan.maxPostsPerMonth)} {t("customer.text.184")}{" "} {formatNumber(currentPlan.includedMonthlyCredits)} {t("customer.text.185")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalogPlans.map((plan) => (
                  <button
                    key={plan.slug}
                    type="button"
                    disabled={plan.slug !== "free"}
                    onClick={() => setPlanSlug(plan.slug)}
                    className={`rounded-2xl p-4 text-left transition-all ${
                      planSlug === plan.slug
                        ? "border-2 border-violet-500 bg-violet-500/15"
                        : "elevated-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold">{plan.name}</span>
                      <span className="text-base font-extrabold text-cyan-400">
                        {formatNumber(plan.monthlyPrice, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}{t("customer.text.186")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{plan.tagline}</p>
                    {plan.slug !== "free" && <p className="mt-2 text-xs">{plan.purchasable ? t("customer.text.187") : t("customer.text.188")}</p>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t("customer.text.189")}</p>
            </div>
          )}

          {/* Footer Navigation Controls */}
          <div className="mt-8 flex items-center justify-between border-t border-[var(--border-subtle)] pt-6">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="elevated-card inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> {t("customer.text.190")}
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white"
              >
                {t("customer.text.191")}{" "} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinish}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-7 py-3 text-xs font-bold text-white shadow-lg disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {t("customer.text.192")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
