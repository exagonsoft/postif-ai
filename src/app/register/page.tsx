"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/components/ToastProvider";
import { ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name,
          email,
          workspaceName,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Registration failed", data.error || "Please check your inputs.", "error");
        return;
      }
      toast("Account created!", "Launching the AI Brand Discovery Onboarding Wizard.");
      router.push(data.redirectTo || "/onboarding");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <BrandLogo href="/" showByline />
      </div>

      <div className="surface-card w-full max-w-md rounded-3xl p-8 shadow-2xl">
        <h1 className="text-2xl font-extrabold">Create Your POSTIF-AI Account</h1>
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
          Set up your workspace and let AI Brand Discovery build your initial content strategy.
        </p>

        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Your Full Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Taylor"
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
              placeholder="jordan@company.com"
              className="elevated-card mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Workspace Name
            </label>
            <input
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Acme Growth Studio"
              className="elevated-card mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Password (min 6 characters)
            </label>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="elevated-card mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
          >
            Continue to Brand Onboarding <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-cyan-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
