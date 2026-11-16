"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "@/lib/social-adapters";
import { Plus, RefreshCw, Unplug, ShieldCheck } from "lucide-react";

interface AccountDTO {
  id: number; platform: string; accountName: string; handle: string; accountType: string;
  status: string; integrationMode: string; lastError: string | null;
}
export function SocialAccountsClient({ accounts, maxChannels, planName, canManage }: { accounts: AccountDTO[]; maxChannels: number; planName: string; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [platform, setPlatform] = useState<SocialPlatform>("facebook");
  const [accessToken, setAccessToken] = useState("");
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
        ...(providerAccountId ? { accountId: providerAccountId.trim() } : {}),
        ...(platform === "pinterest" ? { boardId: boardId.trim() } : {}),
        ...(apiVersion ? { apiVersion: apiVersion.trim() } : {}),
        ...(privacyLevel ? { privacyLevel } : {}),
        ...(platform === "youtube" && mediaDeclaration ? { madeForKids: mediaDeclaration === "yes" } : {}),
        ...(platform === "tiktok" && mediaDeclaration ? { aiGenerated: mediaDeclaration === "yes" } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      };
      const response = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "connect" ? { action, platform, credentials } : { action, accountId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The provider could not verify this connection.");
      toast(action === "disconnect" ? "Connection removed" : "Account verified", action === "disconnect" ? "Stored credentials were deleted. Revoke the token with the provider if it is no longer needed." : "Your provider identity was verified. Publishing still requires the listed provider permissions.");
      if (action === "connect") { setAccessToken(""); setProviderAccountId(""); setBoardId(""); setExpiresAt(""); }
      router.refresh();
    } catch (error) {
      toast("Connection failed", error instanceof Error ? error.message : "The request failed.", "error");
    } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="surface-card rounded-3xl p-5 text-sm">
      <ShieldCheck className="mb-2 h-5 w-5 text-cyan-400" />
      Connect your own platform-issued access token. Credentials are encrypted per workspace/account and are never returned to the browser.
      No shared social-provider keys are required in the server environment. Do not enter your social account password.
      <p className="mt-2 text-xs text-[var(--text-muted)]">Tokens must have publishing permissions and the provider&apos;s required API access or approval. Replace expired tokens here; automatic OAuth renewal is not configured.</p>
      <p className="mt-2 font-semibold">{accounts.filter(account => account.status === "connected").length} / {maxChannels} connected channels ({planName})</p>
    </div>
    {canManage && <form onSubmit={event => { event.preventDefault(); void submit("connect"); }} className="surface-card grid gap-4 rounded-3xl p-6 sm:grid-cols-2">
      <label className="text-xs font-bold">Platform
        <select className={inputClass} value={platform} onChange={event => { setPlatform(event.target.value as SocialPlatform); setAccessToken(""); setProviderAccountId(""); setPrivacyLevel(""); setMediaDeclaration(""); setApiVersion(""); }}>
          {Object.values(SOCIAL_PLATFORM_SPECS).map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold">Provider account ID / LinkedIn author URN (optional; detected from token)
        <input className={inputClass} value={providerAccountId} onChange={event => setProviderAccountId(event.target.value)} autoComplete="off" />
      </label>
      <label className="text-xs font-bold sm:col-span-2">Your access token {platform === "facebook" ? "(Page token, not personal user token)" : ""}
        <input required type="password" className={inputClass} value={accessToken} onChange={event => setAccessToken(event.target.value)} autoComplete="new-password" spellCheck={false} />
      </label>
      {platform === "pinterest" && <label className="text-xs font-bold">Destination board ID<input required className={inputClass} value={boardId} onChange={event => setBoardId(event.target.value)} /></label>}
      {["linkedin", "facebook", "instagram"].includes(platform) && <label className="text-xs font-bold">Provider API version {platform === "linkedin" ? "(required, YYYYMM)" : "(optional, e.g. v27.0)"}
        <input required={platform === "linkedin"} className={inputClass} value={apiVersion} onChange={event => setApiVersion(event.target.value)} />
      </label>}
      {["youtube", "tiktok"].includes(platform) && <label className="text-xs font-bold">{platform === "youtube" ? "Are videos made for kids?" : "Do your uploaded videos contain AI-generated media?"}
        <select required className={inputClass} value={mediaDeclaration} onChange={event => setMediaDeclaration(event.target.value)}>
          <option value="">Choose a declaration</option><option value="yes">Yes</option><option value="no">No</option>
        </select>
        <span className="mt-1 block font-normal">Applies to this connection. Reconnect before publishing content with a different declaration. App-generated TikTok media is always labeled AI-generated.</span>
      </label>}
      {["youtube", "tiktok"].includes(platform) && <label className="text-xs font-bold">Publishing visibility
        <select required className={inputClass} value={privacyLevel} onChange={event => setPrivacyLevel(event.target.value)}>
          <option value="">Choose visibility</option>
          {(platform === "youtube" ? ["private", "unlisted", "public"] : ["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE"]).map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
      </label>}
      <label className="text-xs font-bold">Token expiration (if provided by your platform)<input type="datetime-local" className={inputClass} value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
      <div className="text-xs text-[var(--text-secondary)] sm:col-span-2"><p>{spec.apiNotes}</p><p className="mt-1">Required permissions: {spec.officialScopes.join(", ")}</p></div>
      <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 p-3 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Verify and connect</button>
    </form>}
    {!accounts.length && <div className="surface-card rounded-3xl p-8 text-center text-sm text-[var(--text-muted)]">No accounts connected. Add your own credentials to enable publishing.</div>}
    <div className="grid gap-4 md:grid-cols-2">{accounts.map(account => <div key={account.id} className="surface-card space-y-3 rounded-3xl p-6">
      <h2 className="font-bold">{account.accountName}</h2><p className="text-sm">{account.handle} · {account.platform}</p>
      <p className="text-xs">{account.integrationMode === "customer_credentials" ? "Customer-owned credentials" : "Legacy connection: reconnect with your credentials"} · {account.status.replaceAll("_", " ")}</p>
      {account.lastError && <p className="text-xs text-amber-400">{account.lastError}</p>}
      {canManage && <div className="flex gap-4">
        <button disabled={busy} onClick={() => void submit("refresh", account.id)} className="inline-flex items-center gap-1 text-xs"><RefreshCw className="h-4 w-4" />Verify token</button>
        <button disabled={busy} onClick={() => void submit("disconnect", account.id)} className="inline-flex items-center gap-1 text-xs text-rose-400"><Unplug className="h-4 w-4" />Disconnect</button>
      </div>}
    </div>)}</div>
  </div>;
}
