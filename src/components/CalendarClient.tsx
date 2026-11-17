"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { formatScheduleInput, scheduleToISO } from "@/lib/schedule-time";
import { ScheduleFields } from "./ScheduleFields";
import { SCHEDULE_SLOTS } from "@/lib/schedule-slots";
import {
  Calendar as CalendarIcon,
  RotateCcw,
  Play,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Save,
  Copy,
} from "lucide-react";

interface CalendarPost {
  id: number;
  title: string;
  baseContent: string;
  status: string;
  platforms: string[];
  scheduledAt: string | null;
  timezone: string;
}

interface PublishingJobItem {
  id: number;
  postId: number;
  platform: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  scheduledFor: string;
  errorMessage: string | null;
  idempotencyKey: string;
  deliveryMode: "immediate" | "scheduled";
}

export function CalendarClient({
  posts,
  jobs,
}: {
  posts: CalendarPost[];
  jobs: PublishingJobItem[];
}) {
  const { t, formatDate, formatNumber } = useAppLanguage();
  const displayStatus = (value: string) => ["draft","pending_approval","waiting_media","media_failed","approved","scheduled","publishing","published","failed","cancelled","blocked","queued","completed","pending","processing","uncertain","retrying"].includes(value) ? t(`customer.status.${value}`) : value;

  const router = useRouter();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"monthly" | "weekly" | "daily" | "list">("monthly");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [timezone, setTimezone] = useState("America/New_York");
  const [draggedPostId, setDraggedPostId] = useState<number | null>(null);

  const [editingPost, setEditingPost] = useState<CalendarPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState("scheduled");

  const openEditor = (post: CalendarPost) => {
    setEditingPost(post);
    setEditTitle(post.title);
    setEditContent(post.baseContent);
    setEditDate(
      post.scheduledAt
        ? formatScheduleInput(new Date(post.scheduledAt), post.timezone)
        : ""
    );
    setTimezone(post.timezone);
    setEditStatus(post.status);
  };

  const saveEditedPost = async () => {
    if (!editingPost) return;
    let scheduledAt: string | null;
    try {
      scheduledAt = editDate && editingPost.scheduledAt && timezone === editingPost.timezone &&
        editDate === formatScheduleInput(new Date(editingPost.scheduledAt), timezone)
        ? editingPost.scheduledAt : editDate ? scheduleToISO(editDate, timezone) : null;
    }
    catch (error) { toast(t("customer.text.594"), error instanceof Error ? error.message : t("customer.text.595"), "error"); return; }
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        postId: editingPost.id,
        title: editTitle,
        baseContent: editContent,
        status: editStatus,
        scheduledAt,
        timezone,
      }),
    });
    if (res.ok) {
      toast(t("customer.text.294"), t("customer.updatedCalendar", { title: editTitle }));
      setEditingPost(null);
      router.refresh();
    } else { const data = await res.json(); toast(t("customer.text.564"), data.error || t("customer.text.565"), "error"); }
  };

  const handleDropOnDay = (dayNumber: number) => {
    if (!draggedPostId) return;
    const post = posts.find(item => item.id === draggedPostId);
    setDraggedPostId(null);
    if (!post) return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    const previousTime = post.scheduledAt ? formatScheduleInput(new Date(post.scheduledAt), post.timezone).slice(11) : "";
    openEditor(post);
    setEditDate(`${day}T${SCHEDULE_SLOTS.some(slot => slot === previousTime) ? previousTime : "09:00"}`);
    setEditStatus("scheduled");
  };

  const handleDuplicate = async (postId: number) => {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate", postId }),
    });
    if (res.ok) {
      toast(t("customer.text.296"), t("customer.text.297"));
      setEditingPost(null);
      router.refresh();
    }
  };

  const handleRetryJob = async (jobId: number) => {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId }),
    });
    const data = await res.json();
    if (res.ok) {
      toast(t("customer.text.298"), jobs.find(job => job.id === jobId)?.deliveryMode === "immediate" ? t("customer.publish.checkResult") : t("customer.retryJob", { id: jobId }));
      router.refresh();
    } else toast(t("customer.text.564"), data.error || t("customer.text.565"), "error");
  };

  const handleCheckImmediate = async (jobId: number) => {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check_immediate", jobId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(t("customer.text.564"), data.error || t("customer.text.565"), "error");
    } else {
      toast(t("customer.publish.checkResult"), data.errorMessage || displayStatus(data.status));
      router.refresh();
    }
  };

  const handleRunDueJobs = async () => {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run_due" }),
    });
    const data = await res.json();
    if (res.ok) {
      toast(
        t("customer.text.299"),
        t("customer.processedJobs", { count: formatNumber(data.processed) })
      );
      router.refresh();
    }
  };

  const filteredPosts = posts.filter(
    (p) => statusFilter === "all" || p.status === statusFilter
  );

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-8">
      {/* Controls Bar */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["monthly", "weekly", "daily", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold capitalize transition-all ${
                viewMode === mode
                  ? "bg-violet-600 text-white"
                  : "elevated-card text-[var(--text-secondary)]"
              }`}
            >
              {t(`customer.calendar.${mode}View`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="elevated-card rounded-xl px-3 py-2 text-xs font-semibold"
          >
            <option value="all">{t("customer.text.302")}</option>
            <option value="scheduled">{t("customer.text.303")}</option>
            <option value="pending_approval">{t("customer.text.304")}</option>
            <option value="published">{t("customer.text.305")}</option>
            <option value="draft">{t("customer.text.306")}</option>
            <option value="failed">{t("customer.text.307")}</option>
          </select>

          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="elevated-card rounded-xl px-3 py-2 text-xs font-semibold"
          >
            <option value="America/New_York">EST (America/New_York)</option>
            <option value="America/Los_Angeles">PST (America/Los_Angeles)</option>
            <option value="Europe/London">GMT (Europe/London)</option>
            <option value="Asia/Tokyo">JST (Asia/Tokyo)</option>
          </select>
        </div>
      </div>

      {/* Monthly Grid View (with Drag & Drop) */}
      {viewMode === "monthly" && (
        <div className="surface-card rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-extrabold">
              {formatDate(now, { month: "long", year: "numeric" })} {t("customer.text.312")}
            </h2>
            <span className="text-xs text-[var(--text-muted)]">{t("customer.text.313")}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {monthDays.map((day) => {
              const dayPosts = filteredPosts.filter((p) => {
                if (!p.scheduledAt) return day === now.getDate() && p.status === "draft";
                const d = new Date(p.scheduledAt);
                return d.getDate() === day && d.getMonth() === now.getMonth();
              });
              const isToday = day === now.getDate();

              return (
                <div
                  key={day}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropOnDay(day)}
                  className={`min-h-[115px] rounded-2xl border p-2.5 transition-colors ${
                    isToday
                      ? "border-cyan-400/60 bg-cyan-500/5"
                      : "border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 hover:border-violet-500/40"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className={isToday ? "text-cyan-400" : "text-[var(--text-muted)]"}>
                      {formatNumber(day)}
                    </span>
                    {isToday && (
                      <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] text-cyan-300">
                        {t("customer.text.314")}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {dayPosts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        draggable
                        onDragStart={() => setDraggedPostId(p.id)}
                        onClick={() => openEditor(p)}
                        className="block w-full truncate rounded-lg border border-violet-500/30 bg-violet-600/20 px-2 py-1 text-left text-[11px] font-semibold text-violet-200 hover:bg-violet-600/35"
                      >
                        {p.platforms[0]?.toUpperCase()}: {p.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly / Daily / List Views */}
      {viewMode !== "monthly" && (
        <div className="surface-card space-y-3 rounded-3xl p-6">
          <h2 className="text-base font-extrabold capitalize">{t(`customer.calendar.${viewMode}Queue`)}</h2>
          {filteredPosts.map((p) => (
            <div
              key={p.id}
              onClick={() => openEditor(p)}
              className="elevated-card flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-2xl p-4 transition-colors hover:border-violet-500/40"
            >
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {p.scheduledAt
                    ? formatDate(new Date(p.scheduledAt))
                    : t("customer.text.316")}{" "}
                  • {p.platforms.map((pl) => pl.toUpperCase()).join(", ")}
                </div>
                <div className="mt-1 text-sm font-extrabold">{p.title}</div>
              </div>
              <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-bold uppercase text-violet-300">
                {displayStatus(p.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Persistent Server-Side Publishing Jobs Queue */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold">
              {t("customer.text.317")}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {t("customer.text.318")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunDueJobs}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950"
          >
            <Play className="h-3.5 w-3.5" /> {t("customer.text.319")}
          </button>
        </div>

        <div className="mt-5 space-y-2.5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="elevated-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {job.status === "failed" ? (
                    <AlertCircle className="h-4 w-4 text-rose-400" />
                  ) : job.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Clock className="h-4 w-4 text-cyan-400" />
                  )}
                  <span className="text-xs font-extrabold uppercase">
                    {t("customer.text.320")}{job.id} • {job.platform}
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                    {t("customer.text.321")}{" "} {job.idempotencyKey}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                  {t("customer.text.322")}{" "} {formatDate(new Date(job.scheduledFor))} {t("customer.text.323")}{" "}
                  {formatNumber(job.attempts)}/{formatNumber(job.maxAttempts)}
                </div>
                {job.errorMessage && (
                  <p className="mt-1 text-xs font-medium text-rose-400">{job.errorMessage}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    job.status === "failed"
                      ? "bg-rose-500/20 text-rose-300"
                      : job.status === "completed"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-cyan-500/20 text-cyan-300"
                  }`}
                >
                  {displayStatus(job.status)}
                </span>

                {job.deliveryMode === "immediate" && (["processing", "queued"].includes(job.status) || (job.status === "completed" && posts.some(post => post.id === job.postId && post.status === "publishing"))) && (
                  <button type="button" onClick={() => handleCheckImmediate(job.id)} className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950">
                    <RotateCcw className="h-3.5 w-3.5" /> {t("customer.publish.check")}
                  </button>
                )}
                {["failed", "blocked"].includes(job.status) && (
                  <button
                    type="button"
                    onClick={() => handleRetryJob(job.id)}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {t("customer.text.324")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Post Editor Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-lg rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-extrabold">{t("customer.text.325")}</h3>
              <button
                type="button"
                aria-label={t("customer.close")}
                onClick={() => setEditingPost(null)}
                className="rounded-lg p-1 text-[var(--text-muted)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                  {t("customer.text.326")}
                </label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                  {t("customer.text.327")}
                </label>
                <textarea
                  rows={4}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="elevated-card mt-1 w-full rounded-xl p-3 text-xs leading-relaxed"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                    {t("customer.text.328")}{timezone})
                  </label>
                  <ScheduleFields value={editDate} onChange={setEditDate} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
                    {t("customer.text.329")}
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    <option value="draft">{t("customer.text.306")}</option>
                    <option value="pending_approval">{t("customer.text.304")}</option>
                    <option value="approved">{t("customer.text.332")}</option>
                    <option value="scheduled">{t("customer.text.303")}</option>
                    <option value="published">{t("customer.text.305")}</option>
                    <option value="cancelled">{t("customer.text.335")}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={() => handleDuplicate(editingPost.id)}
                className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
              >
                <Copy className="h-3.5 w-3.5" /> {t("customer.text.336")}
              </button>
              <button
                type="button"
                onClick={saveEditedPost}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2 text-xs font-bold text-white"
              >
                <Save className="h-3.5 w-3.5" /> {t("customer.text.337")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
