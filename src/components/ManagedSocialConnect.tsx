"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Camera, MessageCircle, Music2, Pin, Play, Users, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { useAppLanguage } from "@/i18n/provider";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "@/lib/social-adapters";
import type { ManagedProviderAvailability, ManagedSocialSelection } from "@/lib/social-managed-types";
import { useToast } from "./ToastProvider";

const icons = { facebook: Users, instagram: Camera, linkedin: BriefcaseBusiness, x: MessageCircle, tiktok: Music2, pinterest: Pin, youtube: Play, threads: AtSign };
const errorCodes = ["NOT_CONFIGURED", "APPROVAL_REQUIRED", "AUTHORIZATION_DENIED", "AUTHORIZATION_FAILED", "STATE_INVALID", "PERMISSION_MISSING", "FACEBOOK_PAGE_ACCESS_MISSING", "FACEBOOK_PUBLISH_ACCESS_MISSING", "FACEBOOK_TOKEN_INVALID", "INSTAGRAM_ASSET_MISSING", "INSTAGRAM_TOKEN_INVALID", "INSTAGRAM_PROVIDER_REJECTED", "FACEBOOK_USER_TOKEN_REQUIRED", "ACCOUNT_UNSUPPORTED", "CHANNEL_LIMIT", "BRAND_LIMIT", "REQUEST_BLOCKED", "REQUEST_FORMAT", "REQUEST_CROSS_SITE", "REQUEST_ORIGIN", "PROVIDER_UNAVAILABLE", "TOKEN_EXPIRED", "MANAGED_APP_CHANGED", "DISCOVERY_INCOMPLETE", "FORBIDDEN", "INVALID_REQUEST"];
export function managedSocialErrorKey(code: unknown) {
  return `social.managed.error.${typeof code === "string" && errorCodes.includes(code) ? code : "AUTHORIZATION_FAILED"}`;
}

