"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { MediaPreview, PostMedia } from "./PostMediaPicker";
import { formatScheduleInput, scheduleToISO } from "@/lib/schedule-time";
import { ScheduleFields } from "./ScheduleFields";
import { MediaDraftRunner } from "./MediaDraftRunner";
import { AutomaticMediaSettings, AutomaticMedia } from "./AutomaticMediaSettings";
import {
  CheckCircle2,
  Send,
  Copy,
  Trash2,
  Bot,
  Search,
} from "lucide-react";

interface PostRecord {
  id: number;
  title: string;
  baseContent: string;
  contentType: string;
  status: string;
  platforms: string[];
  scheduledAt: string | null;
  createdByAgent: boolean;
  approvalNote: string | null;
  requiresApproval: boolean;
  media: PostMedia[];
  variants: Record<string, { content: string; hashtags: string[] }>;
  timezone: string;
  automaticMedia: AutomaticMedia;
  automaticMediaStatus: string | null;
  mediaDraft: boolean;
}

const STATUS_BADGES: Record<string, string> = {
  waiting_media: "bg-violet-500/20 text-violet-300",
  media_failed: "bg-rose-500/20 text-rose-300",
  draft: "bg-slate-500/20 text-slate-300",
  pending_approval: "bg-amber-500/20 text-amber-300",
  approved: "bg-indigo-500/20 text-indigo-300",
  scheduled: "bg-cyan-500/20 text-cyan-300",
  publishing: "bg-violet-500/20 text-violet-300",
  published: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-rose-500/20 text-rose-300",
  cancelled: "bg-slate-600/20 text-slate-400",
};

