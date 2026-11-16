"use client";

import React, { useState } from "react";
import { createIdempotentFetcher } from "@/lib/idempotent-fetch";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "./ToastProvider";
import { PulseStatusDot, SPRING_SNAPPY } from "./MotionPrimitives";
import { SOCIAL_PLATFORM_SPECS, SocialPlatformSpec } from "@/lib/social-adapters";
import { PlatformVariant } from "@/db/schema";
import { PostMediaPicker, MediaPreview, PostMedia } from "./PostMediaPicker";
import { formatScheduleInput, scheduleToISO } from "@/lib/schedule-time";
import { AutomaticMediaSettings, AutomaticMedia } from "./AutomaticMediaSettings";
import {
  Wand2,
  Sparkles,
  RefreshCw,
  Scissors,
  Maximize2,
  Languages,
  Hash,
  MousePointerClick,
  Save,
  Send,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Heart,
  MessageCircle,
  Repeat2,
  Share,
} from "lucide-react";

interface BrandOption {
  id: number;
  name: string;
  tone: string;
  targetAudience: string;
  suggestedHashtags: string[];
}

export function ContentStudioClient({
  brands,
  defaultBrandId,
  isTeamWorkspace,
  memberRole,
}: {
  brands: BrandOption[];
  defaultBrandId: number;
  isTeamWorkspace: boolean;
  memberRole: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const initialBrand = brands.find((b) => b.id === defaultBrandId) || brands[0];

  const [brandId, setBrandId] = useState<number>(initialBrand?.id || 0);
  const [mediaIds, setMediaIds] = useState<number[]>([]);
  const [mediaAssets, setMediaAssets] = useState<PostMedia[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(isTeamWorkspace);
  const teamReviewRequired = isTeamWorkspace && !["owner", "admin", "approver"].includes(memberRole);
  const [notifyOnPublish, setNotifyOnPublish] = useState(true);
  const [automaticMedia, setAutomaticMedia] = useState<AutomaticMedia>(null);
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [objective, setObjective] = useState("Audience Engagement");
  const [audience, setAudience] = useState(
    initialBrand?.targetAudience || ""
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [tone, setTone] = useState(initialBrand?.tone || "Professional");
  const [language, setLanguage] = useState("English");
  const [contentType, setContentType] = useState("Educational Post");
  const [length, setLength] = useState("Medium");
  const [keywords, setKeywords] = useState(initialBrand?.suggestedHashtags.join(", ") || "");
  const [cta, setCta] = useState("");

  const [activeTab, setActiveTab] = useState<string>("linkedin");
  const [variants, setVariants] = useState<Record<string, PlatformVariant>>({});

  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    return formatScheduleInput(d, timezone);
  });

  const [generating, setGenerating] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastExecutionBadge, setLastExecutionBadge] = useState<string>("");
  const [requestAi] = useState(createIdempotentFetcher);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      if (next.length > 0 && !next.includes(activeTab)) {
        setActiveTab(next[0]);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !prompt.trim()) {
      toast("Add a topic or idea", "Describe what the post should be about.", "error");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast("Select at least one channel", "Choose one or more target platforms.", "error");
      return;
    }
    setGenerating(true);
    try {
      const brandObj = brands.find((b) => b.id === brandId);
      const res = await requestAi("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          brandName: brandObj?.name || "Brand",
          topic,
          prompt,
          objective,
          audience,
          platforms: selectedPlatforms,
          tone,
          language,
          contentType,
          length,
          keywords,
          cta,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Generation error", data.error || "Failed to generate content.", "error");
        return;
      }
      setVariants(data.variants);
      if (!selectedPlatforms.includes(activeTab)) {
        setActiveTab(selectedPlatforms[0]);
      }
      setLastExecutionBadge(
        `${data.meta.executionSource} • ${data.meta.model} (${data.meta.creditsCharged} credits)`
      );
      toast(
        "Platform variants generated!",
        `Created tailored copy for ${selectedPlatforms.length} channel(s).`
      );
      router.refresh();
    } catch (error) {
      toast("Generation interrupted", error instanceof Error ? error.message : "Retry to resume this request.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleTransform = async (
    action: "rewrite" | "improve" | "shorten" | "expand" | "translate" | "hashtags" | "cta"
  ) => {
    const currentVariant = variants[activeTab];
    if (!currentVariant) return;

    setTransforming(true);
    try {
      const res = await requestAi("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "transform",
          text: currentVariant.content,
          action,
          targetTone: tone,
          targetLanguage: language === "English" ? "Spanish" : language,
          platform: activeTab,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Editorial action failed", data.error || "Could not transform post.", "error");
        return;
      }
      setVariants((prev) => ({
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          content: data.transformedText,
          hashtags: data.hashtags?.length ? data.hashtags : prev[activeTab].hashtags,
          cta: data.cta || prev[activeTab].cta,
          characterCount: data.transformedText.length,
        },
      }));
      toast(`Applied '${action}' to ${activeTab.toUpperCase()}`);
      router.refresh();
    } catch (error) {
      toast("Editorial action interrupted", error instanceof Error ? error.message : "Retry to resume this request.", "error");
    } finally {
      setTransforming(false);
    }
  };

  const handleSavePost = async (
    status: "draft" | "pending_approval" | "scheduled" | "published"
  ) => {
    if (selectedPlatforms.length === 0) {
      toast("Select a platform", "Choose at least one channel before saving.", "error");
      return;
    }
    setSaving(true);
    try {
      const primaryVariant = variants[selectedPlatforms[0]];
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          brandId,
          title: topic.trim() || prompt.trim().slice(0, 100) || "Untitled Post",
          topic,
          baseContent: primaryVariant?.content || prompt,
          contentType,
          tone,
          status,
          scheduledAt: ["scheduled", "pending_approval"].includes(status) && scheduledAt ? scheduleToISO(scheduledAt, timezone) : null,
          requiresApproval,
          notifyOnPublish,
          mediaIds,
          automaticMedia,
          timezone,
          platforms: selectedPlatforms,
          variants,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Could not save post", data.error || "Check plan quotas or role permissions.", "error");
        return;
      }
      const statusLabels: Record<typeof status, string> = {
        draft: "Saved to Drafts",
        pending_approval: isTeamWorkspace ? "Submitted for Approval" : "Scheduled for Your Review",
        scheduled: "Scheduled in Content Calendar",
        published: "Queued for Publication",
      };
      toast(statusLabels[data.post.status as typeof status] || "Post saved", data.post.status === "waiting_media" ? "Media generation is queued. The result will be attached automatically before review or publishing." : data.post.status === "pending_approval" ? (isTeamWorkspace ? "Your team will review this post before it is sent." : "We will wait for your review before sending.") : "Publishing will wait until a social connection is available.");
      router.refresh();
    } catch (error) {
      toast("Could not save post", error instanceof Error ? error.message : "Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const currentVariant = variants[activeTab] || {
    content: "",
    hashtags: [],
    cta: "",
    formatLabel: "Post",
    characterCount: 0,
  };
  const activeSpec =
    SOCIAL_PLATFORM_SPECS[activeTab as SocialPlatformSpec["id"]] ||
    SOCIAL_PLATFORM_SPECS.linkedin;

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      {/* Left Configuration & Generation Controls */}
      <div className="surface-card space-y-5 rounded-3xl p-6 xl:col-span-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold">1. Content Brief & Parameters</h2>
          {lastExecutionBadge && (
            <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
              {lastExecutionBadge}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Brand Profile
            </label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(Number(e.target.value))}
              className="elevated-card mt-1.5 w-full rounded-xl px-3 py-2 text-xs font-semibold"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Content Type
            </label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              className="elevated-card mt-1.5 w-full rounded-xl px-3 py-2 text-xs font-semibold"
            >
              {[
                "Educational Post",
                "Product Promotion",
                "Announcement",
                "Storytelling Content",
                "Community Engagement",
                "Carousel Copy",
                "Short Video Script",
              ].map((ct) => (
                <option key={ct} value={ct}>
                  {ct}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Topic / Headline
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2 text-sm font-semibold"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            AI Creative Brief / Prompt
          </label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="elevated-card mt-1.5 w-full rounded-xl p-3 text-xs leading-relaxed"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Tone
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-2.5 py-2 text-xs font-semibold"
            >
              {[
                "Professional & Visionary",
                "Authoritative",
                "Conversational",
                "Energetic & Bold",
                "Educational",
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-2.5 py-2 text-xs font-semibold"
            >
              {["English", "Spanish", "French", "German", "Portuguese"].map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Length
            </label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-2.5 py-2 text-xs font-semibold"
            >
              {["Short", "Medium", "Long-Form"].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Objective
            </label>
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Target Audience
            </label>
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Keywords / Hashtags
            </label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Call To Action
            </label>
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
        </div>

        {/* Target Social Platforms */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Target Social Channels
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.values(SOCIAL_PLATFORM_SPECS).map((p) => {
              const selected = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    selected
                      ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                      : "elevated-card text-[var(--text-secondary)]"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          disabled={generating}
          onClick={handleGenerate}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-violet-600/25 transition-all hover:opacity-95 disabled:opacity-60"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          Generate Platform-Optimized Posts
        </button>
      </div>

      {/* Right Platform Editor + Realistic Preview + Publishing Lifecycle */}
      <div className="space-y-6 xl:col-span-7">
        <details className="surface-card rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-semibold">Attach existing media (optional)</summary>
          <PostMediaPicker uploadOnly selected={mediaIds} onChange={setMediaIds} onAssets={setMediaAssets} />
        </details>
        <div className="surface-card rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
            <div className="flex flex-wrap gap-1.5">
              {selectedPlatforms.map((platId) => {
                const spec = SOCIAL_PLATFORM_SPECS[platId as SocialPlatformSpec["id"]];
                const isSelected = activeTab === platId;
                return (
                  <button
                    key={platId}
                    type="button"
                    onClick={() => setActiveTab(platId)}
                    className={`relative rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                      isSelected
                        ? "text-slate-950"
                        : "elevated-card text-[var(--text-secondary)]"
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="studioPlatformTabPill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-xl bg-cyan-500"
                      />
                    )}
                    <span className="relative z-10">{spec?.name || platId.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>

            <span
              className={`text-xs font-bold ${
                currentVariant.content.length > activeSpec.maxChars
                  ? "text-rose-400"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {currentVariant.content.length} / {activeSpec.maxChars} chars
            </span>
          </div>

          {/* AI Editorial Transformation Toolbar */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase text-[var(--text-muted)]">
              AI Refine:
            </span>
            {(
              [
                { id: "rewrite", label: "Rewrite", icon: RefreshCw },
                { id: "improve", label: "Improve", icon: Sparkles },
                { id: "shorten", label: "Shorten", icon: Scissors },
                { id: "expand", label: "Expand", icon: Maximize2 },
                { id: "translate", label: "Translate", icon: Languages },
                { id: "hashtags", label: "+ Hashtags", icon: Hash },
                { id: "cta", label: "+ CTA", icon: MousePointerClick },
              ] as const
            ).map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.id}
                  type="button"
                  disabled={transforming}
                  onClick={() => handleTransform(btn.id)}
                  className="elevated-card inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:border-violet-500/50 disabled:opacity-50"
                >
                  <Icon className="h-3 w-3 text-cyan-400" />
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Editable Variant Textarea */}
          <textarea
            rows={7}
            value={currentVariant.content}
            onChange={(e) => {
              const val = e.target.value;
              setVariants((prev) => ({
                ...prev,
                [activeTab]: {
                  ...(prev[activeTab] || {
                    hashtags: [],
                    cta: "",
                    formatLabel: activeSpec.supportedFormats[0],
                  }),
                  content: val,
                  characterCount: val.length,
                },
              }));
            }}
            className="elevated-card mt-4 w-full rounded-2xl p-4 font-sans text-sm leading-relaxed focus:border-violet-500 focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(currentVariant.hashtags || []).map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Realistic Social Media Post Preview */}
        <div className="surface-card rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
              Live {activeSpec.name} Post Preview ({currentVariant.formatLabel})
            </h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
              <PulseStatusDot color="emerald" />
              Channel Formatted
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="elevated-card mx-auto mt-4 max-w-xl rounded-2xl p-5"
            >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-extrabold text-slate-950"
                style={{ backgroundColor: activeSpec.accentColor }}
              >
                {activeSpec.shortLabel}
              </div>
              <div>
                <div className="text-sm font-bold">
                  {brands.find((b) => b.id === brandId)?.name || "Brand Account"}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Sponsored / Scheduled Preview • Just now
                </div>
              </div>
            </div>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
              {currentVariant.content}
            </p>
            <div className="mt-3 space-y-3">{mediaAssets.filter(asset => mediaIds.includes(asset.id)).map(asset => <MediaPreview key={asset.id} asset={asset} />)}</div>
            {currentVariant.hashtags?.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-cyan-400">
                {currentVariant.hashtags.join(" ")}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" /> Like
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" /> Comment
              </span>
              <span className="inline-flex items-center gap-1">
                <Repeat2 className="h-3.5 w-3.5" /> Repost
              </span>
              <span className="inline-flex items-center gap-1">
                <Share className="h-3.5 w-3.5" /> Share
              </span>
            </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Scheduling & Lifecycle Action Bar */}
        <div className="surface-card rounded-3xl p-6">
          <h3 className="mb-3 font-bold">Review & publishing</h3>
          <AutomaticMediaSettings value={automaticMedia} onChange={setAutomaticMedia} />
          <label className="mb-3 block text-sm">{isTeamWorkspace ? "Team publishing permission" : "Publishing preference"}
            <select disabled={teamReviewRequired} value={requiresApproval ? "review" : "automatic"} onChange={event => setRequiresApproval(event.target.value === "review")} className="elevated-card mt-2 w-full rounded-xl p-3">
              <option value="automatic">Publish automatically</option>
              <option value="review">{isTeamWorkspace ? "Send to team approvers before publishing" : "Let me review first"}</option>
            </select>
          </label>
          <label className="mb-3 block text-sm"><input type="checkbox" checked={notifyOnPublish} onChange={event => setNotifyOnPublish(event.target.checked)} className="mr-2" />Notify me about publishing results</label>
          <p className="mb-4 text-xs text-[var(--text-secondary)]">Choose email, on-site, or browser push in Settings. Social publishing connections will be added later; scheduled posts remain unsent until then.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Schedule Date & Time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
              >
                <option value="America/Montevideo">America/Montevideo (UTC−3)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePost("draft")}
              className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold hover:border-violet-500/40"
            >
              <Save className="h-3.5 w-3.5" /> Save Draft
            </button>

            {isTeamWorkspace && <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePost("pending_approval")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-4 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Request Approval
            </button>}

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePost(requiresApproval ? "pending_approval" : "scheduled")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg"
            >
              <CalendarClock className="h-3.5 w-3.5" /> {requiresApproval ? (isTeamWorkspace ? "Submit for Team Approval" : "Schedule & Notify Me to Review") : "Schedule Post"}
            </button>

            {!requiresApproval && !automaticMedia && <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePost("published")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg"
            >
              <Send className="h-3.5 w-3.5" /> Publish Now
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
}
