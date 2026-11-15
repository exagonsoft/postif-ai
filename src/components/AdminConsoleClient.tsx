"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { ToggleLeft, ToggleRight, ShieldAlert } from "lucide-react";

interface FlagItem {
  id: number;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface AuditItem {
  id: number;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

export function AdminConsoleClient({
  flags,
  auditLogs,
}: {
  flags: FlagItem[];
  auditLogs: AuditItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const toggleFlag = async (flag: FlagItem) => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_flag",
        flagId: flag.id,
        enabled: !flag.enabled,
      }),
    });
    if (res.ok) {
      toast(
        "Feature flag updated",
        `${flag.name} is now ${!flag.enabled ? "ENABLED" : "DISABLED"}.`
      );
      router.refresh();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Feature Flags */}
      <div className="surface-card space-y-4 rounded-3xl p-6 lg:col-span-5">
        <div className="flex items-center gap-2 text-rose-400">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="text-base font-extrabold text-[var(--text-primary)]">
            Platform Feature Flags
          </h2>
        </div>

        <div className="space-y-3">
          {flags.map((f) => (
            <div
              key={f.id}
              className="elevated-card flex items-start justify-between gap-3 rounded-2xl p-4"
            >
              <div>
                <div className="text-xs font-extrabold">{f.name}</div>
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{f.description}</p>
                <code className="mt-1 inline-block text-[10px] text-cyan-400">{f.key}</code>
              </div>
              <button
                type="button"
                onClick={() => toggleFlag(f)}
                className="shrink-0 text-violet-400"
                aria-label={`Toggle ${f.name}`}
              >
                {f.enabled ? (
                  <ToggleRight className="h-7 w-7 text-emerald-400" />
                ) : (
                  <ToggleLeft className="h-7 w-7 text-slate-500" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* System Audit Logs */}
      <div className="surface-card rounded-3xl p-6 lg:col-span-7">
        <h2 className="text-base font-extrabold">Global Operator Audit Logs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[11px] uppercase text-[var(--text-muted)]">
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Resource</th>
                <th className="py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 pr-3 font-semibold">{log.actorEmail}</td>
                  <td className="py-2.5 pr-3 font-mono text-cyan-400">{log.action}</td>
                  <td className="py-2.5 pr-3">
                    {log.resourceType} #{log.resourceId}
                  </td>
                  <td className="py-2.5 text-[var(--text-muted)]">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
