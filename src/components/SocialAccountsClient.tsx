"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "@/lib/social-adapters";
import { Plus, RefreshCw, Unplug, ShieldCheck } from "lucide-react";
import { SOCIAL_LIFECYCLE_CAPABILITIES } from "@/lib/social-capabilities";

interface AccountDTO {
  id: number; platform: string; accountName: string; handle: string; accountType: string;
  status: string; integrationMode: string; lastError: string | null;
  renewalStatus?: string; renewalMessage?: string | null; analyticsStatus?: string; analyticsMessage?: string | null;
}
export function SocialAccountsClient({ accounts, maxChannels, planName, canManage, callbackOrigin }: { accounts: AccountDTO[]; maxChannels: number; planName: string; canManage: boolean; callbackOrigin: string | null }) {
  const { t, formatNumber } = useAppLanguage();
  const displayStatus = (value: string) => ["connected","disconnected","expired","error","reconnect_required","not_supported","unsupported","not_configured","not_checked","synced","not_synced","available","unavailable","success","renewed","valid","paused","blocked","configured","not_due","no_scheduled_expiry","expiry_unknown","plan_required","action_needed","needs_review","private","unlisted","public","SELF_ONLY","MUTUAL_FOLLOW_FRIENDS","FOLLOWER_OF_CREATOR","PUBLIC_TO_EVERYONE"].includes(value) ? t(`customer.status.${value}`) : value;


  const router = useRouter();
  const { toast } = useToast();
  const [platform, setPlatform] = useState<SocialPlatform>("facebook");
  const [accessToken, setAccessToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [longLived, setLongLived] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [providerAccountId, setProviderAccountId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [apiVersion, setApiVersion] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [mediaDeclaration, setMediaDeclaration] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const spec = SOCIAL_PLATFORM_SPECS[platform];
  const inputClass = "elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm";
  async function submit(action: string, accountId?: number) {
    setBusy(true);
    try {
      const credentials = {
        accessToken,
        analyticsEnabled,
        ...(clientId ? { clientId: clientId.trim() } : {}),
        ...(clientSecret ? { clientSecret } : {}),
        ...(refreshToken ? { refreshToken } : {}),
        ...(longLived && ["instagram", "threads"].includes(platform) ? { tokenKind: "long_lived" } : {}),
        ...(providerAccountId ? { accountId: providerAccountId.trim() } : {}),
        ...(platform === "pinterest" ? { boardId: boardId.trim() } : {}),
        ...(apiVersion ? { apiVersion: apiVersion.trim() } : {}),
        ...(privacyLevel ? { privacyLevel } : {}),
        ...(platform === "youtube" && mediaDeclaration ? { madeForKids: mediaDeclaration === "yes" } : {}),
        ...(platform === "tiktok" && mediaDeclaration ? { aiGenerated: mediaDeclaration === "yes" } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      };
      if (action === "authorize") {
        const { accessToken: ignoredToken, ...settings } = credentials;
        void ignoredToken;
        const response = await fetch(`/api/social/oauth/${platform}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentials: settings }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || t("customer.text.613"));
        setClientSecret(""); setRefreshToken(""); setAccessToken("");
        window.location.assign(result.url);
        return;
      }
      const response = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "connect" ? { action, platform, credentials } : { action, accountId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("customer.text.614"));
      toast(action === "disconnect" ? t("customer.text.615") : t("customer.text.616"), action === "disconnect" ? t("customer.text.617") : t("customer.text.618"));
      if (action === "connect") { setAccessToken(""); setClientSecret(""); setRefreshToken(""); setProviderAccountId(""); setBoardId(""); setExpiresAt(""); }
      router.refresh();
    } catch (error) {
      toast(t("customer.text.619"), error instanceof Error ? error.message : t("customer.text.620"), "error");
    } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="surface-card rounded-3xl p-5 text-sm">
      <ShieldCheck className="mb-2 h-5 w-5 text-cyan-400" />
      {t("customer.text.621")}
      <p className="mt-2 text-xs text-[var(--text-muted)]">{t("customer.text.622")}</p>
      <p className="mt-2 font-semibold">{formatNumber(accounts.filter(account => account.status === "connected").length)} / {maxChannels} {t("customer.text.623")}{planName})</p>
    </div>
    {canManage && <form onSubmit={event => { event.preventDefault(); void submit("connect"); }} className="surface-card grid gap-4 rounded-3xl p-6 sm:grid-cols-2">
      <label className="text-xs font-bold">{t("customer.text.278")}
        <select className={inputClass} value={platform} onChange={event => { setPlatform(event.target.value as SocialPlatform); setAccessToken(""); setProviderAccountId(""); setPrivacyLevel(""); setMediaDeclaration(""); setApiVersion(""); setClientId(""); setClientSecret(""); setRefreshToken(""); setLongLived(false); setExpiresAt(""); setBoardId(""); }}>
          {Object.values(SOCIAL_PLATFORM_SPECS).map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold">{platform === "facebook" ? t("customer.text.625") : platform === "instagram" ? t("customer.text.626") : t("customer.text.627")}
        <input className={inputClass} value={providerAccountId} onChange={event => setProviderAccountId(event.target.value)} autoComplete="off" />
      </label>
      <label className="text-xs font-bold sm:col-span-2">{t("customer.text.628")}{" "} {platform === "facebook" ? t("customer.text.629") : ""}
        <input required type="password" className={inputClass} value={accessToken} onChange={event => setAccessToken(event.target.value)} autoComplete="new-password" spellCheck={false} />
      </label>
      <div className="text-xs sm:col-span-2">
        <p>{t(`customer.provider.${platform}.renewal`)}</p>
        <p className="mt-1">{t("customer.text.630")}{" "} {t(`customer.provider.${platform}.analytics`)}</p>
        <a className="underline" href={SOCIAL_LIFECYCLE_CAPABILITIES[platform].docs} target="_blank" rel="noreferrer">{t("customer.text.631")}</a>
        {SOCIAL_LIFECYCLE_CAPABILITIES[platform].oauth && <p className="mt-1">{callbackOrigin ? t("customer.registerCallback", { url: `${callbackOrigin}/api/social/oauth/${platform}/callback` }) : t("customer.text.632")} {t("customer.text.633")}</p>}
      </div>
      {SOCIAL_LIFECYCLE_CAPABILITIES[platform].oauth && <>
        <label className="text-xs font-bold">{t("customer.text.634")}<input className={inputClass} value={clientId} onChange={event => setClientId(event.target.value)} autoComplete="off" /></label>
        <label className="text-xs font-bold">{t("customer.text.635")}{" "} {platform === "x" ? t("customer.text.636") : ""}<input type="password" className={inputClass} value={clientSecret} onChange={event => setClientSecret(event.target.value)} autoComplete="new-password" /></label>
        <label className="text-xs font-bold sm:col-span-2">{t("customer.text.637")}<input type="password" className={inputClass} value={refreshToken} onChange={event => setRefreshToken(event.target.value)} autoComplete="new-password" /></label>
        <label className="text-xs sm:col-span-2"><input type="checkbox" checked={analyticsEnabled} onChange={event => setAnalyticsEnabled(event.target.checked)} /> {t("customer.text.638")}</label>
      </>}
      {["instagram", "threads"].includes(platform) && <label className="text-xs sm:col-span-2"><input type="checkbox" checked={longLived} onChange={event => setLongLived(event.target.checked)} /> {t("customer.text.639")}</label>}
      {platform === "pinterest" && <label className="text-xs font-bold">{t("customer.text.640")}<input required className={inputClass} value={boardId} onChange={event => setBoardId(event.target.value)} /></label>}
      {["linkedin", "facebook", "instagram"].includes(platform) && <label className="text-xs font-bold">{t("customer.text.641")}{" "} {platform === "linkedin" ? t("customer.text.642") : t("customer.text.643")}
        <input required={platform === "linkedin"} className={inputClass} value={apiVersion} onChange={event => setApiVersion(event.target.value)} />
      </label>}
      {["youtube", "tiktok"].includes(platform) && <label className="text-xs font-bold">{platform === "youtube" ? t("customer.text.644") : t("customer.text.645")}
        <select required className={inputClass} value={mediaDeclaration} onChange={event => setMediaDeclaration(event.target.value)}>
          <option value="">{t("customer.text.646")}</option><option value="yes">{t("customer.text.647")}</option><option value="no">{t("customer.text.648")}</option>
        </select>
        <span className="mt-1 block font-normal">{t("customer.text.649")}</span>
      </label>}
      {["youtube", "tiktok"].includes(platform) && <label className="text-xs font-bold">{t("customer.text.650")}
        <select required className={inputClass} value={privacyLevel} onChange={event => setPrivacyLevel(event.target.value)}>
          <option value="">{t("customer.text.651")}</option>
          {(platform === "youtube" ? ["private", "unlisted", "public"] : ["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE"]).map(value => <option key={value} value={value}>{displayStatus(value)}</option>)}
        </select>
      </label>}
      <label className="text-xs font-bold">{t("customer.text.656")}<input type="datetime-local" className={inputClass} value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
      <div className="text-xs text-[var(--text-secondary)] sm:col-span-2"><p>{t(`customer.provider.${platform}.notes`)}</p><p className="mt-1">{t("customer.text.657")}{" "} {spec.officialScopes.join(", ")}</p></div>
      <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 p-3 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{t("customer.text.658")}</button>
      {SOCIAL_LIFECYCLE_CAPABILITIES[platform].oauth && <button type="button" disabled={busy || !clientId || (platform !== "x" && !clientSecret) || !callbackOrigin} onClick={() => void submit("authorize")} className="rounded-xl border p-3 text-sm font-bold disabled:opacity-50">{t("customer.text.659")}</button>}
    </form>}
    {!accounts.length && <div className="surface-card rounded-3xl p-8 text-center text-sm text-[var(--text-muted)]">{t("customer.text.660")}</div>}
    <div className="grid gap-4 md:grid-cols-2">{accounts.map(account => <div key={account.id} className="surface-card space-y-3 rounded-3xl p-6">
      <h2 className="font-bold">{account.accountName}</h2><p className="text-sm">{account.handle} · {account.platform}</p>
      <p className="text-xs">{account.integrationMode === "customer_credentials" ? t("customer.text.661") : t("customer.text.662")} · {displayStatus(account.status)}</p>
      {account.lastError && <p className="text-xs text-amber-400">{account.lastError}</p>}
      <p className="text-xs">{t("customer.text.663")}{" "} {account.renewalStatus ? displayStatus(account.renewalStatus) : t("customer.text.664")}{account.renewalMessage ? ` — ${account.renewalMessage}` : ""}</p>
      <p className="text-xs">{t("customer.text.630")}{" "} {account.analyticsStatus ? displayStatus(account.analyticsStatus) : t("customer.text.666")}{account.analyticsMessage ? ` — ${account.analyticsMessage}` : ""}</p>
      {canManage && <div className="flex gap-4">
        <button disabled={busy} onClick={() => void submit("refresh", account.id)} className="inline-flex items-center gap-1 text-xs"><RefreshCw className="h-4 w-4" />{t("customer.text.667")}</button>
        {account.platform !== "facebook" && <button disabled={busy} onClick={() => void submit("renew", account.id)} className="text-xs">{t("customer.text.668")}</button>}
        <button disabled={busy} onClick={() => void submit("disconnect", account.id)} className="inline-flex items-center gap-1 text-xs text-rose-400"><Unplug className="h-4 w-4" />{t("customer.text.669")}</button>
      </div>}
    </div>)}</div>
  </div>;
}
