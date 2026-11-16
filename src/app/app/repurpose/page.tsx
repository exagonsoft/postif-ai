"use client";

import React, { useState } from "react";
import { createIdempotentFetcher } from "@/lib/idempotent-fetch";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { SOCIAL_PLATFORM_SPECS, SocialPlatformSpec } from "@/lib/social-adapters";
import { PlatformVariant } from "@/db/schema";
import { Repeat, Sparkles, Save, Loader2, ShieldCheck } from "lucide-react";

export default function SmartRepurposePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [sourceType, setSourceType] = useState("Blog Post");
  const [sourceText, setSourceText] = useState("");
  const [tone, setTone] = useState("Authoritative & Insightful");
  const [preserveMeaning, setPreserveMeaning] = useState(true);
  const [avoidRepetition, setAvoidRepetition] = useState(true);
  const [platforms, setPlatforms] = useState<string[]>([
    "linkedin",
    "x",
    "instagram",
    "threads",
  ]);
  const [loading, setLoading] = useState(false);
  const [requestAi] = useState(createIdempotentFetcher);
  const [variants, setVariants] = useState<Record<string, PlatformVariant> | null>(null);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleRepurpose = async () => {
    if (!sourceText.trim() || platforms.length === 0) {
      toast("Missing inputs", "Provide source text and select at least one channel.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await requestAi("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "repurpose",
          sourceType,
          sourceText,
          tone,
          platforms,
          preserveMeaning,
          avoidRepetition,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Repurpose error", data.error || "Could not repurpose content.", "error");
        return;
      }
      setVariants(data.variants);
      toast(
        "Content repurposed!",
        `Generated ${Object.keys(data.variants).length} distinct channel adaptations.`
      );
      router.refresh();
    } catch (error) {
      toast("Repurposing interrupted", error instanceof Error ? error.message : "Retry to resume this request.", "error");
    } finally {
      setLoading(false);
    }
  };

  const saveAllAsDraft = async () => {
    if (!variants) return;
    const primary = variants[platforms[0]];
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        title: `Repurposed ${sourceType}: ${sourceText.slice(0, 42)}...`,
        topic: `Repurposed ${sourceType}`,
        baseContent: primary?.content || sourceText,
        contentType: `Repurposed ${sourceType}`,
        tone,
        status: "draft",
        platforms,
        variants,
      }),
    });
    if (res.ok) {
      toast("Saved to Drafts", "Multi-platform repurposed post saved to your Posts queue.");
      router.push("/app/posts");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Smart Content Repurposing
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Transform blog articles, product descriptions, announcements, or top posts into native
          multi-channel campaigns while preserving brand voice.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="surface-card space-y-5 rounded-3xl p-6 lg:col-span-5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Source Material Type
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                "Blog Post",
                "Product Description",
                "Long-Form Article",
                "Existing Post Refresh",
                "Business Announcement",
              ].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSourceType(type)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                    sourceType === type
                      ? "bg-violet-600 text-white"
                      : "elevated-card text-[var(--text-secondary)]"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Source Text / URL Summary
            </label>
            <textarea
              rows={7}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              className="elevated-card mt-1.5 w-full rounded-2xl p-4 text-xs leading-relaxed"
            />
          </div>

          <div className="space-y-2.5 rounded-2xl border border-[var(--border-subtle)] p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
              <ShieldCheck className="h-4 w-4" /> Semantic & Voice Guardrails
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={preserveMeaning}
                onChange={(e) => setPreserveMeaning(e.target.checked)}
                className="accent-violet-600"
              />
              Preserve factual metrics & core thesis
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={avoidRepetition}
                onChange={(e) => setAvoidRepetition(e.target.checked)}
                className="accent-violet-600"
              />
              Vary hooks & angle per platform to avoid duplicate copy
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Target Channels
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.values(SOCIAL_PLATFORM_SPECS).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                    platforms.includes(p.id)
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
            disabled={loading}
            onClick={handleRepurpose}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3.5 text-sm font-extrabold text-white shadow-lg disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
            Repurpose Across Selected Channels
          </button>
        </div>

        <div className="space-y-4 lg:col-span-7">
          {!variants ? (
            <div className="surface-card flex h-full min-h-[380px] flex-col items-center justify-center rounded-3xl p-8 text-center">
              <Sparkles className="h-10 w-10 text-violet-400" />
              <h2 className="mt-4 text-lg font-extrabold">Ready to Multiply Your Content</h2>
              <p className="mt-1 max-w-md text-xs text-[var(--text-secondary)]">
                Paste any long-form article, changelog, or product description on the left and
                generate distinct platform-native posts in one click.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold">
                  Generated Channel Adaptations ({Object.keys(variants).length})
                </h2>
                <button
                  type="button"
                  onClick={saveAllAsDraft}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white"
                >
                  <Save className="h-3.5 w-3.5" /> Save Multi-Platform Draft
                </button>
              </div>

              {Object.entries(variants).map(([platId, v]) => {
                const spec = SOCIAL_PLATFORM_SPECS[platId as SocialPlatformSpec["id"]];
                return (
                  <div key={platId} className="surface-card rounded-3xl p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase text-cyan-400">
                        {spec?.name || platId} • {v.formatLabel}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {v.content.length} chars
                      </span>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                      {v.content}
                    </pre>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
