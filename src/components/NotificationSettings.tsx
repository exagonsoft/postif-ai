"use client";
import { useEffect, useState } from "react";

export function NotificationSettings() {
  const [preferences, setPreferences] = useState({ onsite: true, email: false, push: false });
  const [readiness, setReadiness] = useState({ email: false, push: false });
  const [publicKey, setPublicKey] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/notification-settings").then(async response => {
      if (!response.ok) throw new Error("Unable to load notification settings.");
      const data = await response.json();
      setPreferences(data.preferences); setReadiness(data.readiness); setPublicKey(data.publicKey); setReady(true);
    }).catch(error => setMessage(error.message));
  }, []);
  async function save() {
    setBusy(true); setMessage("");
    try {
      if (preferences.push && readiness.push) {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support push notifications. Choose email or on-site notifications.");
        if (await Notification.requestPermission() !== "granted") throw new Error("Push permission was not granted. Enable it in your browser or turn off push.");
        await navigator.serviceWorker.register("/notifications-sw.js");
        const registration = await navigator.serviceWorker.ready;
        const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from(decoded, char => char.charCodeAt(0));
        const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const response = await fetch("/api/notification-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }) });
        if (!response.ok) throw new Error("Could not register this browser for push.");
      }
      const response = await fetch("/api/notification-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      if (!response.ok) throw new Error("Could not save notification settings.");
      setMessage("Preferences saved." + ((preferences.email && !readiness.email) || (preferences.push && !readiness.push) ? " Some channels will become available when the administrator finishes setup." : ""));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save."); }
    finally { setBusy(false); }
  }
  return <section className="surface-card space-y-4 rounded-3xl p-6">
    <h2 className="text-lg font-bold">Where should we notify you?</h2>
    <p className="text-sm text-[var(--text-secondary)]">Choose any combination for review requests and publishing updates. Whether to review before publishing is chosen separately for each post.</p>
    <div className="grid gap-3 sm:grid-cols-3">{([ ["onsite", "On site"], ["email", "Email"], ["push", "Browser push"] ] as const).map(([key, label]) => <label key={key} className="elevated-card rounded-xl p-4">
      <input type="checkbox" checked={preferences[key]} disabled={!ready || busy} onChange={event => setPreferences({ ...preferences, [key]: event.target.checked })} className="mr-2 accent-violet-600" />{label}
      {key !== "onsite" && !readiness[key] && <span className="mt-2 block text-xs text-amber-400">Service setup pending</span>}
    </label>)}</div>
    <button disabled={!ready || busy} onClick={save} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save notification preferences"}</button>
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
