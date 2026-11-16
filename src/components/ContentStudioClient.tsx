"use client";

import { useAppLanguage } from "@/i18n/provider";
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
  const { t, formatNumber } = useAppLanguage();

  const displayLabel = (value: string) => ({
    "Educational Post": t("customer.text.262"),
    "Product Promotion": t("customer.text.406"),
    "Announcement": t("customer.text.407"),
    "Storytelling Content": t("customer.text.408"),
    "Community Engagement": t("customer.text.409"),
    "Carousel Copy": t("customer.text.410"),
    "Short Video Script": t("customer.text.411"),
    "Professional & Visionary": t("customer.text.415"),
    "Authoritative": t("customer.text.416"),
    "Conversational": t("customer.text.417"),
    "Energetic & Bold": t("customer.text.418"),
    "Educational": t("customer.text.419"),
    "English": t("customer.text.421"),
    "Spanish": t("customer.text.422"),
    "French": t("customer.text.423"),
    "German": t("customer.text.424"),
    "Portuguese": t("customer.text.425"),
    "Short": t("customer.text.427"),
    "Medium": t("customer.text.428"),
    "Long-Form": t("customer.text.429")
  } as Record<string, string>)[value] ?? value;
  const displayAction = (value: string) => ({"rewrite": t("customer.text.441"), "improve": t("customer.text.442"), "shorten": t("customer.text.443"), "expand": t("customer.text.444"), "translate": t("customer.text.445"), "hashtags": t("customer.text.446"), "cta": t("customer.text.447")} as Record<string, string>)[value] ?? value;
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
  const [objective, setObjective] = useState(t("customer.text.362"));
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
      toast(t("customer.text.368"), t("customer.text.369"), "error");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast(t("customer.text.370"), t("customer.text.371"), "error");
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
        toast(t("customer.text.373"), data.error || t("customer.text.374"), "error");
        return;
      }
      setVariants(data.variants);
      if (!selectedPlatforms.includes(activeTab)) {
        setActiveTab(selectedPlatforms[0]);
      }
      setLastExecutionBadge(
        t("customer.executionBadge", { source: data.meta.executionSource, model: data.meta.model, count: formatNumber(data.meta.creditsCharged) })
      );
      toast(
        t("customer.text.375"),
        t("customer.tailoredCopy", { count: formatNumber(selectedPlatforms.length) })
      );
      router.refresh();
    } catch (error) {
      toast(t("customer.text.376"), error instanceof Error ? error.message : t("customer.text.60"), "error");
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
        toast(t("customer.text.380"), data.error || t("customer.text.381"), "error");
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
      toast(t("customer.appliedAction", { action: displayAction(action), platform: activeTab.toUpperCase() }));
      router.refresh();
    } catch (error) {
      toast(t("customer.text.382"), error instanceof Error ? error.message : t("customer.text.60"), "error");
    } finally {
      setTransforming(false);
    }
  };

  const handleSavePost = async (
    status: "draft" | "pending_approval" | "scheduled" | "published"
  ) => {
    if (selectedPlatforms.length === 0) {
      toast(t("customer.text.384"), t("customer.text.385"), "error");
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
          title: topic.trim() || prompt.trim().slice(0, 100) || t("customer.text.386"),
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
        toast(t("customer.text.387"), data.error || t("customer.text.388"), "error");
        return;
      }
      const statusLabels: Record<typeof status, string> = {
        draft: t("customer.text.61"),
        pending_approval: isTeamWorkspace ? t("customer.text.390") : t("customer.text.391"),
        scheduled: t("customer.text.392"),
        published: t("customer.text.393"),
      };
      toast(statusLabels[data.post.status as typeof status] || t("customer.text.394"), data.post.status === "waiting_media" ? t("customer.text.395") : data.post.status === "pending_approval" ? (isTeamWorkspace ? t("customer.text.396") : t("customer.text.397")) : t("customer.text.398"));
      router.refresh();
    } catch (error) {
      toast(t("customer.text.387"), error instanceof Error ? error.message : t("customer.text.400"), "error");
    } finally {
      setSaving(false);
    }
  };

  const currentVariant = variants[activeTab] || {
    content: "",
    hashtags: [],
    cta: "",
    formatLabel: t("customer.text.401"),
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
          <h2 className="text-base font-extrabold">{t("customer.text.402")}</h2>
          {lastExecutionBadge && (
            <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
              {lastExecutionBadge}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t("customer.text.403")}
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
              {t("customer.text.404")}
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
                  {displayLabel(ct)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t("customer.text.412")}
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2 text-sm font-semibold"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t("customer.text.413")}
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
              {t("customer.text.414")}
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
                  {displayLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t("customer.text.420")}
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-2.5 py-2 text-xs font-semibold"
            >
              {["English", "Spanish", "French", "German", "Portuguese"].map((lang) => (
                <option key={lang} value={lang}>
                  {displayLabel(lang)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t("customer.text.426")}
            </label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-2.5 py-2 text-xs font-semibold"
            >
              {["Short", "Medium", "Long-Form"].map((l) => (
                <option key={l} value={l}>
                  {displayLabel(l)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t("customer.text.430")}
            </label>
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t("customer.text.431")}
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
              {t("customer.text.432")}
            </label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t("customer.text.433")}
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
            {t("customer.text.434")}
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
          {t("customer.text.436")}
        </button>
      </div>

      {/* Right Platform Editor + Realistic Preview + Publishing Lifecycle */}
      <div className="space-y-6 xl:col-span-7">
        <details className="surface-card rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t("customer.text.437")}</summary>
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
              {formatNumber(currentVariant.content.length)} / {formatNumber(activeSpec.maxChars)} {t("customer.text.83")}
            </span>
          </div>

          {/* AI Editorial Transformation Toolbar */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.440")}
            </span>
            {(
              [
                { id: "rewrite", label: t("customer.text.441"), icon: RefreshCw },
                { id: "improve", label: t("customer.text.442"), icon: Sparkles },
                { id: "shorten", label: t("customer.text.443"), icon: Scissors },
                { id: "expand", label: t("customer.text.444"), icon: Maximize2 },
                { id: "translate", label: t("customer.text.445"), icon: Languages },
                { id: "hashtags", label: t("customer.text.446"), icon: Hash },
                { id: "cta", label: t("customer.text.447"), icon: MousePointerClick },
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
              {t("customer.studio.preview", { platform: activeSpec.name, format: currentVariant.formatLabel })}
            </h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
              <PulseStatusDot color="emerald" />
              {t("customer.text.450")}
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
                  {brands.find((b) => b.id === brandId)?.name || t("customer.text.451")}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {t("customer.text.452")}
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
                <Heart className="h-3.5 w-3.5" /> {t("customer.text.453")}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" /> {t("customer.text.454")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Repeat2 className="h-3.5 w-3.5" /> {t("customer.text.455")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Share className="h-3.5 w-3.5" /> {t("customer.text.456")}
              </span>
            </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Scheduling & Lifecycle Action Bar */}
        <div className="surface-card rounded-3xl p-6">
          <h3 className="mb-3 font-bold">{t("customer.text.457")}</h3>
          <AutomaticMediaSettings value={automaticMedia} onChange={setAutomaticMedia} />
          <label className="mb-3 block text-sm">{isTeamWorkspace ? t("customer.text.458") : t("customer.text.459")}
            <select disabled={teamReviewRequired} value={requiresApproval ? "review" : "automatic"} onChange={event => setRequiresApproval(event.target.value === "review")} className="elevated-card mt-2 w-full rounded-xl p-3">
              <option value="automatic">{t("customer.text.460")}</option>
              <option value="review">{isTeamWorkspace ? t("customer.text.461") : t("customer.text.462")}</option>
            </select>
          </label>
          <label className="mb-3 block text-sm"><input type="checkbox" checked={notifyOnPublish} onChange={event => setNotifyOnPublish(event.target.checked)} className="mr-2" />{t("customer.text.463")}</label>
          <p className="mb-4 text-xs text-[var(--text-secondary)]">{t("customer.text.464")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t("customer.text.465")}
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
                {t("customer.text.466")}
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
              <Save className="h-3.5 w-3.5" /> {t("customer.text.473")}
            </button>

            {isTeamWorkspace && <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePost("pending_approval")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-4 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("customer.text.474")}
            </button>}

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePost(requiresApproval ? "pending_approval" : "scheduled")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg"
            >
              <CalendarClock className="h-3.5 w-3.5" /> {requiresApproval ? (isTeamWorkspace ? t("customer.text.475") : t("customer.text.476")) : t("customer.text.477")}
            </button>

            {!requiresApproval && !automaticMedia && <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePost("published")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg"
            >
              <Send className="h-3.5 w-3.5" /> {t("customer.text.478")}
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
}
