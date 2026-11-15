"use client";

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
}: {
  brands: BrandDTO[];
  members: MemberDTO[];
  maxBrands: number;
  planName: string;
  currentRole: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("SaaS & Technology");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("approver");

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
      toast("Brand quota reached", data.error || "Upgrade plan to add more brands.", "error");
      return;
    }
    toast("Brand created", `${data.brand.name} added to this workspace.`);
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
      toast("Invitation blocked", data.error || "Check your permissions.", "error");
      return;
    }
    toast("Team member invited", `Invited ${inviteEmail} as ${inviteRole.toUpperCase()}.`);
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
      toast("Role updated", `Member role changed to ${role.toUpperCase()}.`);
      router.refresh();
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
      toast("Workspace data exported", "Downloaded complete JSON archive.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Brand Profiles Section */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-extrabold">
              Managed Brands ({brands.length} / {maxBrands} on {planName})
            </h2>
          </div>

          <button
            type="button"
            onClick={handleExportJson}
            className="elevated-card inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold hover:border-cyan-500/40"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" /> Export Workspace JSON
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
                Voice & Tone: {brand.tone}
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
              New Brand Name
            </label>
            <input
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Client or Sub-Brand"
              className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              Website URL
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
              Industry
            </label>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3.5 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2.5 text-xs font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Add Brand
          </button>
        </form>
      </div>

      {/* Team Members & Role-Based Access Control (RBAC) */}
      <div className="surface-card rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-violet-400" />
          <h2 className="text-base font-extrabold">
            Team Collaboration & Client Approval Roles (Your Role: {currentRole.toUpperCase()})
          </h2>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Assign granular RBAC roles: <strong>Owner</strong>, <strong>Administrator</strong>,{" "}
          <strong>Editor</strong>, <strong>Approver</strong> (client sign-off), and{" "}
          <strong>Viewer</strong>.
        </p>

        <form
          onSubmit={handleInviteMember}
          className="mt-5 grid gap-3 sm:grid-cols-12 sm:items-end"
        >
          <div className="sm:col-span-6">
            <label className="block text-[11px] font-bold uppercase text-[var(--text-muted)]">
              Team Member or Client Email
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
              RBAC Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="elevated-card mt-1 w-full rounded-xl px-3 py-2 text-xs font-bold"
            >
              <option value="admin">Administrator</option>
              <option value="editor">Editor</option>
              <option value="approver">Approver (Client Sign-off)</option>
              <option value="viewer">Viewer (Read-Only)</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 py-2.5 text-xs font-bold text-white"
            >
              <UserPlus className="h-4 w-4" /> Send Invite
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
                  {m.invitedEmail} • <span className="capitalize">{m.status}</span>
                </div>
              </div>

              <select
                value={m.role}
                disabled={m.role === "owner"}
                onChange={(e) => handleRoleUpdate(m.id, e.target.value)}
                className="surface-card rounded-xl px-3 py-1.5 text-xs font-bold uppercase"
              >
                <option value="owner">Owner</option>
                <option value="admin">Administrator</option>
                <option value="editor">Editor</option>
                <option value="approver">Approver</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
