"use client";

import { useAppLanguage } from "@/i18n/provider";
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

export function AnalyticsClient({ snapshots, advanced = false }: { snapshots: SnapshotRow[]; advanced?: boolean }) {
  const { t, formatDate, formatNumber } = useAppLanguage();

  const displayPostType = (value: string) => ({"Educational Post": t("customer.text.262"), "Product Announcement": t("customer.text.263"), "Case Study": t("customer.text.264"), "Carousel": t("customer.text.265"), "Video Script": t("customer.text.266")} as Record<string, string>)[value] ?? value;
  const displayDate = (value: string) => {
    const monthDay = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/.exec(value);
    const date = monthDay ? new Date(Date.UTC(2000, ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthDay[1]), Number(monthDay[2]))) : /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? formatDate(date, { month: "short", day: "numeric", timeZone: "UTC" }) : value;
  };
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

  const engagementRate = formatNumber(totals.impressions > 0 ? totals.engagements / totals.impressions : 0, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    if (!advanced) return;
    const header =
      t("customer.text.252");
    const lines = filtered.map(
      (r) =>
        `${displayDate(r.dateLabel)},${r.platform},"${displayPostType(r.postType)}",${r.impressions},${r.reach},${r.engagements},${r.likes},${r.comments},${r.shares},${r.clicks},${r.followers}`
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `postif-ai-analytics-${platformFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t("customer.text.253"), t("customer.downloadedRows", { count: formatNumber(filtered.length) }));
  };

  const maxImp = Math.max(1000, ...filtered.map((f) => f.impressions));
  if (!snapshots.length) return <p className="surface-card rounded-2xl p-5 text-sm text-[var(--text-muted)]">{t("customer.text.254")}</p>;

  return (
    <div className="space-y-8">
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-300">
            {t("customer.text.255")}
          </span>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="elevated-card rounded-xl px-3 py-2 text-xs font-bold uppercase"
          >
            <option value="all">{t("customer.text.256")}</option>
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
            <option value="all">{t("customer.text.261")}</option>
            <option value="Educational Post">{t("customer.text.262")}</option>
            <option value="Product Announcement">{t("customer.text.263")}</option>
            <option value="Case Study">{t("customer.text.264")}</option>
            <option value="Carousel">{t("customer.text.265")}</option>
            <option value="Video Script">{t("customer.text.266")}</option>
          </select>
        </div>

        {advanced && <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white"
        >
          <Download className="h-3.5 w-3.5" /> {t("customer.text.267")}
        </button>}
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("customer.text.268"), value: formatNumber(totals.impressions), color: "text-violet-400" },
          { label: t("customer.text.269"), value: formatNumber(totals.reach), color: "text-cyan-400" },
          { label: t("customer.text.270"), value: engagementRate, color: "text-emerald-400" },
          { label: t("customer.text.271"), value: formatNumber(totals.clicks), color: "text-amber-400" },
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
      {advanced && rankedTypes.length > 0 && (
        <div className="surface-card rounded-3xl border border-cyan-500/30 p-6">
          <div className="flex items-center gap-2 text-cyan-400">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              {t("customer.text.272")}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {t("customer.text.273")}{" "}
            <strong className="text-[var(--text-primary)]">{displayPostType(rankedTypes[0].type)}</strong>{" "}
            {t("customer.text.274")}{" "}
            <strong className="text-emerald-400">{formatNumber(rankedTypes[0].rate, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong>
            {rankedTypes[1]
              ? t("customer.comparedTo", { rate: formatNumber(rankedTypes[1].rate, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), type: displayPostType(rankedTypes[1].type) })
              : ""}
            {t("customer.text.275")}
          </p>
        </div>
      )}

      {/* Visual Chart + Performance Table */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-violet-400" />
          <h3 className="text-base font-extrabold">{t("customer.text.276")}</h3>
        </div>

        <div className="mt-6 grid h-48 grid-cols-5 items-end gap-3 border-b border-[var(--border-subtle)] pb-3 sm:grid-cols-10">
          {filtered.map((row) => {
            const pct = Math.max(12, Math.round((row.impressions / maxImp) * 100));
            return (
              <div key={row.id} className="flex h-full flex-col items-center justify-end">
                <div
                  className="w-full max-w-[30px] rounded-t-lg bg-gradient-to-t from-violet-600 to-cyan-400"
                  style={{ height: `${pct}%` }}
                  title={t("customer.chartImpressions", { date: displayDate(row.dateLabel), platform: row.platform, count: formatNumber(row.impressions) })}
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
                <th className="py-2.5 pr-4">{t("customer.text.277")}</th>
                <th className="py-2.5 pr-4">{t("customer.text.278")}</th>
                <th className="py-2.5 pr-4">{t("customer.text.279")}</th>
                <th className="py-2.5 pr-4">{t("customer.text.280")}</th>
                <th className="py-2.5 pr-4">{t("customer.text.281")}</th>
                <th className="py-2.5 pr-4">{t("customer.text.282")}</th>
                <th className="py-2.5">{t("customer.text.283")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-4 font-semibold">{displayDate(r.dateLabel)}</td>
                  <td className="py-3 pr-4 uppercase text-cyan-400">{r.platform}</td>
                  <td className="py-3 pr-4">{displayPostType(r.postType)}</td>
                  <td className="py-3 pr-4 font-bold">{formatNumber(r.impressions)}</td>
                  <td className="py-3 pr-4 text-emerald-400">{formatNumber(r.engagements)}</td>
                  <td className="py-3 pr-4">{formatNumber(r.clicks)}</td>
                  <td className="py-3">{formatNumber(r.followers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