export function ManagedSocialConnect({ availability, accounts, canManage, selection, errorCode }: {
  availability: ManagedProviderAvailability[];
  accounts: { id: number; platform: string; status: string }[];
  canManage: boolean;
  selection?: ManagedSocialSelection | null;
  errorCode?: string | null;
}) {
  const { t, formatNumber } = useAppLanguage();
  const router = useRouter();
  const { toast } = useToast();
  const [active, setActive] = useState<SocialPlatform | null>(null);
  const [consent, setConsent] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [organizations, setOrganizations] = useState(false);
  const [destinationId, setDestinationId] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [declaration, setDeclaration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedTicket, setCompletedTicket] = useState<string | null>(null);
  const permissionsRef = useRef<HTMLElement>(null);
  useEffect(() => { if (active) permissionsRef.current?.focus(); }, [active]);
  const selectedAvailability = availability.find(item => item.platform === active);
  const pending = canManage && selection && completedTicket !== selection.ticket ? selection : null;
  const destination = pending?.destinations.find(item => item.id === destinationId);
  const video = pending?.platform === "youtube" || pending?.platform === "tiktok";
  const privacyLevels = pending?.platform === "youtube"
    ? (pending.publicPostingAvailable ? ["private", "unlisted", "public"] : ["private"])
    : destination?.privacyLevels ?? [];
  const inputClass = "elevated-card mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm";
  const buttonClass = "rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50";

  async function start() {
    if (!active || !consent || !["available", "testing"].includes(selectedAvailability?.status ?? "") || !canManage || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/social/oauth/${active}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "managed", analyticsEnabled, organizations }),
      });
      const result = await response.json();
      if (!response.ok) { setError(managedSocialErrorKey(result.code)); return; }
      if (typeof result.url !== "string" || new URL(result.url).protocol !== "https:") {
        setError(managedSocialErrorKey(null)); return;
      }
      window.location.assign(result.url);
    } catch { setError(managedSocialErrorKey(null)); }
    finally { setBusy(false); }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || !destination || busy || (video && (!privacyLevels.includes(privacyLevel) || !declaration))) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/social/oauth/${pending.platform}/select`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: pending.ticket, destinationId,
          ...(video ? { privacyLevel } : {}),
          ...(pending.platform === "youtube" ? { madeForKids: declaration === "yes" } : {}),
          ...(pending.platform === "tiktok" ? { aiGenerated: declaration === "yes" } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) { setError(managedSocialErrorKey(result.code)); return; }
      setCompletedTicket(pending.ticket);
      toast(t("social.managed.title"), t("social.managed.success"));
      router.replace("/app/social");
      router.refresh();
    } catch { setError(managedSocialErrorKey(null)); }
    finally { setBusy(false); }
  }

  return <section className="space-y-5" aria-label={t("social.managed.title")}>
    <div className="surface-card rounded-3xl p-5">
      <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-cyan-400" aria-hidden="true" />{t("social.managed.title")}</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("social.managed.intro")}</p>
      {!canManage && <p className="mt-2 text-sm">{t("social.managed.adminOnly")}</p>}
    </div>
    {(error || errorCode) && <p role="alert" className="surface-card rounded-2xl p-4 text-sm text-amber-400">{t(error ?? managedSocialErrorKey(errorCode))}</p>}
    {completedTicket && <p role="status" className="surface-card rounded-2xl p-4 text-sm text-emerald-400">{t("social.managed.success")}</p>}
    {pending && <form key={pending.ticket} onSubmit={event => void confirm(event)} className="surface-card space-y-4 rounded-3xl p-5" aria-label={t("social.managed.chooseDestination")}>
      <h2 className="font-bold">{t("social.managed.chooseDestination")}</h2>
      <p className="text-sm">{t("social.managed.selectionIntro")}</p>
      {!pending.destinations.length && <p role="status">{t("social.managed.error.DISCOVERY_INCOMPLETE")}</p>}
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold">{SOCIAL_PLATFORM_SPECS[pending.platform].name}</legend>
        {pending.destinations.map(item => {
          const Icon = icons[pending.platform];
          return <label key={item.id} className="elevated-card flex cursor-pointer gap-3 rounded-2xl p-4">
            <input required type="radio" name="managed-destination" value={item.id} checked={destinationId === item.id} onChange={() => { setDestinationId(item.id); setPrivacyLevel(""); setDeclaration(""); }} />
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 text-sm"><strong className="block break-words">{item.name}</strong>
              <span className="block break-words">{item.handle} · {item.accountType}</span>
              <span className="mt-1 block break-words text-xs text-[var(--text-secondary)]">{t("social.managed.permissions")}: {item.permissions.join(", ") || t("social.managed.noPermissions")}</span>
              {!!item.unknownPermissions?.length && <span className="mt-1 block break-words text-xs text-amber-400">{t("social.managed.unknownPermissions")}: {item.unknownPermissions.join(", ")}</span>}
            </span>
          </label>;
        })}
      </fieldset>
      {video && <>
        {!pending.publicPostingAvailable && <p className="text-sm text-amber-400">{t("social.managed.privateOnly")}</p>}
        <label className="block text-sm font-bold">{t("customer.text.650")}
          <select required disabled={!destination} className={inputClass} value={privacyLevel} onChange={event => setPrivacyLevel(event.target.value)}>
            <option value="">{t("customer.text.651")}</option>
            {privacyLevels.map(value => <option key={value} value={value}>{t(`customer.status.${value}`)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold">{t(pending.platform === "youtube" ? "customer.text.644" : "customer.text.645")}
          <select required disabled={!destination} className={inputClass} value={declaration} onChange={event => setDeclaration(event.target.value)}>
            <option value="">{t("customer.text.646")}</option><option value="yes">{t("customer.text.647")}</option><option value="no">{t("customer.text.648")}</option>
          </select>
        </label>
      </>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || !destination || (video && (!privacyLevels.includes(privacyLevel) || !declaration))} className={buttonClass}>{t("social.managed.confirm")}</button>
        <button type="button" disabled={busy} onClick={() => { router.replace("/app/social"); router.refresh(); }} className="rounded-xl border px-4 py-2 text-sm">{t("social.managed.cancel")}</button>
      </div>
    </form>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.values(SOCIAL_PLATFORM_SPECS).map(spec => {
        const provider = availability.find(item => item.platform === spec.id);
        const status = provider?.status ?? "not_configured";
        const connected = accounts.filter(item => item.platform === spec.id);
        const reconnect = connected.some(item => item.status !== "connected");
        const Icon = icons[spec.id];
        return <article key={spec.id} className="surface-card flex flex-col gap-3 rounded-3xl p-5" data-managed-provider={spec.id}>
          <h3 className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5 shrink-0" style={{ color: spec.accentColor }} aria-hidden="true" />{spec.name}</h3>
          <p className="text-xs">{t("social.managed.accountCount", { count: formatNumber(connected.length) })} · {t(`social.managed.status.${status}`)}</p>
          {!!connected.length && <p className="text-xs">{t(reconnect ? "customer.status.reconnect_required" : "customer.status.connected")}</p>}
          <p className="text-xs text-[var(--text-secondary)]">{t(`social.managed.eligibility.${spec.id}`)}</p>
          {status !== "available" && <p className="text-xs text-amber-400">{t(status === "testing" && spec.id === "linkedin" ? "social.managed.gate.linkedinTesting" : `social.managed.gate.${status}`)}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            {canManage && <button type="button" disabled={busy || !["available", "testing"].includes(status) || !!pending} className={buttonClass} onClick={() => { setActive(spec.id); setConsent(false); setAnalyticsEnabled(false); setOrganizations(false); setError(null); }}>
              {t(reconnect ? "social.managed.reconnect" : "social.managed.connect")}
            </button>}
            {!!connected.length && <a className="text-sm underline" href={`#social-account-${connected[0].id}`}>{t("social.managed.manage")}</a>}
          </div>
        </article>;
      })}
    </div>
    {active && selectedAvailability && ["available", "testing"].includes(selectedAvailability.status) && canManage && !pending && <section ref={permissionsRef} tabIndex={-1} className="surface-card space-y-4 rounded-3xl p-5" aria-label={t("social.managed.permissionStep")}>
      <h2 className="font-bold">{t("social.managed.permissionStep")} · {SOCIAL_PLATFORM_SPECS[active].name}</h2>
      {!(active === "facebook" && selectedAvailability.facebookBusinessLogin) && <p className="text-sm">{t("social.managed.permissionExplain")}</p>}
      <p className="text-sm">{t(`social.managed.eligibility.${active}`)}</p>
      {active === "facebook" && selectedAvailability.facebookBusinessLogin && <p className="text-sm text-amber-400">{t("social.managed.facebookBusinessNotice")}</p>}
      {["youtube", "tiktok"].includes(active) && !selectedAvailability.publicPostingAvailable && <p className="text-sm text-amber-400">{t("social.managed.privateOnly")}</p>}
      <p className="text-sm text-[var(--text-secondary)]">{t("social.managed.revocation")}</p>
      {selectedAvailability.analyticsAvailable && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={analyticsEnabled} onChange={event => setAnalyticsEnabled(event.target.checked)} />{t("social.managed.analytics")}</label>}
      {active === "linkedin" && selectedAvailability.organizationsAvailable && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={organizations} onChange={event => setOrganizations(event.target.checked)} />{t("social.managed.organizations")}</label>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{t("social.managed.consent")}</label>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !consent} onClick={() => void start()} className={buttonClass}>{t("social.managed.continue")}</button>
        <button type="button" disabled={busy} onClick={() => setActive(null)} className="rounded-xl border px-4 py-2 text-sm">{t("social.managed.cancel")}</button>
      </div>
    </section>}
  </section>;
}
