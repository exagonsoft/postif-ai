"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { FadeInUp, PulseStatusDot, SPRING_SNAPPY } from "./MotionPrimitives";
import {
  Sparkles,
  Bot,
  Calendar,
  BarChart3,
  Check,
  ChevronDown,
  ArrowRight,
  Layers,
  Shield,
  Zap,
} from "lucide-react";

const DEMO_TOPICS: Record<
  string,
  {
    linkedin: string;
    x: string;
    instagram: string;
    tiktok: string;
  }
> = {
  "Product Launch": {
    linkedin:
      "We spent 6 months rebuilding how engineering teams deploy AI workloads.\n\nToday, Edge Inference v2.4 goes live:\n• 17.4ms median response time across 14 global regions\n• 61% lower idle GPU spend\n• Zero-config failover routing\n\nExplore the reproducible benchmark report in the comments.",
    x: "Edge Inference v2.4 is officially live 🚀\n\n• 17.4ms median TTFT across 14 regions\n• 61% less idle GPU spend\n• Automatic model failover\n\nDeploy your first cluster in 60 seconds 👇",
    instagram:
      "✨ INTRODUCING EDGE INFERENCE v2.4\n\nFaster responses. Lower cloud bills. Zero cold-start headaches.\n\nSwipe through to see how modern AI teams ship globally in under 60 seconds.\n\n💾 Save this post for your next architecture review!",
    tiktok:
      "[HOOK 0:00] POV: Your AI app takes 4 seconds to respond during peak traffic.\n[DEMO 0:04] Watch Edge Inference v2.4 stream tokens in 17 milliseconds.\n[CTA 0:18] Link in bio to test free with $100 credits.",
  },
  "Educational Thread": {
    linkedin:
      "5 automated CI/CD checks every AI team should run before merging to production:\n\n1. Prompt regression scoring\n2. Token budget guardrails\n3. p95 latency threshold checks\n4. PII redaction verification\n5. Multi-provider failover tests\n\nWhich gate has saved your team most recently?",
    x: "5 automated CI/CD gates every AI team needs before merging to main:\n\n1. Prompt regression evals\n2. Token budget caps\n3. p95 latency checks\n4. PII redaction tests\n5. Provider failover simulation\n\nAutomate quality before users notice.",
    instagram:
      "🚀 5 AUTOMATED CHECKS BEFORE EVERY AI RELEASE\n\nStop shipping blind prompt changes to production. Use this 5-point engineering checklist to keep latency low and reliability at 99.99%.\n\n👇 Drop a 🔥 if you want the YAML template!",
    tiktok:
      "[HOOK 0:00] Stop pushing prompt edits straight to production!\n[VALUE 0:04] Here are the 5 automated gates top AI teams run on every single pull request.\n[CTA 0:20] Follow for daily engineering playbooks.",
  },
  "Customer Case Study": {
    linkedin:
      "Case Study: How PayPulse cut monthly AI inference costs by 48% without sacrificing accuracy.\n\nBy routing 72% of routine classification prompts to specialized small models and reserving frontier models for deep reasoning, they saved $34,000/month while doubling speed.",
    x: "Stop sending simple classification prompts to massive frontier models.\n\nSmart intent routing saved one Series B fintech $34k/mo while cutting latency in half.",
    instagram:
      "📉 HOW PAYPULSE CUT AI CLOUD COSTS BY 48%\n\nSwipe to see the exact routing architecture that saved $34,000/month and doubled response times.\n\n💾 Save for your Q2 optimization sprint!",
    tiktok:
      "[HOOK 0:00] This one routing tweak saved a startup $34,000 every single month.\n[EXPLAIN 0:05] Instead of sending every prompt to a giant model, route simple tasks in 4ms.\n[CTA 0:21] Try smart routing free today.",
  },
};

