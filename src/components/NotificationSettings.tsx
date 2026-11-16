"use client";
import { useAppLanguage } from "@/i18n/provider";
import { useEffect, useState } from "react";

export function NotificationSettings() {
  const { t } = useAppLanguage();

  const [preferences, setPreferences] = useState({ onsite: true, email: false, push: false });
  const [readiness, setReadiness] = useState({ email: false, push: false });
  const [publicKey, setPublicKey] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/notification-settings").then(async response => {
      if (!response.ok) throw new Error(t("customer.text.479"));
      const data = await response.json();
      setPreferences(data.preferences); setReadiness(data.readiness); setPublicKey(data.publicKey); setReady(true);
    }).catch(error => setMessage(error.message));
  }, [t]);
  async function save() {
    setBusy(true); setMessage("");
    try {
      if (preferences.push && readiness.push) {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error(t("customer.text.482"));
        if (await Notification.requestPermission() !== "granted") throw new Error(t("customer.text.483"));
        await navigator.serviceWorker.register("/notifications-sw.js");
        const registration = await navigator.serviceWorker.ready;
        const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from(decoded, char => char.charCodeAt(0));
        const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const response = await fetch("/api/notification-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }) });
        if (!response.ok) throw new Error(t("customer.text.484"));
      }
      const response = await fetch("/api/notification-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      if (!response.ok) throw new Error(t("customer.text.485"));
      setMessage(t("customer.text.486") + ((preferences.email && !readiness.email) || (preferences.push && !readiness.push) ? t("customer.text.487") : ""));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("customer.text.488")); }
    finally { setBusy(false); }
  }
  return <section className="surface-card space-y-4 rounded-3xl p-6">
    <h2 className="text-lg font-bold">{t("customer.text.489")}</h2>
    <p className="text-sm text-[var(--text-secondary)]">{t("customer.text.490")}</p>
    <div className="grid gap-3 sm:grid-cols-3">{([ ["onsite", t("customer.text.491")], ["email", t("customer.text.492")], ["push", t("customer.text.493")] ] as const).map(([key, label]) => <label key={key} className="elevated-card rounded-xl p-4">
      <input type="checkbox" checked={preferences[key]} disabled={!ready || busy} onChange={event => setPreferences({ ...preferences, [key]: event.target.checked })} className="mr-2 accent-violet-600" />{label}
      {key !== "onsite" && !readiness[key] && <span className="mt-2 block text-xs text-amber-400">{t("customer.text.494")}</span>}
    </label>)}</div>
    <button disabled={!ready || busy} onClick={save} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? t("customer.text.495") : t("customer.text.496")}</button>
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
