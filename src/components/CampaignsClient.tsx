"use client";

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
  const router = useRouter();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState("");
  const [objective, setObjective] = useState("Product Launch & Qualified Signups");
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
        toast("Campaign AI error", aiData.error || "Could not generate blueprint.", "error");
        return;
      }

      bp = aiData.blueprint;
      if (!bp) throw new Error("The generated campaign was empty.");
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
          "4-Week Campaign Created!",
          `Generated strategy themes and ${bp.samplePosts?.length || 0} starter draft posts.`
        );
        router.refresh();
      } else {
        const result = await createRes.json();
        throw new Error(result.error || "Generated campaign could not be saved. Retry to save without another AI request.");
      }
    } catch (error) {
      toast("Campaign request failed", error instanceof Error ? error.message : "Try again to resume the same request.", "error");
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
      toast("Campaign updated", `Status set to ${status}.`);
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
      toast("Campaign deleted");
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
            AI Campaign Architect
          </h2>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Describe your campaign goal and POSTIF-AI will propose content themes, weekly cadence,
          messaging strategy, and starter draft posts.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              Campaign Brief
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
                Primary Objective
              </label>
              <input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                Target Channels
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
          {pendingBlueprint?.signature === JSON.stringify({ prompt, objective, platforms }) ? "Retry Saving Generated Campaign" : "Generate 4-Week Campaign & Starter Posts"}
        </button>
      </div>

      {/* Active & Planned Campaigns */}
      <div className="grid gap-6 md:grid-cols-2">
        {campaigns.map((camp) => (
          <div key={camp.id} className="surface-card flex flex-col justify-between rounded-3xl p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
                  {camp.status}
                </span>
                {camp.isSampleData && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    Sample Campaign
                  </span>
                )}
              </div>

              <h3 className="mt-3 text-lg font-extrabold">{camp.name}</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{camp.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                  {camp.startDate} → {camp.endDate}
                </span>
                <span>• {camp.weeklyCadence} posts/wk</span>
                <span>• {camp.linkedPostCount} linked post(s)</span>
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
                    <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                  </button>
                )}
                {camp.status === "active" && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(camp.id, "paused")}
                    className="elevated-card rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    Pause
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleDelete(camp.id)}
                className="rounded-xl p-2 text-rose-400 hover:bg-rose-500/10"
                title="Delete campaign"
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