export function PostsManagerClient({ posts, isTeamWorkspace, memberRole }: { posts: PostRecord[]; isTeamWorkspace: boolean; memberRole: string }) {
  const { t, formatDate, formatNumber } = useAppLanguage();
  const displayStatus = (value: string) => ["draft","pending_approval","waiting_media","media_failed","approved","scheduled","publishing","published","failed","cancelled","all","queued","processing","ready","deleting"].includes(value) ? t(`customer.status.${value}`) : value;

  const canReview = !isTeamWorkspace || ["owner", "admin", "approver"].includes(memberRole);
  const statusLabel = (status: string) => !isTeamWorkspace && status === "pending_approval" ? t("customer.text.562") : !isTeamWorkspace && status === "approved" ? t("customer.text.563") : displayStatus(status);
  const router = useRouter();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [mediaSettings, setMediaSettings] = useState<Record<number, AutomaticMedia>>({});

  const filtered = posts.filter((p) => {
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesQuery =
      !query.trim() ||
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.baseContent.toLowerCase().includes(query.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  const runPostAction = async (
    postId: number,
    action: "update" | "duplicate" | "delete",
    extra?: Record<string, unknown>
  ) => {
    setBusyId(postId);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, postId, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(t("customer.text.564"), data.error || t("customer.text.565"), "error");
        return;
      }
      const immediate = extra?.status === "published" && data.publishing;
      const issue = immediate && data.publishing.find((job: { status: string }) => ["failed", "blocked", "uncertain"].includes(job.status));
      toast(t("customer.text.566"), data.post?.status === "pending_approval" ? (isTeamWorkspace ? t("customer.text.567") : t("customer.text.568")) : immediate ? (issue ? `${t("customer.publish.problem")} ${issue.errorMessage || ""}` : data.post?.status === "published" ? t("customer.publish.confirmed") : t("customer.publish.pending")) : data.post?.status === "scheduled" ? t("customer.text.569") : t("customer.text.570"), issue ? "error" : undefined);
      router.refresh();
    } catch (error) {
      toast(t("customer.text.571"), error instanceof Error ? error.message : t("customer.text.400"), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Search Toolbar */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-4">
        <div className="flex flex-wrap gap-1.5">
          {[
            "all",
            "draft",
            "pending_approval",
            "waiting_media",
            "media_failed",
            "approved",
            "scheduled",
            "published",
            "failed",
          ].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold uppercase transition-all ${
                statusFilter === st
                  ? "bg-violet-600 text-white"
                  : "elevated-card text-[var(--text-secondary)]"
              }`}
            >
              {statusLabel(st)}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("customer.text.574")}
            className="elevated-card w-full rounded-xl py-2 pl-9 pr-3 text-xs"
          />
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="surface-card rounded-3xl p-10 text-center text-sm text-[var(--text-secondary)]">
            {t("customer.text.575")}
          </div>
        ) : (
          filtered.map((post) => (
            <div
              key={post.id}
              className="surface-card flex flex-col justify-between gap-4 rounded-3xl p-5 lg:flex-row lg:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      STATUS_BADGES[post.status] || STATUS_BADGES.draft
                    }`}
                  >
                    {statusLabel(post.status)}
                  </span>
                  <span className="text-xs font-semibold text-cyan-400">
                    {post.platforms.map((pl) => pl.toUpperCase()).join(" • ")}
                  </span>
                  {post.createdByAgent && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                      <Bot className="h-3 w-3" /> {t("customer.text.576")}
                    </span>
                  )}
                </div>

                <h3 className="mt-2 text-base font-extrabold">{post.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {post.baseContent}
                </p>
                {post.scheduledAt && (
                  <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                    {t("customer.text.577")}{" "} {formatDate(new Date(post.scheduledAt))}
                  </p>
                )}
                <p className="mt-2 text-xs text-[var(--text-muted)]">{post.requiresApproval ? (isTeamWorkspace ? t("customer.text.578") : t("customer.text.579")) : t("customer.text.460")} · {formatNumber(post.media.length)} {t("customer.text.581")}</p>
                {post.automaticMedia && <p className="mt-2 text-xs text-violet-300">{t("customer.text.582")}{" "} {displayStatus(post.automaticMedia.kind)}: {post.automaticMediaStatus ? displayStatus(post.automaticMediaStatus) : t("customer.text.583")}</p>}
                {post.status === "media_failed" && <p role="alert" className="mt-2 text-xs text-rose-400">{post.approvalNote || t("customer.text.584")}</p>}
                {post.status === "waiting_media" && post.mediaDraft && <MediaDraftRunner postId={post.id} disabled={memberRole === "viewer"} />}
                <button onClick={() => setReviewId(reviewId === post.id ? null : post.id)} className="mt-2 text-xs font-bold text-cyan-400">{reviewId === post.id ? t("customer.text.585") : t("customer.text.586")}</button>
                {reviewId === post.id && <div className="mt-4 space-y-3">
                  {Object.entries(post.variants).map(([platform, variant]) => <div key={platform} className="elevated-card rounded-xl p-3"><strong>{platform.toUpperCase()}</strong><p className="mt-2 whitespace-pre-wrap text-sm">{variant.content}</p><p className="text-xs text-cyan-400">{variant.hashtags.join(" ")}</p></div>)}
                  {Object.keys(post.variants).length === 0 && <p className="whitespace-pre-wrap text-sm">{post.baseContent}</p>}
                  {post.media.map(asset => <MediaPreview key={asset.id} asset={asset} />)}
                  {!["published", "publishing"].includes(post.status) && <>
                    {canReview && <label className="block text-sm">{isTeamWorkspace ? t("customer.text.458") : t("customer.text.459")}
                      <select disabled={busyId === post.id} value={post.requiresApproval ? "review" : "automatic"} onChange={event => runPostAction(post.id, "update", { requiresApproval: event.target.value === "review", ...(["pending_approval", "approved"].includes(post.status) ? { status: post.scheduledAt ? "scheduled" : "draft" } : {}) })} className="elevated-card mt-2 w-full rounded-xl p-3">
                        <option value="automatic">{t("customer.text.460")}</option><option value="review">{isTeamWorkspace ? t("customer.text.590") : t("customer.text.462")}</option>
                      </select>
                    </label>}
                    <AutomaticMediaSettings value={Object.hasOwn(mediaSettings, post.id) ? mediaSettings[post.id] : post.automaticMedia} onChange={value => setMediaSettings({ ...mediaSettings, [post.id]: value })} />
                    <button disabled={busyId === post.id} onClick={() => runPostAction(post.id, "update", { automaticMedia: Object.hasOwn(mediaSettings, post.id) ? mediaSettings[post.id] : post.automaticMedia })} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white">{t("customer.text.592")}</button>
                  </>}
                </div>}
                {!["published", "publishing"].includes(post.status) && <div className="mt-3 block text-xs">{t("customer.text.593")}{post.timezone})
                  <ScheduleFields value={dates[post.id] ?? (post.scheduledAt ? formatScheduleInput(new Date(post.scheduledAt), post.timezone) : "")} onChange={value => setDates({ ...dates, [post.id]: value })} />
                  <button disabled={busyId === post.id} className="ml-2 font-bold text-cyan-400" onClick={() => {
                    try {
                      const chosen = dates[post.id] ?? (post.scheduledAt ? formatScheduleInput(new Date(post.scheduledAt), post.timezone) : "");
                      const scheduledAt = post.scheduledAt && chosen === formatScheduleInput(new Date(post.scheduledAt), post.timezone) ? post.scheduledAt : scheduleToISO(chosen, post.timezone);
                      void runPostAction(post.id, "update", { status: post.status === "pending_approval" ? "pending_approval" : "scheduled", scheduledAt });
                    }
                    catch (error) { toast(t("customer.text.594"), error instanceof Error ? error.message : t("customer.text.595"), "error"); }
                  }}>{t("customer.text.596")}</button>
                </div>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {post.status === "pending_approval" && reviewId === post.id && canReview && (
                  <button
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => runPostAction(post.id, "update", { status: "approved" })}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {isTeamWorkspace ? t("customer.text.597") : t("customer.text.598")}{post.scheduledAt ? t("customer.text.599") : ""}
                  </button>
                )}

                {!["published", "publishing", "pending_approval", "waiting_media", "media_failed"].includes(post.status) && (
                  <button
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => runPostAction(post.id, "update", { status: "published" })}
                    className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30"
                  >
                    <Send className="h-3.5 w-3.5" /> {t("customer.text.478")}
                  </button>
                )}
                {post.status === "media_failed" && post.mediaDraft && <button disabled={busyId === post.id} onClick={() => runPostAction(post.id, "update", { status: "draft", automaticMedia: null })} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white">{t("customer.mediaDraft.keepText")}</button>}
                {post.status === "media_failed" && !post.mediaDraft && post.automaticMediaStatus === "failed" && <button disabled={busyId === post.id} onClick={() => runPostAction(post.id, "update", { retryMedia: true })} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white">{t("customer.text.602")}</button>}
                {!["published", "publishing", "cancelled"].includes(post.status) && <button disabled={busyId === post.id} onClick={() => runPostAction(post.id, "update", { status: "cancelled" })} className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-400">{post.status === "pending_approval" ? t("customer.text.233") : t("customer.text.604")}</button>}

                <button
                  type="button"
                  disabled={busyId === post.id}
                  onClick={() => runPostAction(post.id, "duplicate")}
                  className="elevated-card inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold"
                  title={t("customer.text.605")}
                >
                  <Copy className="h-3.5 w-3.5" /> {t("customer.text.336")}
                </button>

                <button
                  type="button"
                  disabled={busyId === post.id}
                  onClick={() => runPostAction(post.id, "delete")}
                  className="elevated-card inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-rose-400 hover:border-rose-500/40"
                  title={t("customer.text.607")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
