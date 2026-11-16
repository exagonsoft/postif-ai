"use client";

import { useAppLanguage } from "@/i18n/provider";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function AccountActionForm({ purpose }: { purpose: "verify_email" | "reset_password" }) {
  const { t } = useAppLanguage();
  const token = useRef("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token.current) token.current = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: purpose, token: token.current, ...(purpose === "reset_password" ? { password } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("public.accountActionForm.text01"));
      token.current = "";
      setPassword("");
      setMessage(purpose === "reset_password" ? t("public.accountActionForm.text02") : t("public.accountActionForm.text03"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("public.accountActionForm.text01"));
    } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md space-y-5 px-4 py-16">
    <h1 className="text-2xl font-bold">{purpose === "reset_password" ? t("public.accountActionForm.text04") : t("public.accountActionForm.text05")}</h1>
    <form onSubmit={submit} className="space-y-4">
      {purpose === "reset_password" && <label className="block">{t("public.accountActionForm.text06")}<input required type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} className="elevated-card mt-2 w-full rounded-xl p-3" /></label>}
      <button disabled={busy} className="rounded-xl bg-violet-600 px-5 py-3 font-bold">{busy ? t("public.accountActionForm.text07") : t("public.accountActionForm.confirm")}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <Link href={purpose === "reset_password" ? "/login" : "/app/workspaces"} className="block text-cyan-400">{t("public.accountActionForm.text08")}</Link>
  </main>;
}
