"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import { createIdempotentFetcher } from "@/lib/idempotent-fetch";
import type { generateCampaignBlueprint } from "@/lib/ai-engine";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import {
  Megaphone,
  Sparkles,
  Loader2,
  Calendar,
  Trash2,
  CheckCircle2,
} from "lucide-react";

interface CampaignDTO {
  id: number;
  name: string;
  description: string;
  objective: string;
  audience: string;
  platforms: string[];
  status: string;
  startDate: string;
  endDate: string;
  strategySummary: string;
  contentThemes: string[];
  weeklyCadence: number;
  isSampleData: boolean;
  linkedPostCount: number;
}

export function CampaignsClient({ campaigns }: { campaigns: CampaignDTO[] }) {
  const { t, formatDate, formatNumber } = useAppLanguage();
  const displayStatus = (value: string) => ["draft","active","paused","completed","archived"].includes(value) ? t(`customer.status.${value}`) : value;

  const router = useRouter();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState("");
  const [objective, setObjective] = useState(t("customer.text.338"));
  const [platforms, setPlatforms] = useState<string[]>(["linkedin", "x", "instagram"]);
  const [generating, setGenerating] = useState(false);
  const [requestAi] = useState(createIdempotentFetcher);
  const [pendingBlueprint, setPendingBlueprint] = useState<{ signature: string; blueprint: Awaited<ReturnType<typeof generateCampaignBlueprint>>["blueprint"] } | null>(null);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleGenerateCampaign = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const signature = JSON.stringify({ prompt, objective, platforms });
      let bp = pendingBlueprint?.signature === signature ? pendingBlueprint.blueprint : null;
      if (!bp) {
      const aiRes = await requestAi("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "campaign",
          prompt,
          objective,
          platforms,
        }),
      });
      const aiData = await aiRes.json();
      if (!aiRes.ok) {
        toast(t("customer.text.339"), aiData.error || t("customer.text.340"), "error");
        return;
      }

      bp = aiData.blueprint;
      if (!bp) throw new Error(t("customer.text.341"));
      setPendingBlueprint({ signature, blueprint: bp });
      }
      const createRes = await requestAi("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: bp.name,
          description: bp.description,
          objective,
          audience: bp.audience,
          platforms,
          strategySummary: bp.strategySummary,
          contentThemes: bp.contentThemes,
          weeklyCadence: bp.weeklyCadence,
          samplePosts: bp.samplePosts,
        }),
      });
      if (createRes.ok) {
        setPendingBlueprint(null);
        toast(
          t("customer.text.342"),
          t("customer.generatedCampaign", { count: formatNumber(bp.samplePosts?.length || 0) })
        );
        router.refresh();
      } else {
        const result = await createRes.json();
        throw new Error(result.error || t("customer.text.343"));
      }
    } catch (error) {
      toast(t("customer.text.344"), error instanceof Error ? error.message : t("customer.text.345"), "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusChange = async (campaignId: number, status: string) => {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", campaignId, status }),
    });
    if (res.ok) {
      toast(t("customer.text.346"), t("customer.statusSet", { status: displayStatus(status) }));
      router.refresh();
    }
  };

  const handleDelete = async (campaignId: number) => {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", campaignId }),
    });
    if (res.ok) {
      toast(t("customer.text.347"));
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      {/* AI Campaign Architect */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex items-center gap-2 text-cyan-400">
          <Sparkles className="h-5 w-5" />
          <h2 className="text-base font-extrabold text-[var(--text-primary)]">
            {t("customer.text.348")}
          </h2>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("customer.text.349")}
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.350")}
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="elevated-card mt-1.5 w-full rounded-2xl p-3 text-xs leading-relaxed"
            />
          </div>

          <div className="space-y-3 lg:col-span-6">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                {t("customer.text.351")}
              </label>
              <input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                {t("customer.text.76")}
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Object.values(SOCIAL_PLATFORM_SPECS).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      platforms.includes(p.id)
                        ? "bg-violet-600 text-white"
                        : "elevated-card text-[var(--text-secondary)]"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={generating}
          onClick={handleGenerateCampaign}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3 text-xs font-extrabold text-white shadow-lg disabled:opacity-60"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Megaphone className="h-4 w-4" />
          )}
          {pendingBlueprint?.signature === JSON.stringify({ prompt, objective, platforms }) ? t("customer.text.354") : t("customer.text.355")}
        </button>
      </div>

      {/* Active & Planned Campaigns */}
      <div className="grid gap-6 md:grid-cols-2">
        {campaigns.map((camp) => (
          <div key={camp.id} className="surface-card flex flex-col justify-between rounded-3xl p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
                  {displayStatus(camp.status)}
                </span>
                {camp.isSampleData && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    {t("customer.text.356")}
                  </span>
                )}
              </div>

              <h3 className="mt-3 text-lg font-extrabold">{camp.name}</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{camp.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                  {camp.startDate && !Number.isNaN(Date.parse(camp.startDate)) ? formatDate(camp.startDate, { dateStyle: "medium", timeZone: "UTC" }) : camp.startDate} → {camp.endDate && !Number.isNaN(Date.parse(camp.endDate)) ? formatDate(camp.endDate, { dateStyle: "medium", timeZone: "UTC" }) : camp.endDate}
                </span>
                <span>• {formatNumber(camp.weeklyCadence)} {t("customer.text.357")}</span>
                <span>• {formatNumber(camp.linkedPostCount)} {t("customer.text.358")}</span>
              </div>

              {camp.strategySummary && (
                <p className="elevated-card mt-4 rounded-2xl p-3.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {camp.strategySummary}
                </p>
              )}

              {camp.contentThemes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {camp.contentThemes.map((t) => (
                    <span
                      key={t}
                      className="rounded-lg bg-violet-500/15 px-2.5 py-1 text-[11px] font-semibold text-violet-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
              <div className="flex gap-1.5">
                {camp.status !== "active" && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(camp.id, "active")}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t("customer.text.359")}
                  </button>
                )}
                {camp.status === "active" && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(camp.id, "paused")}
                    className="elevated-card rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    {t("customer.text.360")}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleDelete(camp.id)}
                className="rounded-xl p-2 text-rose-400 hover:bg-rose-500/10"
                title={t("customer.text.361")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
