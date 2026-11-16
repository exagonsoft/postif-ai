import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { Bot, Check, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Solutions for Small Businesses — Autonomous Marketing Team in a Box",
};

export default function SmallBusinessSolutionPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400">
          <Bot className="h-3.5 w-3.5" />
          Solutions for Small Businesses & Lean Growth Teams
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Enterprise-Grade Social Presence Without Hiring a Full Agency
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          Run AI Brand Discovery on your website, approve weekly content plans in five minutes, and
          let Assisted or Autopilot mode maintain consistent customer acquisition across every
          channel.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "AI Brand Discovery Onboarding",
              desc: "Enter your website URL and POSTIF-AI extracts your products, ICP, brand voice, content pillars, and starter hashtags.",
            },
            {
              title: "4-Week Campaign Architect",
              desc: "Describe a product launch or seasonal promo and get a structured multi-week calendar with ready-to-publish drafts.",
            },
            {
              title: "Grounded ROI Recommendations",
              desc: "See which content pillars drive clicks and engagement so your team doubles down on what converts.",
            },
          ].map((item) => (
            <div key={item.title} className="surface-card rounded-3xl p-6">
              <Check className="h-5 w-5 text-cyan-400" />
              <h2 className="mt-3 text-lg font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white"
          >
            Create a Free Business Account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
