import React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { Sparkles, Check, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Solutions for Creators — Scale Your Personal Brand Across Every Platform",
};

export default function CreatorsSolutionPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          Solutions for Solo Creators & Educators
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Turn One Deep Idea Into a Full Week of Native Content
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          Stop rewriting the same insight six times for X, LinkedIn, Instagram, TikTok, YouTube
          Shorts, and Threads. POSTIF-AI preserves your authentic voice while adapting length,
          hooks, and CTAs automatically.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Smart Blog & Video Repurposing",
              desc: "Paste a newsletter issue or YouTube script and extract threads, carousels, and short-form video hooks in seconds.",
            },
            {
              title: "Affordable Starter BYOK ($9/mo)",
              desc: "Plug in your own OpenAI API key to generate hundreds of drafts for pennies in direct token spend.",
            },
            {
              title: "Consistent Daily Cadence",
              desc: "Queue content across timezones with automated retries so you never miss peak engagement windows.",
            },
          ].map((item) => (
            <div key={item.title} className="surface-card rounded-3xl p-6">
              <Check className="h-5 w-5 text-emerald-400" />
              <h2 className="mt-3 text-lg font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white"
          >
            Launch Creator Workspace <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
