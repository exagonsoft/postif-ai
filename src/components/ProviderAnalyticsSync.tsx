"use client";
import { useAppLanguage } from "@/i18n/provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ProviderAnalyticsSync() {
  const { t, formatNumber } = useAppLanguage();

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function sync() {
    setBusy(true);
    try {
      const response = await fetch("/api/analytics/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      setMessage(response.ok ? t("customer.syncResult", { processed: formatNumber(result.processed), skipped: formatNumber(result.skipped) }) : result.error || t("customer.text.608"));
      router.refresh();
    } catch { setMessage(t("customer.text.609")); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2"><button disabled={busy} onClick={() => void sync()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? t("customer.text.610") : t("customer.text.611")}</button><p role="status" className="text-xs">{message}</p></div>;
}
