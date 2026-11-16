"use client";

import React, { useState } from "react";
import { useToast } from "./ToastProvider";
import { Download, Sparkles, BarChart3 } from "lucide-react";

interface SnapshotRow {
  id: number;
  platform: string;
  dateLabel: string;
  impressions: number;
  reach: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  followers: number;
  postType: string;
  isSampleData: boolean;
}

export function AnalyticsClient({ snapshots }: { snapshots: SnapshotRow[] }) {
  const { toast } = useToast();
  const [platformFilter, setPlatformFilter] = useState("all");
  const [postTypeFilter, setPostTypeFilter] = useState("all");

  const filtered = snapshots.filter((row) => {
    const platOk = platformFilter === "all" || row.platform === platformFilter;
    const typeOk = postTypeFilter === "all" || row.postType === postTypeFilter;
    return platOk && typeOk;
  });

  const totals = filtered.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      reach: acc.reach + r.reach,
      engagements: acc.engagements + r.engagements,
      clicks: acc.clicks + r.clicks,
    }),
    { impressions: 0, reach: 0, engagements: 0, clicks: 0 }
  );

  const engagementRate =
    totals.impressions > 0
      ? ((totals.engagements / totals.impressions) * 100).toFixed(2)
      : "0.00";

  // Grounded recommendation computed from filtered snapshots
  const byType: Record<string, { imp: number; eng: number }> = {};
  for (const r of filtered) {
    if (!byType[r.postType]) byType[r.postType] = { imp: 0, eng: 0 };
    byType[r.postType].imp += r.impressions;
    byType[r.postType].eng += r.engagements;
  }
  const rankedTypes = Object.entries(byType)
    .map(([type, v]) => ({
      type,
      rate: v.imp > 0 ? (v.eng / v.imp) * 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  const exportCsv = () => {
    const header =
      "Date,Platform,PostType,Impressions,Reach,Engagements,Likes,Comments,Shares,Clicks,Followers";
    const lines = filtered.map(
      (r) =>
        `${r.dateLabel},${r.platform},"${r.postType}",${r.impressions},${r.reach},${r.engagements},${r.likes},${r.comments},${r.shares},${r.clicks},${r.followers}`
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `postif-ai-analytics-${platformFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV Report Exported", `Downloaded ${filtered.length} analytics rows.`);
  };

  const maxImp = Math.max(1000, ...filtered.map((f) => f.impressions));

  return (
    <div className="space-y-8">
      {!snapshots.length && <p className="surface-card rounded-2xl p-5 text-sm text-[var(--text-muted)]">No analytics have been recorded. Live engagement ingestion is not configured; no sample statistics are displayed.</p>}
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-300">
            Recorded Analytics
          </span>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="elevated-card rounded-xl px-3 py-2 text-xs font-bold uppercase"
          >
            <option value="all">All Platforms</option>
            <option value="linkedin">LinkedIn</option>
            <option value="x">X (Twitter)</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>

          <select
            value={postTypeFilter}
            onChange={(e) => setPostTypeFilter(e.target.value)}
            className="elevated-card rounded-xl px-3 py-2 text-xs font-bold"
          >
            <option value="all">All Formats</option>
            <option value="Educational Post">Educational Post</option>
            <option value="Product Announcement">Product Announcement</option>
            <option value="Case Study">Case Study</option>
            <option value="Carousel">Carousel</option>
            <option value="Video Script">Video Script</option>
          </select>
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV Report
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Impressions", value: totals.impressions.toLocaleString(), color: "text-violet-400" },
          { label: "Unique Reach", value: totals.reach.toLocaleString(), color: "text-cyan-400" },
          { label: "Engagement Rate", value: `${engagementRate}%`, color: "text-emerald-400" },
          { label: "Outbound Link Clicks", value: totals.clicks.toLocaleString(), color: "text-amber-400" },
        ].map((card) => (
          <div key={card.label} className="surface-card rounded-3xl p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {card.label}
            </div>
            <div className={`mt-2 text-3xl font-extrabold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Grounded AI Recommendation */}
      {rankedTypes.length > 0 && (
        <div className="surface-card rounded-3xl border border-cyan-500/30 p-6">
          <div className="flex items-center gap-2 text-cyan-400">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              AI Performance Intelligence Recommendation
            </h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Based on the currently filtered dataset,{" "}
            <strong className="text-[var(--text-primary)]">{rankedTypes[0].type}</strong>{" "}
            content achieved the highest engagement rate at{" "}
            <strong className="text-emerald-400">{rankedTypes[0].rate.toFixed(2)}%</strong>
            {rankedTypes[1]
              ? ` compared to ${rankedTypes[1].rate.toFixed(2)}% for ${rankedTypes[1].type}`
              : ""}
            . Consider allocating +20% of next week’s autonomous agent slots toward{" "}
            {rankedTypes[0].type} formats.
          </p>
        </div>
      )}

      {/* Visual Chart + Performance Table */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-violet-400" />
          <h3 className="text-base font-extrabold">Channel Performance Breakdown</h3>
        </div>

        <div className="mt-6 grid h-48 grid-cols-5 items-end gap-3 border-b border-[var(--border-subtle)] pb-3 sm:grid-cols-10">
          {filtered.map((row) => {
            const pct = Math.max(12, Math.round((row.impressions / maxImp) * 100));
            return (
              <div key={row.id} className="flex h-full flex-col items-center justify-end">
                <div
                  className="w-full max-w-[30px] rounded-t-lg bg-gradient-to-t from-violet-600 to-cyan-400"
                  style={{ height: `${pct}%` }}
                  title={`${row.dateLabel} (${row.platform}): ${row.impressions} impressions`}
                />
                <span className="mt-2 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  {row.platform}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[11px] uppercase text-[var(--text-muted)]">
                <th className="py-2.5 pr-4">Date</th>
                <th className="py-2.5 pr-4">Platform</th>
                <th className="py-2.5 pr-4">Format</th>
                <th className="py-2.5 pr-4">Impressions</th>
                <th className="py-2.5 pr-4">Engagements</th>
                <th className="py-2.5 pr-4">Clicks</th>
                <th className="py-2.5">Followers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-4 font-semibold">{r.dateLabel}</td>
                  <td className="py-3 pr-4 uppercase text-cyan-400">{r.platform}</td>
                  <td className="py-3 pr-4">{r.postType}</td>
                  <td className="py-3 pr-4 font-bold">{r.impressions.toLocaleString()}</td>
                  <td className="py-3 pr-4 text-emerald-400">{r.engagements.toLocaleString()}</td>
                  <td className="py-3 pr-4">{r.clicks.toLocaleString()}</td>
                  <td className="py-3">{r.followers.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
