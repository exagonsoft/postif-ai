import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { Users, Check, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Solutions for Agencies — Multi-Brand Workspaces & Client Approvals",
};

export default function AgenciesSolutionPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
          <Users className="h-3.5 w-3.5 text-cyan-400" />
          Solutions for Marketing Agencies & Multi-Brand Teams
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Manage 15+ Client Brands With Strict Isolation & Role-Based Approvals
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          Keep every client’s brand profile, social tokens, content calendar, and AI billing mode
          completely isolated while your team collaborates across Owner, Admin, Editor, Approver,
          and Viewer roles.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Client Approval Portals",
              desc: "Assign clients the Approver role so they can review AI-drafted posts and sign off before anything schedules.",
            },
            {
              title: "Configurable BYOK or Managed AI",
              desc: "Use your agency's master OpenAI API key across all client brands or allocate managed credit pools per workspace.",
            },
            {
              title: "Exportable Performance Reports",
              desc: "Generate clean CSV and JSON performance reports segmented by client brand, campaign, and social channel.",
            },
          ].map((item) => (
            <div key={item.title} className="surface-card rounded-3xl p-6">
              <Check className="h-5 w-5 text-violet-400" />
              <h2 className="mt-3 text-lg font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/app/workspaces"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white"
          >
            Explore Agency Workspace Management <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
