"use client";

import { useAppLanguage } from "@/i18n/provider";

import { useState } from "react";
import { useToast } from "./ToastProvider";

export function VerifyEmailNotice() {
  const { t } = useAppLanguage();
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  async function request() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_verification" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("public.verifyEmailNotice.text01"));
      toast(t("public.login.text04"), t("public.verifyEmailNotice.text02"));
    } catch (error) {
      toast(t("public.verifyEmailNotice.text03"), error instanceof Error ? error.message : t("public.login.text06"), "error");
    } finally { setBusy(false); }
  }
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 p-4 text-sm">
    <span>{t("public.verifyEmailNotice.text04")}</span>
    <button type="button" disabled={busy} onClick={request} className="font-bold text-cyan-300">{busy ? t("public.verifyEmailNotice.text05") : t("public.verifyEmailNotice.text06")}</button>
  </div>;
}
