"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import {
  CheckCircle2,
  Send,
  Copy,
  Trash2,
  Bot,
  Search,
  CalendarClock,
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
}

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-slate-500/20 text-slate-300",
  pending_approval: "bg-amber-500/20 text-amber-300",
  approved: "bg-indigo-500/20 text-indigo-300",
  scheduled: "bg-cyan-500/20 text-cyan-300",
  publishing: "bg-violet-500/20 text-violet-300",
  published: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-rose-500/20 text-rose-300",
  cancelled: "bg-slate-600/20 text-slate-400",
};

export function PostsManagerClient({ posts }: { posts: PostRecord[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

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
        toast("Action blocked", data.error || "Could not update post.", "error");
        return;
      }
      toast("Post updated", `Applied '${extra?.status || action}' successfully.`);
      router.refresh();
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
              {st.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts..."
            className="elevated-card w-full rounded-xl py-2 pl-9 pr-3 text-xs"
          />
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="surface-card rounded-3xl p-10 text-center text-sm text-[var(--text-secondary)]">
            No posts match the current filter.
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
                    {post.status.replace("_", " ")}
                  </span>
                  <span className="text-xs font-semibold text-cyan-400">
                    {post.platforms.map((pl) => pl.toUpperCase()).join(" • ")}
                  </span>
                  {post.createdByAgent && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                      <Bot className="h-3 w-3" /> AI Agent
                    </span>
                  )}
                </div>

                <h3 className="mt-2 text-base font-extrabold">{post.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {post.baseContent}
                </p>
                {post.scheduledAt && (
                  <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                    Target Slot: {new Date(post.scheduledAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {post.status === "pending_approval" && (
                  <button
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => runPostAction(post.id, "update", { status: "approved" })}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                )}

                {(post.status === "draft" || post.status === "approved") && (
                  <button
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() =>
                      runPostAction(post.id, "update", {
                        status: "scheduled",
                        scheduledAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-xl bg-violet-600/20 px-3 py-2 text-xs font-bold text-violet-300 hover:bg-violet-600/30"
                  >
                    <CalendarClock className="h-3.5 w-3.5" /> Schedule
                  </button>
                )}

                {post.status !== "published" && (
                  <button
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => runPostAction(post.id, "update", { status: "published" })}
                    className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30"
                  >
                    <Send className="h-3.5 w-3.5" /> Publish Now
                  </button>
                )}

                <button
                  type="button"
                  disabled={busyId === post.id}
                  onClick={() => runPostAction(post.id, "duplicate")}
                  className="elevated-card inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold"
                  title="Duplicate post"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </button>

                <button
                  type="button"
                  disabled={busyId === post.id}
                  onClick={() => runPostAction(post.id, "delete")}
                  className="elevated-card inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-rose-400 hover:border-rose-500/40"
                  title="Delete post"
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
