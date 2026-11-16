"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/components/ToastProvider";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Check your credentials.");
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next === "/onboarding" || next === "/onboarding?mode=create" ? next : "/app");
      router.refresh();
    } catch (error) {
      toast("Login failed", error instanceof Error ? error.message : "The request failed.", "error");
    } finally { setLoading(false); }
  }
  return <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
    <div className="mb-8"><BrandLogo href="/" showByline /></div>
    <div className="surface-card w-full max-w-md rounded-3xl p-8">
      <h1 className="text-2xl font-extrabold">Sign in to your workspace</h1>
      <form onSubmit={login} className="mt-6 space-y-4">
        <label className="block text-xs font-bold">Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="elevated-card mt-2 w-full rounded-xl p-3 text-sm" /></label>
        <label className="block text-xs font-bold">Password<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="elevated-card mt-2 w-full rounded-xl p-3 text-sm" /></label>
        <button disabled={loading} className="w-full rounded-xl bg-violet-600 p-3 text-sm font-bold text-white disabled:opacity-50">Sign in</button>
      </form>
      <p className="mt-5 text-xs text-[var(--text-muted)]">For account recovery, contact your administrator. Automated password recovery is not available yet.</p>
      <p className="mt-6 text-center text-sm">New to POSTIF-AI? <Link href="/register" className="text-cyan-400">Create an account</Link></p>
    </div>
  </div>;
}
