"use client";

import { useState } from "react";
import { useToast } from "./ToastProvider";

export function VerifyEmailNotice() {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  async function request() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_verification" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Verification email could not be sent.");
      toast("Check your email", "Open the verification link to confirm your address.");
    } catch (error) {
      toast("Email verification unavailable", error instanceof Error ? error.message : "Try again later.", "error");
    } finally { setBusy(false); }
  }
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 p-4 text-sm">
    <span>Verify your email before accepting workspace invitations.</span>
    <button type="button" disabled={busy} onClick={request} className="font-bold text-cyan-300">{busy ? "Sending..." : "Send verification email"}</button>
  </div>;
}
