"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { SOCIAL_PLATFORM_SPECS, SocialPlatformSpec } from "@/lib/social-adapters";
import {
  Plus,
  RefreshCw,
  Unplug,
  ShieldCheck,
  AlertTriangle,
  Info,
} from "lucide-react";

interface AccountDTO {
  id: number;
  platform: string;
  accountName: string;
  handle: string;
  accountType: string;
  status: string;
  integrationMode: string;
  permissions: string[];
  rateLimitRemaining: number;
  rateLimitMax: number;
  followersCount: number;
  lastError: string | null;
}

export function SocialAccountsClient({
  accounts,
  maxChannels,
  planName,
}: {
  accounts: AccountDTO[];
  maxChannels: number;
  planName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedPlatform, setSelectedPlatform] =
    useState<SocialPlatformSpec["id"]>("facebook");
  const [accountName, setAccountName] = useState("");
  const [handle, setHandle] = useState("");
  const [connecting, setConnecting] = useState(false);

  const connectedCount = accounts.filter((a) => a.status === "connected").length;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          platform: selectedPlatform,
          accountName,
          handle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Connection blocked", data.error || "Channel limit reached.", "error");
        return;
      }
      toast(
        "Social adapter connected",
        `${data.account.accountName} initialized in ${data.readiness.modeLabel}.`
      );
      setAccountName("");
      setHandle("");
      router.refresh();
    } finally {
      setConnecting(false);
    }
  };

  const handleRefresh = async (accountId: number) => {
    const res = await fetch("/api/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh", accountId }),
    });
    if (res.ok) {
      toast("Token & rate limits refreshed", "Adapter heartbeat verified.");
      router.refresh();
    }
  };

  const handleDisconnect = async (accountId: number) => {
    const res = await fetch("/api/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect", accountId }),
    });
    if (res.ok) {
      toast("Channel disconnected", "Revoked local publishing adapter.");
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      {/* Transparent Integration Architecture Banner */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
          <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">
              Transparent OAuth 2.0 & Sandbox Architecture:
            </strong>{" "}
            Each platform runs through an isolated provider adapter enforcing official scopes,
            hourly rate limits, and media rules. Where external provider OAuth secrets are not
            configured in <code className="text-cyan-300">.env</code>, connections run transparently
            in <strong>Simulated Sandbox Mode</strong> without fabricating live external posts.
          </div>
        </div>
        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-extrabold text-violet-300">
          {connectedCount} / {maxChannels} Active Channels ({planName})
        </span>
      </div>

      {/* Connect New Account Card */}
      <form
        onSubmit={handleConnect}
        className="surface-card grid gap-4 rounded-3xl p-6 md:grid-cols-12 md:items-end"
      >
        <div className="md:col-span-3">
          <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
            Social Network Adapter
          </label>
          <select
            value={selectedPlatform}
            onChange={(e) =>
              setSelectedPlatform(e.target.value as SocialPlatformSpec["id"])
            }
            className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-xs font-bold"
          >
            {Object.values(SOCIAL_PLATFORM_SPECS).map((spec) => (
              <option key={spec.id} value={spec.id}>
                {spec.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4">
          <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
            Account / Page Display Name
          </label>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="e.g., NebulaCloud Official Page"
            className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-xs"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
            Handle / Channel ID
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@nebulacloud"
            className="elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-xs"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={connecting}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 py-2.5 text-xs font-extrabold text-white shadow-lg"
          >
            <Plus className="h-4 w-4" /> Connect
          </button>
        </div>
      </form>

      {/* Connected Accounts Grid */}
      <div className="grid gap-5 md:grid-cols-2">
        {accounts.map((acc) => {
          const spec =
            SOCIAL_PLATFORM_SPECS[acc.platform as SocialPlatformSpec["id"]] ||
            SOCIAL_PLATFORM_SPECS.linkedin;

          return (
            <div key={acc.id} className="surface-card flex flex-col justify-between rounded-3xl p-6">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-extrabold text-slate-950"
                      style={{ backgroundColor: spec.accentColor }}
                    >
                      {spec.shortLabel}
                    </div>
                    <div>
                      <div className="text-base font-extrabold">{acc.accountName}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {acc.handle} • {spec.name} ({acc.accountType})
                      </div>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      acc.status === "connected"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : acc.status === "needs_review"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-slate-600/20 text-slate-400"
                    }`}
                  >
                    {acc.status.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/10 px-2.5 py-1 font-semibold text-cyan-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {acc.integrationMode === "oauth_live"
                      ? "OAuth 2.0 Live"
                      : "Simulated Sandbox Adapter"}
                  </span>
                  <span className="rounded-lg bg-violet-500/10 px-2.5 py-1 font-semibold text-violet-300">
                    Rate Limit: {acc.rateLimitRemaining}/{acc.rateLimitMax}/hr
                  </span>
                  <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-semibold text-slate-300">
                    {acc.followersCount.toLocaleString()} followers
                  </span>
                </div>

                <p className="mt-3 text-xs text-[var(--text-secondary)]">{spec.apiNotes}</p>

                {acc.permissions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {acc.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-400"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                )}

                {acc.lastError && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{acc.lastError}</span>
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
                <button
                  type="button"
                  onClick={() => handleRefresh(acc.id)}
                  className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold hover:border-cyan-500/40"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-cyan-400" /> Refresh Token
                </button>

                {acc.status !== "disconnected" && (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(acc.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10"
                  >
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
