"use client";

import { useAppLanguage } from "@/i18n/provider";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import {
  Building2,
  UserPlus,
  Shield,
  Download,
  Plus,
} from "lucide-react";

interface BrandDTO {
  id: number;
  name: string;
  websiteUrl: string;
  industry: string;
  tone: string;
  contentPillars: string[];
}

interface MemberDTO {
  id: number;
  invitedEmail: string;
  memberName: string;
  role: string;
  status: string;
}

export function WorkspacesClient({
  brands,
  members,
  maxBrands,
  planName,
  currentRole,
  teamEnabled,
  invitations,
}: {
  brands: BrandDTO[];
  members: MemberDTO[];
  maxBrands: number;
  planName: string;
  currentRole: string;
  teamEnabled: boolean;
  invitations: { id: number; workspaceName: string; role: string }[];
}) {
  const { t, locale, formatNumber } = useAppLanguage();
  const displayStatus = (value: string) => ["owner","admin","editor","approver","viewer","invited","accepted","declined","active"].includes(value) ? t(`customer.status.${value}`) : value;

  const router = useRouter();
  const { toast } = useToast();

  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState(t("customer.text.670"));
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("approver");
  const canManage = ["owner", "admin"].includes(currentRole);
  const respondToInvitation = async (memberId: number, accept: boolean) => {
    try {
      const response = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: accept ? "accept_invite" : "decline_invite", memberId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("customer.text.671"));
      toast(accept ? t("customer.text.672") : t("customer.text.673"), accept ? t("customer.text.674") : t("customer.text.675"));
      router.refresh();
    } catch (error) {
      toast(t("customer.text.676"), error instanceof Error ? error.message : t("customer.text.671"), "error");
    }
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_brand",
        name: brandName,
        websiteUrl,
        industry,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(t("customer.text.678"), data.error || t("customer.text.679"), "error");
      return;
    }
    toast(t("customer.text.680"), t("customer.brandAdded", { name: data.brand.name }));
    setBrandName("");
    setWebsiteUrl("");
    router.refresh();
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "invite_member",
        email: inviteEmail,
        role: inviteRole,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(t("customer.text.681"), data.error || t("customer.text.682"), "error");
      return;
    }
    toast(t("customer.text.683"), t("customer.inviteInstructions", { email: inviteEmail }));
    setInviteEmail("");
    router.refresh();
  };

  const handleRoleUpdate = async (memberId: number, role: string) => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_member_role", memberId, role }),
    });
    if (res.ok) {
      toast(t("customer.text.684"), t("customer.roleChanged", { role: displayStatus(role).toLocaleUpperCase(locale) }));
      router.refresh();
    } else {
      const data = await res.json();
      toast(t("customer.text.685"), data.error || t("customer.text.682"), "error");
    }
  };
  const handleRemoveMember = async (memberId: number) => {
    try {
      const response = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_member", memberId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("customer.text.687"));
      toast(t("customer.text.688"), t("customer.text.689"));
      router.refresh();
    } catch (error) {
      toast(t("customer.text.690"), error instanceof Error ? error.message : t("customer.text.691"), "error");
    }
  };

  const handleExportJson = async () => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export_data" }),
    });
    const data = await res.json();
    if (res.ok) {
      const blob = new Blob([JSON.stringify(data.exportBundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "postif-ai-workspace-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast(t("customer.text.692"), t("customer.text.693"));
    }
  };

  return (
    <div className="space-y-8">
      {invitations.length > 0 && <div className="surface-card space-y-3 rounded-3xl p-6">
        <h2 className="font-bold">{t("customer.text.694")}</h2>
        {invitations.map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
          <span>{invite.workspaceName} &mdash; {displayStatus(invite.role)}</span>
          <div className="flex gap-3"><button type="button" onClick={() => respondToInvitation(invite.id, true)}>{t("customer.text.696")}</button><button type="button" onClick={() => respondToInvitation(invite.id, false)}>{t("customer.text.697")}</button></div>
        </div>)}
      </div>}
      {/* Brand Profiles Section */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-extrabold">
              {t("customer.text.698")}{formatNumber(brands.length)} / {formatNumber(maxBrands)} {t("customer.text.699")}{" "} {planName})
            </h2>
          </div>

          <button
            type="button"
            onClick={handleExportJson}
            className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold hover:border-cyan-500/40"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" /> {t("customer.text.700")}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {brands.map((brand) => (
            <div key={brand.id} className="elevated-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold">{brand.name}</h3>
                <span className="rounded-lg bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-300">
                  {brand.industry}
                </span>
              </div>
              {brand.websiteUrl && (
                <p className="mt-1 text-xs text-cyan-400">{brand.websiteUrl}</p>
              )}
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {t("customer.text.701")}{" "} {brand.tone}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {brand.contentPillars.map((p) => (
                  <span
                    key={p}
                    className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleCreateBrand}
          className="mt-6 grid gap-3 border-t border-[var(--border-subtle)] pt-5 sm:grid-cols-4 sm:items-end"
        >
          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.702")}
            </label>
            <input
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={t("customer.text.703")}
              className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.704")}
            </label>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://clientbrand.com"
              className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.705")}
            </label>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={!canManage || brands.length >= maxBrands}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2.5 text-xs font-bold text-white"
          >
            <Plus className="h-4 w-4" /> {t("customer.text.706")}
          </button>
        </form>
      </div>

      {/* Team Members & Role-Based Access Control (RBAC) */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-violet-400" />
          <h2 className="text-base font-extrabold">
            {t("customer.text.707")}{" "} {displayStatus(currentRole).toLocaleUpperCase(locale)})
          </h2>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("customer.text.708")}{" "} <strong>{t("customer.text.709")}</strong>, <strong>{t("customer.text.710")}</strong>,{" "}
          <strong>{t("customer.text.711")}</strong>, <strong>{t("customer.text.712")}</strong> {t("customer.text.713")}{" "}
          <strong>{t("customer.text.714")}</strong>.
        </p>

        <form
          onSubmit={handleInviteMember}
          className="mt-5 grid gap-3 sm:grid-cols-12 sm:items-end"
        >
          {!teamEnabled && <p className="text-xs text-amber-300 sm:col-span-12">{t("customer.text.715")}</p>}
          <div className="sm:col-span-6">
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.716")}
            </label>
            <input
              required
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="client.reviewer@brand.com"
              className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              {t("customer.text.717")}
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs font-bold"
            >
              {currentRole === "owner" && <option value="admin">{t("customer.text.710")}</option>}
              <option value="editor">{t("customer.text.711")}</option>
              <option value="approver">{t("customer.text.720")}</option>
              <option value="viewer">{t("customer.text.721")}</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={!teamEnabled || !canManage}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 py-2.5 text-xs font-bold text-white"
            >
              <UserPlus className="h-4 w-4" /> {t("customer.text.722")}
            </button>
          </div>
        </form>

        <div className="mt-6 space-y-2.5">
          {members.map((m) => (
            <div
              key={m.id}
              className="elevated-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
            >
              <div>
                <div className="text-sm font-bold">{m.memberName}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {m.invitedEmail} • <span className="capitalize">{displayStatus(m.status)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3"><select
                value={m.role}
                disabled={m.role === "owner" || !teamEnabled || !canManage || (currentRole !== "owner" && m.role === "admin")}
                onChange={(e) => handleRoleUpdate(m.id, e.target.value)}
                className="surface-card rounded-xl px-3 py-1.5 text-xs font-bold uppercase"
              >
                {m.role === "owner" && <option value="owner">{t("customer.text.709")}</option>}
                <option value="admin" disabled={currentRole !== "owner"}>{t("customer.text.710")}</option>
                <option value="editor">{t("customer.text.711")}</option>
                <option value="approver">{t("customer.text.712")}</option>
                <option value="viewer">{t("customer.text.714")}</option>
              </select>
              {canManage && m.role !== "owner" && (currentRole === "owner" || m.role !== "admin") && m.status !== "revoked" && <button type="button" onClick={() => handleRemoveMember(m.id)} className="text-xs text-red-300">{t("customer.text.728")}</button>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
