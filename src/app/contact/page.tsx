"use client";

import React, { useState } from "react";
import { PublicShell } from "@/components/PublicShell";
import { useToast } from "@/components/ToastProvider";
import { Mail, Building2, CheckCircle2 } from "lucide-react";

export default function ContactPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    toast("Inquiry received", "ExagonSoft enterprise specialists will respond within 1 business day.");
  };

  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400">
            <Mail className="h-3.5 w-3.5" />
            Contact ExagonSoft & POSTIF-AI Support
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Get in Touch</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)] sm:text-base">
            Questions about custom Agency seats, enterprise OAuth deployments, or BYOK security?
          </p>
        </div>

        <div className="surface-card mt-10 rounded-3xl p-8">
          {submitted ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <h2 className="mt-4 text-2xl font-extrabold">Message Sent to ExagonSoft</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Thank you, {name || "there"}. We have logged your inquiry for {company || "your team"} and will follow up at {email}.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Full Name
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Mercer"
                    className="elevated-card mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Work Email
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="elevated-card mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Company / Agency Name
                </label>
                <div className="relative mt-1.5">
                  <Building2 className="absolute left-3.5 top-3 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Northstar Digital"
                    className="elevated-card w-full rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  How Can We Help?
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your brands, channels, and automation objectives..."
                  className="elevated-card mt-1.5 w-full rounded-xl p-4 text-sm focus:border-violet-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3.5 text-sm font-bold text-white shadow-lg"
              >
                Send Message
              </button>
            </form>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
