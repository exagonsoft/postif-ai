"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import {
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Crop,
  Video,
  Info,
} from "lucide-react";

interface MediaAssetDTO {
  id: number;
  title: string;
  prompt: string;
  assetType: string;
  aspectRatio: string;
  url: string;
  tags: string[];
  altText: string;
  brandPreset: string;
  isSampleData: boolean;
}

const PRESET_GRADIENTS: Record<string, string> = {
  "Nebula Violet": "from-violet-700 via-indigo-800 to-slate-950",
  "Cyber Cyan": "from-cyan-600 via-blue-800 to-slate-950",
  "Midnight Command": "from-slate-800 via-violet-950 to-black",
  "Solar Emerald": "from-emerald-600 via-teal-800 to-slate-950",
};

export function MediaStudioClient({ assets }: { assets: MediaAssetDTO[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState("Q2 AI Benchmark Launch Graphic");
  const [prompt, setPrompt] = useState(
    "Clean dark-mode product telemetry visualization with electric violet and cyan light beams"
  );
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [assetType, setAssetType] = useState("image");
  const [brandPreset, setBrandPreset] = useState("Nebula Violet");
  const [tags, setTags] = useState("Launch, LinkedIn, Benchmark");
  const [altText, setAltText] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title,
          prompt,
          aspectRatio,
          assetType,
          brandPreset,
          tags,
          altText,
        }),
      });
      if (res.ok) {
        toast(
          "Visual asset saved to library",
          "Generated aspect-ratio blueprint & accessible alt-text."
        );
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRatio = async (assetId: number, nextRatio: string) => {
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", assetId, aspectRatio: nextRatio }),
    });
    if (res.ok) {
      toast("Aspect ratio adapted", `Reframed asset for ${nextRatio} social placement.`);
      router.refresh();
    }
  };

  const handleDelete = async (assetId: number) => {
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", assetId }),
    });
    if (res.ok) {
      toast("Asset removed");
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      {/* Architecture Disclosure */}
      <div className="surface-card flex items-start gap-3 rounded-3xl p-5 text-xs text-[var(--text-secondary)]">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
        <div>
          <strong className="text-[var(--text-primary)]">
            Media & Visual Studio Architecture:
          </strong>{" "}
          Design brand visual presets, multi-platform aspect-ratio crops (1:1, 4:5, 16:9, 9:16),
          AI image prompts, accessibility alt-text, and short-form video storyboards. Connect an
          S3-compatible bucket or external image/video rendering provider in production to stream
          binary renders.
        </div>
      </div>

      {/* Create Visual Blueprint / Upload Studio */}
      <form
        onSubmit={handleCreateAsset}
        className="surface-card grid gap-6 rounded-3xl p-6 lg:grid-cols-12"
      >
        <div className="space-y-4 lg:col-span-7">
          <h2 className="text-base font-extrabold">
            Create Visual Concept, Template & Alt-Text
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                Asset Title
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                Asset Type
              </label>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
                className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
              >
                <option value="image">Social Graphic / Prompt Blueprint</option>
                <option value="template">Reusable Carousel Template</option>
                <option value="video_blueprint">Video / Shorts Storyboard Architecture</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              AI Image / Creative Direction Prompt
            </label>
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl p-3 text-xs"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs font-bold"
              >
                <option value="16:9">16:9 (LinkedIn / X / YT)</option>
                <option value="4:5">4:5 (Instagram / FB)</option>
                <option value="1:1">1:1 (Square Feed)</option>
                <option value="9:16">9:16 (TikTok / Reels / Shorts)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                Brand Visual Preset
              </label>
              <select
                value={brandPreset}
                onChange={(e) => setBrandPreset(e.target.value)}
                className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs font-bold"
              >
                {Object.keys(PRESET_GRADIENTS).map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                Asset Tags
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              Custom Accessibility Alt-Text (leave blank to auto-generate)
            </label>
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Auto-generated from title, preset, and prompt..."
              className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3 text-xs font-extrabold text-white shadow-lg"
          >
            <Sparkles className="h-4 w-4" /> Save Visual Asset & Generate Alt-Text
          </button>
        </div>

        {/* Live Brand Visual Card Preview */}
        <div className="flex flex-col justify-center lg:col-span-5">
          <div
            className={`relative flex min-h-[240px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br ${
              PRESET_GRADIENTS[brandPreset] || PRESET_GRADIENTS["Nebula Violet"]
            } p-6 text-white shadow-2xl`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/80">
              <span>{brandPreset}</span>
              <span className="rounded-md bg-white/15 px-2 py-0.5">{aspectRatio}</span>
            </div>
            <div>
              <div className="text-lg font-extrabold leading-snug">{title}</div>
              <p className="mt-1.5 line-clamp-2 text-xs text-white/80">{prompt}</p>
            </div>
          </div>
        </div>
      </form>

      {/* Media Library Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <div key={asset.id} className="surface-card flex flex-col justify-between rounded-3xl p-5">
            <div>
              <div
                className={`flex h-40 flex-col justify-between rounded-2xl bg-gradient-to-br ${
                  PRESET_GRADIENTS[asset.brandPreset] || PRESET_GRADIENTS["Nebula Violet"]
                } p-4 text-white`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                  <span className="inline-flex items-center gap-1 rounded bg-black/30 px-2 py-0.5">
                    {asset.assetType === "video_blueprint" ? (
                      <Video className="h-3 w-3" />
                    ) : (
                      <ImageIcon className="h-3 w-3" />
                    )}
                    {asset.assetType.replace("_", " ")}
                  </span>
                  <span className="rounded bg-white/20 px-2 py-0.5">{asset.aspectRatio}</span>
                </div>
                <div className="text-sm font-extrabold">{asset.title}</div>
              </div>

              <p className="mt-3 text-xs text-[var(--text-secondary)]">{asset.prompt}</p>
              <p className="mt-2 rounded-xl bg-slate-900/50 p-2 text-[11px] text-[var(--text-muted)]">
                <strong>Alt-Text:</strong> {asset.altText}
              </p>

              <div className="mt-3 flex flex-wrap gap-1">
                {asset.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
              <div className="flex items-center gap-1">
                <Crop className="h-3.5 w-3.5 text-cyan-400" />
                {(["1:1", "4:5", "16:9", "9:16"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => handleUpdateRatio(asset.id, ratio)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      asset.aspectRatio === ratio
                        ? "bg-cyan-500 text-slate-950"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleDelete(asset.id)}
                className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"
                title="Delete asset"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
