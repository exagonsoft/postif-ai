import React from "react";
import { NotificationSettings } from "@/components/NotificationSettings";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ShieldCheck, KeyRound, Server, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace || !ctx.user) {
    redirect("/login");
  }

  const envChecks = [
    {
      name: "MongoDB Persistence",
      status: Boolean(process.env.MONGODB_URI) ? "Operational" : "Unconfigured",
      active: Boolean(process.env.MONGODB_URI),
    },
    {
      name: "Managed OpenAI API Key (OPENAI_API_KEY)",
      status: process.env.OPENAI_API_KEY ? "Configured (provider access required)" : "Not configured; use BYOK",
      active: Boolean(process.env.OPENAI_API_KEY),
    },
    {
      name: "Paid Checkout",
      status: "Not available",
      active: false,
    },
    {
      name: "Social Platform Credentials",
      status: "Customer-owned; configure per account",
      active: true,
    },
  ];

  return (
    <div className="space-y-8">
      <NotificationSettings />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Account, Security & Environment Architecture
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
          Inspect user session details, credential vault security, and runtime integration status.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card space-y-4 rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-extrabold">User & Workspace Profile</h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">Full Name</span>
              <span className="font-bold">{ctx.user.name}</span>
            </div>
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">Email Address</span>
              <span className="font-bold">{ctx.user.email}</span>
            </div>
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">Workspace Role</span>
              <span className="font-bold uppercase text-cyan-400">{ctx.memberRole}</span>
            </div>
            <div className="elevated-card flex justify-between rounded-xl p-3">
              <span className="text-[var(--text-muted)]">System Access Level</span>
              <span className="font-bold uppercase text-violet-400">
                {ctx.user.systemRole}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/app/billing"
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white"
            >
              <KeyRound className="h-3.5 w-3.5" /> Configure BYOK OpenAI Vault
            </Link>
            <Link
              href="/app/workspaces"
              className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
            >
              Export Workspace Data <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Operational vs Simulated Runtime Status */}
        <div className="surface-card space-y-4 rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-extrabold">
              Runtime Integration & Environment Readiness
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Services require real configuration. Social credentials are managed per workspace/account, not through shared server keys.
          </p>

          <div className="space-y-2.5">
            {envChecks.map((item) => (
              <div
                key={item.name}
                className="elevated-card flex items-center justify-between rounded-xl p-3 text-xs"
              >
                <span className="font-semibold">{item.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    item.active
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>


    </div>
  );
}
