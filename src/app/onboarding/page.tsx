"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/components/ToastProvider";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
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

const STEPS = [
  "1. Workspace",
  "2. Brand Name",
  "3. Website & AI Discovery",
  "4. Industry",
  "5. Products & Services",
  "6. Target Audience",
  "7. Communication Tone",
  "8. Marketing Goals",
  "9. Social Channels",
  "10. AI Billing Mode",
  "11. Subscription Plan",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [discovering, setDiscovering] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [workspaceName, setWorkspaceName] = useState("Hyperion Labs");
  const [brandName, setBrandName] = useState("Hyperion Labs");
  const [websiteUrl, setWebsiteUrl] = useState("https://hyperionlabs.example.com");
  const [industry, setIndustry] = useState("AI Developer Tools & Cloud");
  const [description, setDescription] = useState(
    "Hyperion Labs provides real-time observability and automated reliability workflows for cloud-native engineering teams."
  );
  const [productsServices, setProductsServices] = useState(
    "Hyperion Trace Engine, Autonomous Incident Copilot, Latency Telemetry SDK"
  );
  const [targetAudience, setTargetAudience] = useState(
    "VPs of Engineering, Staff SREs, DevOps Architects, Technical Founders"
  );
  const [brandVoice, setBrandVoice] = useState("Crisp, authoritative, engineering-led");
  const [tone, setTone] = useState("Innovative & Visionary");
  const [marketingGoals, setMarketingGoals] = useState<string[]>([
    "Increase developer trial signups",
    "Establish LinkedIn & X thought leadership",
    "Automate weekly educational distribution",
  ]);
  const [goalInput, setGoalInput] = useState("");
  const [contentPillars, setContentPillars] = useState<string[]>([
    "Observability Benchmarks",
    "Incident Post-Mortem Playbooks",
    "Product Deep-Dives",
  ]);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([
    "#HyperionLabs",
    "#DevOps",
    "#CloudNative",
    "#AIAutomation",
  ]);
  const [initialStrategy, setInitialStrategy] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin", "x", "instagram"]);
  const [aiBillingMode, setAiBillingMode] = useState<"managed" | "byok">("managed");
  const [byokApiKey, setByokApiKey] = useState("");
  const [planSlug, setPlanSlug] = useState<string>("pro_ai");

  const runDiscovery = async () => {
    setDiscovering(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          brandName,
          websiteUrl,
          notes: productsServices,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Brand discovery notice", data.error || "Using editable defaults.", "error");
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
        "AI Brand Discovery complete",
        `Extracted brand pillars, voice & hashtags (${data.meta?.executionSource}). Review below.`
      );
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
        toast("Setup error", data.error || "Could not finalize workspace.", "error");
        return;
      }
      toast("Workspace provisioned!", `${brandName} is ready in your POSTIF-AI Command Center.`);
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
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
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
              <h1 className="text-2xl font-extrabold">1. Create Your Workspace</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Workspaces isolate your brands, team roles, social tokens, and AI billing settings.
              </p>
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g., Hyperion Labs"
                className="elevated-card w-full rounded-2xl px-4 py-3 text-base font-semibold focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">2. Enter Company or Brand Name</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                You can add additional client or sub-brands anytime from Brands & Workspaces.
              </p>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g., Hyperion Labs"
                className="elevated-card w-full rounded-2xl px-4 py-3 text-base font-semibold focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-extrabold">3. Website URL & AI Brand Discovery</h1>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Let POSTIF-AI analyze your brand profile and propose content pillars, audience
                    segments, voice, and hashtags for your review.
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
                  Run AI Brand Discovery
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
                    AI Proposed Brand Intelligence (Review & Approve)
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                    <strong>Initial Strategy:</strong> {initialStrategy}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {contentPillars.map((p) => (
                      <span
                        key={p}
                        className="rounded-lg bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-300"
                      >
                        Pillar: {p}
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
              <h1 className="text-2xl font-extrabold">4. Select Industry</h1>
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
                    {ind}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">5. Describe Products or Services</h1>
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
                placeholder="Company positioning summary"
                className="elevated-card w-full rounded-2xl p-4 text-sm"
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">6. Define Target Audience</h1>
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
              <h1 className="text-2xl font-extrabold">7. Choose Communication Tone & Voice</h1>
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
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="Custom brand voice notes"
                className="elevated-card w-full rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">8. Select Marketing Goals</h1>
              <div className="flex gap-2">
                <input
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Add a custom goal..."
                  className="elevated-card flex-1 rounded-xl px-4 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={addGoal}
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white"
                >
                  Add
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
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold">9. Connect Social Media Channels</h1>
              <p className="text-xs text-[var(--text-secondary)]">
                Select channels to initialize in your workspace (provisioned via Simulated Sandbox
                Adapters unless live OAuth credentials are configured).
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
              <h1 className="text-2xl font-extrabold">10. Select BYOK or Managed AI</h1>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAiBillingMode("managed")}
                  className={`rounded-2xl p-5 text-left transition-all ${
                    aiBillingMode === "managed"
                      ? "border-2 border-cyan-400 bg-cyan-500/10"
                      : "elevated-card"
                  }`}
                >
                  <Cpu className="h-6 w-6 text-cyan-400" />
                  <div className="mt-3 text-base font-extrabold">Managed AI Credits</div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Built-in OpenAI models with monthly credits included. Zero setup required.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAiBillingMode("byok")}
                  className={`rounded-2xl p-5 text-left transition-all ${
                    aiBillingMode === "byok"
                      ? "border-2 border-violet-500 bg-violet-500/10"
                      : "elevated-card"
                  }`}
                >
                  <KeyRound className="h-6 w-6 text-violet-400" />
                  <div className="mt-3 text-base font-extrabold">Bring Your Own Key (BYOK)</div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Supply your OpenAI API key (`sk-...`). Stored encrypted with AES-256-GCM.
                  </p>
                </button>
              </div>

              {aiBillingMode === "byok" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Optional OpenAI API Key (can also be added later in Billing & AI)
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
              <h1 className="text-2xl font-extrabold">11. Select Subscription Plan</h1>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.values(SUBSCRIPTION_PLANS).map((plan) => (
                  <button
                    key={plan.slug}
                    type="button"
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
                        ${plan.monthlyPrice}/mo
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{plan.tagline}</p>
                  </button>
                ))}
              </div>
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
              <ArrowLeft className="h-4 w-4" /> Previous
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white"
              >
                Next Step <ArrowRight className="h-4 w-4" />
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
                Launch My Workspace
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
