import { NextResponse } from "next/server";
import { db } from "@/db";
import { brands, workspaceMembers, auditLogs, posts, socialAccounts, campaigns, workspaces, sessions } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext, SESSION_COOKIE_NAME } from "@/lib/auth";
import { assertFeature, getWorkspaceEntitlements } from "@/lib/entitlements";
import { WorkflowError } from "@/lib/post-policy";
import { cookies } from "next/headers";
import { hashToken } from "@/lib/crypto";
import { z } from "zod";
const workspaceInput = z.object({
    action: z.enum(["accept_invite", "decline_invite", "create_brand", "invite_member", "update_member_role", "remove_member", "export_data"]),
    memberId: z.number().int().positive().optional(),
    role: z.enum(["admin", "editor", "approver", "viewer"]).optional(),
    name: z.string().trim().max(300).optional(),
    email: z.email().max(254).optional(),
    websiteUrl: z.string().max(2000).optional(),
    industry: z.string().max(300).optional(),
    description: z.string().max(10000).optional(),
    targetAudience: z.string().max(5000).optional(),
    brandVoice: z.string().max(5000).optional(),
    tone: z.string().max(100).optional(),
});
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx || !ctx.workspace || !ctx.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = workspaceInput.parse(await req.json());
        const action = body.action;
        if (action === "accept_invite" || action === "decline_invite") {
            if (action === "accept_invite" && !ctx.user.emailVerified) throw new WorkflowError("Verify your email address before accepting a workspace invitation.", 403);
            const memberId = Number(body.memberId);
            if (!Number.isSafeInteger(memberId) || memberId < 1) throw new WorkflowError("Invalid invitation.");
            const rawToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
            const invitation = await db.transaction(async tx => {
                const [invite] = await tx.find(workspaceMembers, { id: memberId, invitedEmail: ctx.user.email, status: "invited" }, { lock: true });
                if (!invite || (invite.userId !== null && invite.userId !== ctx.user.id)) throw new WorkflowError("Invitation not found.", 404);
                if (action === "accept_invite") {
                    await assertFeature(invite.workspaceId, "team", tx);
                    await tx.update(workspaceMembers, { id: invite.id }, { userId: ctx.user.id, status: "active" });
                    if (rawToken) await tx.update(sessions, { tokenHash: hashToken(rawToken) }, { activeWorkspaceId: invite.workspaceId });
                } else {
                    await tx.update(workspaceMembers, { id: invite.id }, { status: "declined" });
                }
                await tx.insert(auditLogs, { workspaceId: invite.workspaceId, actorEmail: ctx.user.email, action: action === "accept_invite" ? "workspace.invitation_accepted" : "workspace.invitation_declined", resourceType: "workspace_member", resourceId: String(invite.id) });
                return invite;
            });
            return NextResponse.json({ ok: true, workspaceId: invitation.workspaceId });
        }
        if (action === "create_brand") {
            if (!["owner", "admin"].includes(ctx.memberRole)) throw new WorkflowError("Only owners and admins can manage brands.", 403);
            const name = String(body.name || "").trim();
            if (!name) {
                return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
            }
            const brand = await db.transaction(async tx => {
            await tx.find(workspaces, { id: ctx.workspace.id }, { lock: true });
            const { plan } = await getWorkspaceEntitlements(ctx.workspace.id, tx);
            const existing = await tx.find(brands, { workspaceId: ctx.workspace.id });
            if (existing.length >= plan.maxBrands) throw new WorkflowError(`Brand limit (${plan.maxBrands}) reached on ${plan.name}.`, 403);
            const [brand] = await tx.insert(brands, {
                workspaceId: ctx.workspace.id,
                name,
                websiteUrl: String(body.websiteUrl || "").trim(),
                industry: String(body.industry || "").trim(),
                description: String(body.description || "").trim(),
                targetAudience: String(body.targetAudience || "").trim(),
                brandVoice: String(body.brandVoice || "").trim(),
                tone: String(body.tone || "Professional").trim(),
                contentPillars: [],
                suggestedHashtags: [],
                isActive: true,
            });
            await tx.insert(auditLogs, {
                workspaceId: ctx.workspace.id,
                actorEmail: ctx.user.email,
                action: "brand.created",
                resourceType: "brand",
                resourceId: String(brand.id),
                metadata: { name: brand.name },
            });
            return brand;
            });
            return NextResponse.json({ ok: true, brand });
        }
        if (action === "invite_member") {
            if (ctx.memberRole !== "owner" && ctx.memberRole !== "admin") {
                return NextResponse.json({ error: "Only Owners or Admins can invite workspace members." }, { status: 403 });
            }
            const invitedEmail = String(body.email || "").trim().toLowerCase();
            const memberName = String(body.name || invitedEmail.split("@")[0]).trim();
            const role = String(body.role || "editor");
            if (!["admin", "editor", "approver", "viewer"].includes(role)) throw new WorkflowError("Invalid team role.");
            if (role === "admin" && ctx.memberRole !== "owner") throw new WorkflowError("Only the owner can grant admin access.", 403);
            if (!invitedEmail || !invitedEmail.includes("@")) {
                return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
            }
            const member = await db.transaction(async tx => {
            await tx.find(workspaces, { id: ctx.workspace.id }, { lock: true });
            await assertFeature(ctx.workspace.id, "team", tx);
            const [existing] = await tx.find(workspaceMembers, { workspaceId: ctx.workspace.id, invitedEmail, status: { $in: ["active", "invited"] } });
            if (existing) throw new WorkflowError("This person is already a member or has a pending invitation.", 409);
            const [member] = await tx.insert(workspaceMembers, {
                workspaceId: ctx.workspace.id,
                userId: null,
                invitedEmail,
                memberName,
                role,
                status: "invited",
            });
            await tx.insert(auditLogs, {
                workspaceId: ctx.workspace.id,
                actorEmail: ctx.user.email,
                action: "workspace.member_invited",
                resourceType: "workspace_member",
                resourceId: String(member.id),
                metadata: { invitedEmail, role },
            });
            return member;
            });
            return NextResponse.json({ ok: true, member });
        }
        if (action === "update_member_role" || action === "remove_member") {
            if (ctx.memberRole !== "owner" && ctx.memberRole !== "admin") {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const memberId = Number(body.memberId);
            const role = String(body.role || "editor");
            if (!Number.isSafeInteger(memberId) || !["admin", "editor", "approver", "viewer"].includes(role)) throw new WorkflowError("Invalid member or role.");
            await db.transaction(async tx => {
                await tx.find(workspaces, { id: ctx.workspace.id }, { lock: true });
                if (action === "update_member_role") await assertFeature(ctx.workspace.id, "team", tx);
                const [member] = await tx.find(workspaceMembers, { id: memberId, workspaceId: ctx.workspace.id });
                if (!member) throw new WorkflowError("Member not found.", 404);
                if (member.userId === ctx.workspace.ownerId) throw new WorkflowError("Workspace ownership cannot be changed here.", 403);
                if (ctx.memberRole !== "owner" && (role === "admin" || member.role === "admin")) throw new WorkflowError("Only the owner can manage admin access.", 403);
                await tx.update(workspaceMembers, and(eq("id", memberId), eq("workspaceId", ctx.workspace.id)), action === "remove_member" ? { status: "revoked" } : { role });
                await tx.insert(auditLogs, { workspaceId: ctx.workspace.id, actorEmail: ctx.user.email, action: action === "remove_member" ? "workspace.member_removed" : "workspace.member_role_updated", resourceType: "workspace_member", resourceId: String(memberId), metadata: { role } });
            });
            return NextResponse.json({ ok: true });
        }
        if (action === "export_data") {
            const wsBrands = await db.find(brands, eq("workspaceId", ctx.workspace.id), {});
            const wsPosts = await db.find(posts, eq("workspaceId", ctx.workspace.id), {});
            const wsSocials = await db.find(socialAccounts, eq("workspaceId", ctx.workspace.id), {});
            const wsCampaigns = await db.find(campaigns, eq("workspaceId", ctx.workspace.id), {});
            return NextResponse.json({
                ok: true,
                exportBundle: {
                    exportedAt: new Date().toISOString(),
                    workspace: ctx.workspace,
                    brands: wsBrands,
                    socialAccounts: wsSocials,
                    campaigns: wsCampaigns,
                    posts: wsPosts,
                },
            });
        }
        return NextResponse.json({ error: "Invalid workspace action" }, { status: 400 });
    }
    catch (err) {
        if (err instanceof WorkflowError) return NextResponse.json({ error: err.message }, { status: err.status });
        if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message || "Invalid workspace request." }, { status: 400 });
        console.error("Workspaces API error:", err);
        return NextResponse.json({ error: "Workspace operation failed" }, { status: 500 });
    }
}
