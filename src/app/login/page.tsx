"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/components/ToastProvider";
import { Sparkles, ArrowRight, KeyRound, Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("alex.mercer@nebulacloud.io");
  const [password, setPassword] = useState("DemoUser123!");
  const [loading, setLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("Login failed", data.error || "Check your credentials", "error");
        return;
      }
      toast("Welcome back to POSTIF-AI", "Loading your command center...");
      router.push(data.redirectTo || "/app");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demo_login" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Demo session activated", "Exploring NebulaCloud AI & Exagon Agency workspaces.");
        router.push(data.redirectTo || "/app");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "recover_password", email: recoveryEmail }),
    });
    const data = await res.json();
    if (res.ok) {
      toast("Recovery email queued", data.message, "info");
      setRecoveryOpen(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <BrandLogo href="/" showByline />
      </div>

      <div className="surface-card w-full max-w-md rounded-3xl p-8 shadow-2xl">
        <h1 className="text-2xl font-extrabold">Sign in to Command Center</h1>
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
          Manage your social channels, AI Content Studio, and Autonomous Marketing Agent.
        </p>

        {/* One-Click Demo Button */}
        <button
          type="button"
          disabled={loading}
          onClick={handleDemoLogin}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/25 transition-all hover:opacity-95 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          Launch Interactive Demo Workspace
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
          <span>or sign in with email</span>
          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Email Address
            </label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="elevated-card w-full rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Password
              </label>
              <button
                type="button"
                onClick={() => setRecoveryOpen((v) => !v)}
                className="text-xs font-semibold text-cyan-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="elevated-card w-full rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="elevated-card flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors hover:border-violet-500/50 disabled:opacity-60"
          >
            Sign In <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Google OAuth Status Disclosure */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() =>
              toast(
                "Google OAuth Adapter",
                "Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables to enable live Google SSO.",
                "info"
              )
            }
            className="elevated-card flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
            Continue with Google OAuth (Sandbox Config)
          </button>
        </div>

        {recoveryOpen && (
          <form
            onSubmit={handleRecovery}
            className="elevated-card mt-5 space-y-3 rounded-2xl p-4"
          >
            <div className="text-xs font-bold">Password Recovery</div>
            <input
              type="email"
              required
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="Enter your account email"
              className="surface-card w-full rounded-xl px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-violet-600 py-2 text-xs font-bold text-white"
            >
              Send Reset Link
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          New to POSTIF-AI?{" "}
          <Link href="/register" className="font-bold text-cyan-400 hover:underline">
            Create an account & start onboarding
          </Link>
        </p>
      </div>
    </div>
  );
}
