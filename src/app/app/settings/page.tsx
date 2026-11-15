import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ShieldCheck, KeyRound, Bell, Server, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.workspace || !ctx.user) {
    redirect("/login");
  }

  const envChecks = [
    {
      name: "PostgreSQL Relational Persistence",
      status: Boolean(process.env.DATABASE_URL) ? "Operational" : "Unconfigured",
      active: Boolean(process.env.DATABASE_URL),
    },
    {
      name: "Managed OpenAI API Key (OPENAI_API_KEY)",
      status: process.env.OPENAI_API_KEY ? "Live Configured" : "Simulated Demo Mode",
      active: Boolean(process.env.OPENAI_API_KEY),
    },
    {
      name: "Stripe Billing Webhooks (STRIPE_SECRET_KEY)",
      status: process.env.STRIPE_SECRET_KEY ? "Live Configured" : "Simulated Sandbox",
      active: Boolean(process.env.STRIPE_SECRET_KEY),
    },
    {
      name: "Social OAuth 2.0 Provider Keys",
      status:
        process.env.LINKEDIN_CLIENT_ID || process.env.X_CLIENT_ID
          ? "Partial Live"
          : "Simulated Sandbox Adapters",
      active: Boolean(process.env.LINKEDIN_CLIENT_ID || process.env.X_CLIENT_ID),
    },
  ];

  return (
    <div className="space-y-8">
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
            POSTIF-AI transparently reports which infrastructure services are connected live versus
            running via local simulation adapters.
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

      {/* Transactional Notifications Architecture */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-violet-400" />
          <h2 className="text-base font-extrabold">Notification Events & Alert Triggers</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            "Successful & Failed Publications",
            "Approval Queue & Agent Proposals",
            "Low AI Credit Thresholds & Token Refresh",
          ].map((trigger) => (
            <label
              key={trigger}
              className="elevated-card flex items-center gap-2.5 rounded-2xl p-4 text-xs font-semibold"
            >
              <input type="checkbox" defaultChecked className="accent-violet-600" />
              <span>{trigger}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
