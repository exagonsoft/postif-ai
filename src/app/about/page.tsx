import React from "react";
import { PublicShell } from "@/components/PublicShell";
import { ShieldCheck, Cpu, Server, Sparkles } from "lucide-react";

export const metadata = {
  title: "About POSTIF-AI — Developed by ExagonSoft",
};

export default function AboutPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          Product by ExagonSoft
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Engineering Autonomous Marketing Infrastructure
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          <strong>POSTIF-AI</strong> is designed and developed by <strong>ExagonSoft</strong> to
          bridge the gap between generative AI copywriting and reliable, auditable social media
          operations. Rather than treating AI as a disconnected chat box, POSTIF-AI embeds
          autonomous marketing agents directly inside a tenant-isolated publishing command center.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="surface-card rounded-3xl p-6">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <h2 className="mt-3 text-base font-bold">Human-in-the-Loop Safety</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Every autonomous agent mode enforces weekly limits, channel allowlists, approval
              gates, and immutable PostgreSQL audit logs.
            </p>
          </div>
          <div className="surface-card rounded-3xl p-6">
            <Cpu className="h-6 w-6 text-violet-400" />
            <h2 className="mt-3 text-base font-bold">Dual AI Economics</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Customers retain full freedom to bring their own OpenAI API keys (encrypted via
              AES-256-GCM) or run on Managed AI credits.
            </p>
          </div>
          <div className="surface-card rounded-3xl p-6">
            <Server className="h-6 w-6 text-cyan-400" />
            <h2 className="mt-3 text-base font-bold">Transparent Architecture</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              POSTIF-AI clearly distinguishes live OpenAI API executions from local sandbox
              simulations whenever external OAuth or API keys are unconfigured.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
