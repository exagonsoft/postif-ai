"use client";

import { useAppLanguage } from "@/i18n/provider";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/components/ToastProvider";
import { resolveLoginRedirect } from "@/lib/login-redirect";

export default function LoginPage() {
  const { t } = useAppLanguage();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function recoverPassword() {
    if (!email.trim()) { toast(t("public.login.text01"), t("public.login.text02"), "error"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recover_password", email }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("public.login.text03"));
      toast(t("public.login.text04"), t("public.login.recoverySent"));
    } catch (error) {
      toast(t("public.login.text05"), error instanceof Error ? error.message : t("public.login.text06"), "error");
    } finally { setLoading(false); }
  }
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("public.login.text07"));
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(resolveLoginRedirect(result.redirectTo, next));
      router.refresh();
    } catch (error) {
      toast(t("public.login.text08"), error instanceof Error ? error.message : t("public.login.text09"), "error");
    } finally { setLoading(false); }
  }
  return <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
    <div className="mb-8"><BrandLogo href="/" showByline /></div>
    <div className="surface-card w-full max-w-md rounded-3xl p-8">
      <h1 className="text-2xl font-extrabold">{t("public.login.text10")}</h1>
      <form onSubmit={login} className="mt-6 space-y-4">
        <label className="block text-xs font-bold">{t("public.login.text11")}<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="elevated-card mt-2 w-full rounded-xl p-3 text-sm" /></label>
        <label className="block text-xs font-bold">{t("public.login.text12")}<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="elevated-card mt-2 w-full rounded-xl p-3 text-sm" /></label>
        <button disabled={loading} className="w-full rounded-xl bg-violet-600 p-3 text-sm font-bold text-white disabled:opacity-50">{t("public.login.text13")}</button>
      </form>
      <button type="button" disabled={loading} onClick={recoverPassword} className="mt-5 text-xs text-cyan-400">{t("public.login.text14")}</button>
      <p className="mt-6 text-center text-sm">{t("public.login.text15")}{" "}<Link href="/register" className="text-cyan-400">{t("public.login.text16")}</Link></p>
    </div>
  </div>;
}