const FAQS = [
  {
    q: "What is the difference between BYOK and Managed AI?",
    a: "With Bring Your Own Key (BYOK), you connect your own OpenAI API key (stored encrypted with AES-256-GCM) and pay OpenAI directly for token usage while paying POSTIF-AI only for platform subscriptions. With Managed AI, POSTIF-AI provides built-in OpenAI access with monthly AI credits—zero API key configuration required.",
  },
  {
    q: "How does the Autonomous AI Marketing Agent stay within safe boundaries?",
    a: "You choose between Manual, Assisted, and Autopilot modes. Even in Autopilot Mode, the agent enforces strict guardrails: weekly post caps, approved channel allowlists, mandatory human approval for promotional offers, an instant Pause Autopilot kill-switch, and immutable audit logs for every action.",
  },
  {
    q: "Which social platforms does POSTIF-AI support?",
    a: "POSTIF-AI includes native platform adapters and tailored formatting engines for LinkedIn, X (Twitter), Instagram Business, Facebook Pages, TikTok, Pinterest, YouTube, and Threads. In local demonstration environments without live OAuth secrets, adapters run in a clearly labeled Simulated Sandbox mode.",
  },
  {
    q: "Can agencies manage multiple client brands with separate approval workflows?",
    a: "Yes. POSTIF-AI supports multi-tenant workspaces, brand-isolated calendars and social accounts, and role-based permissions (Owner, Administrator, Editor, Approver, and Viewer) so clients or managers can approve posts before scheduling.",
  },
];

