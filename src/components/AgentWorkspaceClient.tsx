"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "./ToastProvider";
import { PulseStatusDot, SPRING_SNAPPY } from "./MotionPrimitives";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import { WeeklyPlanSlot } from "@/db/schema";
import {
  Bot,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
} from "lucide-react";

interface AgentConfigDTO {
  id: number;
  mode: string;
  isPaused: boolean;
  maxPostsPerWeek: number;
  allowedPlatforms: string[];
  requireApprovalForPromotions: boolean;
  objectives: string[];
  currentStrategy: string;
  weeklyPlan: WeeklyPlanSlot[];
}

interface AgentActionDTO {
  id: number;
  actionType: string;
  title: string;
  description: string;
  reasoning: string;
  status: string;
  targetPostId: number | null;
  createdAt: string;
}

export function AgentWorkspaceClient({
  config,
  actions,
}: {
  config: AgentConfigDTO;
  actions: AgentActionDTO[];
}) {
  const { t, locale, formatNumber } = useAppLanguage();
  const displayStatus = (value: string) => ["draft","pending_approval","waiting_media","media_failed","approved","scheduled","publishing","published","failed","cancelled","paused","proposed","rejected","executed","completed","manual","assisted","autopilot","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].includes(value) ? t(`customer.status.${value}`) : value;

  const router = useRouter();
  const { toast } = useToast();

  const [mode, setMode] = useState(config.mode);
  const [maxPostsPerWeek, setMaxPostsPerWeek] = useState(config.maxPostsPerWeek);
  const [allowedPlatforms, setAllowedPlatforms] = useState<string[]>(config.allowedPlatforms);
  const [strategy, setStrategy] = useState(config.currentStrategy);
  const [saving, setSaving] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const planRequestKey = React.useRef<string | null>(null);

  const toggleAllowedPlatform = (id: string) => {
    setAllowedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSaveRules = async (overrideMode?: string) => {
    const targetMode = overrideMode || mode;
    setSaving(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          mode: targetMode,
          maxPostsPerWeek,
          allowedPlatforms,
          requireApprovalForPromotions: true,
          currentStrategy: strategy,
          recurringEnabled: targetMode === "autopilot",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(t("customer.text.193"), data.error || t("customer.text.194"), "error");
        return;
      }
      setMode(targetMode);
      planRequestKey.current = null;
      toast(
        t("customer.text.195"),
        t("customer.agentOperating", { mode: displayStatus(targetMode).toLocaleUpperCase(locale) })
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_pause" }),
    });
    if (res.ok) {
      toast(
        config.isPaused ? t("customer.text.196") : t("customer.text.197"),
        config.isPaused
          ? t("customer.text.198")
          : t("customer.text.199")
      );
      router.refresh();
    } else {
      const data = await res.json();
      toast(t("customer.text.200"), data.error || t("customer.text.201"), "error");
    }
  };

  const handleRegeneratePlan = async () => {
    setGeneratingPlan(true);
    planRequestKey.current ||= crypto.randomUUID();
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_plan", requestKey: planRequestKey.current }),
      });
      if (res.ok) {
        planRequestKey.current = null;
        toast(
          t("customer.text.202"),
          t("customer.text.203")
        );
        router.refresh();
      } else {
        const data = await res.json();
        toast(t("customer.text.204"), data.error || t("customer.text.205"), "error");
      }
    } catch {
      toast(t("customer.text.206"), t("customer.text.207"), "error");
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleResolveProposal = async (
    actionId: number,
    decision: "approved" | "rejected"
  ) => {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve_proposal", actionId, decision }),
    });
    if (res.ok) {
      toast(
        decision === "approved" ? t("customer.text.208") : t("customer.text.209"),
        t("customer.text.210")
      );
      router.refresh();
    } else {
      const data = await res.json();
      toast(t("customer.text.211"), data.error || t("customer.text.212"), "error");
    }
  };

  const proposedActions = actions.filter((a) => a.status === "proposed");

  return (
    <div className="space-y-8">
      {/* Top Status & Pause Kill-Switch Banner */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-lg">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold">{t("customer.text.213")}</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                  config.isPaused
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                <PulseStatusDot color={config.isPaused ? "amber" : "emerald"} />
                {config.isPaused ? t("customer.text.214") : t("customer.modeActive", { mode: displayStatus(mode) })}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {t("customer.agentLimits", { posts: formatNumber(maxPostsPerWeek), channels: formatNumber(allowedPlatforms.length) })}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTogglePause}
          className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-extrabold transition-all ${
            config.isPaused
              ? "bg-emerald-500 text-slate-950 shadow-lg"
              : "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30"
          }`}
        >
          {config.isPaused ? (
            <>
              <PlayCircle className="h-4 w-4" /> {t("customer.text.218")}
            </>
          ) : (
            <>
              <PauseCircle className="h-4 w-4" /> {t("customer.text.219")}
            </>
          )}
        </button>
      </div>

      {/* 3 Automation Modes */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            id: "manual",
            title: t("customer.text.220"),
            desc: t("customer.text.221"),
          },
          {
            id: "assisted",
            title: t("customer.text.222"),
            desc: t("customer.text.223"),
          },
          {
            id: "autopilot",
            title: t("customer.text.224"),
            desc: t("customer.text.225"),
          },
        ].map((m) => {
          const active = mode === m.id;
          return (
            <motion.button
              key={m.id}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.99 }}
              transition={SPRING_SNAPPY}
              type="button"
              disabled={saving}
              onClick={() => handleSaveRules(m.id)}
              className={`relative rounded-3xl p-6 text-left transition-colors ${
                active
                  ? "border-2 border-violet-500 bg-violet-500/10 shadow-xl"
                  : "surface-card hover:border-violet-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-extrabold">{m.title}</span>
                {active ? (
                  <motion.span
                    layoutId="agentModeSelectedBadge"
                    transition={SPRING_SNAPPY}
                    className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white"
                  >
                    {t("customer.text.227")}
                  </motion.span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                {m.desc}
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Approval Inbox + Weekly Content Plan */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Approval Inbox */}
        <div className="surface-card space-y-4 rounded-3xl p-6 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold">
              {t("customer.text.228")}{formatNumber(proposedActions.length)})
            </h3>
            <span className="text-[11px] font-semibold text-cyan-400">{t("customer.text.229")}</span>
          </div>

          <AnimatePresence initial={false}>
            {proposedActions.length === 0 ? (
              <motion.div
                key="empty-proposals"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="elevated-card rounded-2xl p-6 text-center text-xs text-[var(--text-secondary)]"
              >
                {t("customer.text.230")}
              </motion.div>
            ) : (
              proposedActions.map((act) => (
                <motion.div
                  key={act.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={SPRING_SNAPPY}
                  className="elevated-card space-y-3 rounded-2xl p-4"
                >
                  <div className="text-xs font-extrabold">{act.title}</div>
                  <p className="text-xs text-[var(--text-secondary)]">{act.description}</p>
                  {act.reasoning && (
                    <div className="rounded-xl bg-violet-500/10 p-2.5 text-[11px] text-violet-300">
                      <strong>{t("customer.text.231")}</strong> {act.reasoning}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleResolveProposal(act.id, "approved")}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-slate-950"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> {t("customer.text.232")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveProposal(act.id, "rejected")}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300"
                    >
                      <XCircle className="h-3.5 w-3.5" /> {t("customer.text.233")}
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Weekly Content Plan */}
        <div className="surface-card space-y-4 rounded-3xl p-6 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold">{t("customer.text.234")}</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {t("customer.text.235")}
              </p>
            </div>
            <button
              type="button"
              disabled={generatingPlan}
              onClick={handleRegeneratePlan}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-xs font-bold text-white"
            >
              {generatingPlan ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t("customer.text.236")}
            </button>
          </div>

          <div className="space-y-2.5">
            {config.weeklyPlan.map((slot, idx) => (
              <div
                key={`${displayStatus(slot.day)}-${idx}`}
                className="elevated-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-cyan-400">{displayStatus(slot.day)}</span>
                    <span className="rounded bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-300">
                      {slot.platform}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                      {slot.pillar}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium">{slot.concept}</p>
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                  {displayStatus(slot.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategy & Safety Guardrails Configuration */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="surface-card space-y-4 rounded-3xl p-6 lg:col-span-7">
          <h3 className="text-base font-extrabold">{t("customer.text.237")}</h3>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.238")}
            </label>
            <textarea
              rows={3}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="elevated-card mt-1.5 w-full rounded-2xl p-3.5 text-xs leading-relaxed"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                {t("customer.text.239")}
              </label>
              <input
                type="number"
                min={1}
                max={28}
                value={maxPostsPerWeek}
                onChange={(e) => setMaxPostsPerWeek(Number(e.target.value))}
                className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2 text-sm font-bold"
              />
            </div>

            <div className="flex items-end">
              <label className="elevated-card flex w-full items-center gap-2.5 rounded-xl p-3 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="accent-violet-600"
                />
                {t("customer.text.240")}
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.241")}
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.values(SOCIAL_PLATFORM_SPECS).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleAllowedPlatform(p.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                    allowedPlatforms.includes(p.id)
                      ? "bg-cyan-500 text-slate-950"
                      : "elevated-card text-[var(--text-secondary)]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveRules()}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white"
          >
            <Save className="h-3.5 w-3.5" /> {t("customer.text.243")}
          </button>
        </div>

        {/* Non-Negotiable Safety Boundaries + Audit History */}
        <div className="surface-card space-y-4 rounded-3xl p-6 lg:col-span-5">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-base font-extrabold text-[var(--text-primary)]">
              {t("customer.text.244")}
            </h3>
          </div>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
            <li>{t("customer.text.245")}</li>
            <li>{t("customer.text.246")}{formatNumber(maxPostsPerWeek)}{t("customer.text.247")}</li>
            <li>{t("customer.text.248")}</li>
            <li>{t("customer.text.249")}</li>
            <li>{t("customer.text.250")}</li>
          </ul>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t("customer.text.251")}
            </div>
            <div className="mt-2.5 max-h-48 space-y-2 overflow-y-auto">
              {actions.map((a) => (
                <div key={a.id} className="elevated-card rounded-xl p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{a.title}</span>
                    <span className="text-[10px] uppercase text-cyan-400">{displayStatus(a.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
