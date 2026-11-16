"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ProviderAnalyticsSync() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function sync() {
    setBusy(true);
    try {
      const response = await fetch("/api/analytics/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      setMessage(response.ok ? `${result.processed} accounts synchronized; ${result.skipped} skipped.` : result.error || "Synchronization could not finish.");
      router.refresh();
    } catch { setMessage("Synchronization unavailable. Please retry later."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2"><button disabled={busy} onClick={() => void sync()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Syncing…" : "Sync provider analytics"}</button><p role="status" className="text-xs">{message}</p></div>;
}