export function LandingInteractive() {
  const [selectedTopic, setSelectedTopic] = useState<string>("Product Launch");
  const [selectedPlatform, setSelectedPlatform] = useState<
    "linkedin" | "x" | "instagram" | "tiktok"
  >("linkedin");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const previewCopy =
    DEMO_TOPICS[selectedTopic]?.[selectedPlatform] ||
    DEMO_TOPICS["Product Launch"].linkedin;

  return (
    <>
      {/* Interactive Product Demonstration Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <FadeInUp className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400">
            <Sparkles className="h-3.5 w-3.5" />
            Interactive Multi-Platform Adaptation Demo
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            One Topic. Natively Crafted for Every Algorithm.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)]">
            Click a campaign topic and switch channels below to inspect how POSTIF-AI adapts
            structure, hooks, length, and formatting per social network.
          </p>
        </FadeInUp>

        <FadeInUp delay={0.1} className="surface-card mt-10 rounded-3xl p-6 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                1. Choose Topic:
              </span>
              {Object.keys(DEMO_TOPICS).map((topic) => {
                const isSelected = selectedTopic === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setSelectedTopic(topic)}
                    className={`relative rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                      isSelected
                        ? "text-white"
                        : "elevated-card text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="landingTopicPill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-xl bg-violet-600 shadow-lg shadow-violet-600/25"
                      />
                    )}
                    <span className="relative z-10">{topic}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                2. Channel:
              </span>
              {(
                [
                  { id: "linkedin", label: "LinkedIn" },
                  { id: "x", label: "X (Twitter)" },
                  { id: "instagram", label: "Instagram" },
                  { id: "tiktok", label: "TikTok Script" },
                ] as const
              ).map((ch) => {
                const isSelected = selectedPlatform === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedPlatform(ch.id)}
                    className={`relative rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                      isSelected
                        ? "text-slate-950"
                        : "elevated-card text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="landingChannelPill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-xl bg-cyan-500 shadow-lg shadow-cyan-500/25"
                      />
                    )}
                    <span className="relative z-10">{ch.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="elevated-card rounded-2xl p-5 lg:col-span-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
                  Brand Context Input
                </span>
                <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                  NebulaCloud AI
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold">{selectedTopic}</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                Voice: Technical, crisp, outcome-driven. Target Audience: CTOs, AI Engineers, and
                Growth Leaders.
              </p>
              <div className="mt-5 space-y-2 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  Platform character limits & hook style applied
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  Hashtags & CTA tailored to channel intent
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  Ready for 1-click scheduling or approval queue
                </div>
              </div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/app/studio"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-600/20"
                >
                  Open Full AI Content Studio <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            </div>

            <div className="elevated-card rounded-2xl p-6 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-cyan-500 text-xs font-bold text-white">
                    NC
                  </div>
                  <div>
                    <div className="text-sm font-bold">NebulaCloud AI</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Optimized for {selectedPlatform.toUpperCase()} • {previewCopy.length} chars
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                  <PulseStatusDot color="emerald" />
                  AI Variant Ready
                </span>
              </div>
              <AnimatePresence mode="wait">
                <motion.pre
                  key={`${selectedTopic}-${selectedPlatform}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-primary)]"
                >
                  {previewCopy}
                </motion.pre>
              </AnimatePresence>
            </div>
          </div>
        </FadeInUp>
      </section>

      {/* FAQ Accordion */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <FadeInUp className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">Frequently Asked Questions</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Clear answers on autonomous workflows, OpenAI BYOK security, and social integrations.
          </p>
        </FadeInUp>

        <div className="mt-10 space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={faq.q} className="surface-card overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-semibold sm:text-base"
                >
                  <span>{faq.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="shrink-0"
                  >
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--border-subtle)] px-6 py-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function HeroDashboardPreview() {
  const [tab, setTab] = useState<"agent" | "calendar" | "analytics">("agent");

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="surface-card relative mx-auto mt-14 max-w-5xl overflow-hidden rounded-3xl p-2 shadow-2xl shadow-violet-950/50"
    >
      <div className="rounded-2xl bg-[#070b17] p-4 sm:p-6">
        {/* Top Window Chrome */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500/80" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
            <span className="ml-2 inline-flex items-center gap-2 text-xs font-medium text-slate-400">
              <PulseStatusDot color="cyan" />
              app.postif-ai.io — NebulaCloud AI Workspace
            </span>
          </div>

          <div className="flex gap-1.5 rounded-xl bg-slate-900 p-1">
            {(
              [
                { id: "agent", label: "AI Agent", icon: Bot },
                { id: "calendar", label: "Schedule Queue", icon: Calendar },
                { id: "analytics", label: "Performance", icon: BarChart3 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isSelected = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isSelected ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="heroPreviewTabPill"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-lg bg-violet-600"
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5" />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview Content */}
        <AnimatePresence mode="wait">
          {tab === "agent" && (
            <motion.div
              key="agent"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="mt-5 grid gap-4 md:grid-cols-3"
            >
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-400">AUTONOMOUS AGENT</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    <PulseStatusDot color="emerald" />
                    ASSISTED ACTIVE
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-white">5 Posts Planned This Week</p>
                <p className="mt-1 text-xs text-slate-400">
                  Guardrails: Max 7/wk • Approved channels: LinkedIn, X, Instagram
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left">
                <span className="text-xs font-semibold text-violet-400">DUAL AI BILLING</span>
                <p className="mt-2 text-lg font-bold text-white">842 Managed Credits</p>
                <p className="mt-1 text-xs text-slate-400">
                  Or switch to BYOK OpenAI Vault anytime with zero markup
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left">
                <span className="text-xs font-semibold text-emerald-400">PUBLISHING RELIABILITY</span>
                <p className="mt-2 text-lg font-bold text-white">99.4% Job Success</p>
                <p className="mt-1 text-xs text-slate-400">
                  Idempotent PostgreSQL queue with automatic retry policies
                </p>
              </div>
            </motion.div>
          )}

          {tab === "calendar" && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="mt-5 space-y-2.5"
            >
              {[
                {
                  time: "Tue • 10:00 AM EST",
                  title: "5-Step Autonomous CI/CD Checklist for AI Apps",
                  channels: "LinkedIn • X • Instagram",
                  status: "Scheduled",
                },
                {
                  time: "Wed • 02:30 PM EST",
                  title: "How FinTech Scaleup Cut Inference Spend by 48%",
                  channels: "LinkedIn • X",
                  status: "Pending Approval",
                },
                {
                  time: "Fri • 11:00 AM EST",
                  title: "Weekend Developer Build Challenge",
                  channels: "X • Threads",
                  status: "Draft",
                },
              ].map((row) => (
                <div
                  key={row.title}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-xs font-semibold text-cyan-400">{row.time}</div>
                    <div className="text-sm font-bold text-white">{row.title}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{row.channels}</span>
                    <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {tab === "analytics" && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="mt-5 grid gap-4 sm:grid-cols-4"
            >
              {[
                { label: "30-Day Reach (Sample)", value: "148.2K", delta: "+24.6%" },
                { label: "Engagement Rate", value: "4.82%", delta: "+0.9%" },
                { label: "Outbound Clicks", value: "3,410", delta: "+31.2%" },
                { label: "Audience Growth", value: "+2,190", delta: "+18.4%" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left"
                >
                  <div className="text-xs text-slate-400">{stat.label}</div>
                  <div className="mt-1.5 text-2xl font-extrabold text-white">{stat.value}</div>
                  <div className="mt-1 text-xs font-semibold text-emerald-400">{stat.delta} vs prior</div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-violet-400" /> 8 Social Adapters
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-cyan-400" /> RBAC & Client Approvals
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" /> OpenAI GPT-4o / o3-mini Ready
            </span>
          </div>
          <Link href="/app" className="font-semibold text-cyan-400 hover:underline">
            Launch Interactive Workspace →
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
