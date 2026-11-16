"use client";

import Link from "next/link";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";

export function LandingInteractive() {
  return <section className="mx-auto max-w-7xl space-y-6 px-4 py-16">
    <h2 className="text-center text-3xl font-extrabold">Your accounts. Your credentials. Your workflow.</h2>
    <p className="mx-auto max-w-3xl text-center text-[var(--text-secondary)]">Create content from your brand brief, review each platform&apos;s copy and attachments, then schedule delivery to accounts you authorize. No sample workspace or fabricated metrics.</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Object.values(SOCIAL_PLATFORM_SPECS).map(platform => <div key={platform.id} className="surface-card rounded-2xl p-5"><h3 className="font-bold">{platform.name}</h3><p className="mt-2 text-xs text-[var(--text-secondary)]">{platform.apiNotes}</p></div>)}</div>
    <div className="surface-card space-y-3 rounded-2xl p-6 text-sm">
      <h3 className="font-bold">How connections work</h3>
      <p>You supply platform-issued access tokens for your own accounts. Credentials are encrypted per workspace; platform permissions, account eligibility, API access, and provider approval still apply. Expired tokens must be replaced.</p>
      <p>Text and media generation require a configured provider. Publishing status is based on provider responses, not a local simulation. Paid checkout and automated password recovery are not available yet.</p>
    </div>
  </section>;
}

export function HeroDashboardPreview() {
  return <div className="surface-card mx-auto mt-12 max-w-4xl rounded-3xl p-8 text-left">
    <h2 className="text-xl font-bold">Start with your own workspace</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">{["Configure your brand", "Connect your accounts", "Create, review, and schedule"].map((step, index) => <div key={step} className="elevated-card rounded-2xl p-5"><span className="text-xs text-cyan-400">Step {index + 1}</span><p className="mt-2 text-sm font-semibold">{step}</p></div>)}</div>
    <p className="mt-5 text-sm text-[var(--text-secondary)]">Your calendar and reporting start empty and reflect your stored content and actual delivery results.</p>
    <Link href="/register" className="mt-5 inline-block rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white">Create your account</Link>
  </div>;
}
