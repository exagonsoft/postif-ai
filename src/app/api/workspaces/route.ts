import { NextResponse } from "next/server";
import { db } from "@/db";
import { brands, workspaceMembers, auditLogs, posts, socialAccounts, campaigns, } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx || !ctx.workspace || !ctx.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await req.json();
        const action = body.action as string;
        if (action === "create_brand") {
            const plan = getPlanDefinition(ctx.workspace.planSlug);
            if (ctx.brands.length >= plan.maxBrands) {
                return NextResponse.json({
                    error: `Brand limit (${plan.maxBrands}) reached on ${plan.name}. Upgrade to Pro or Agency to manage additional brands.`,
                }, { status: 403 });
            }
            const name = String(body.name || "").trim();
            if (!name) {
                return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
            }
            const [brand] = await db.insert(brands, {
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
            await db.insert(auditLogs, {
                workspaceId: ctx.workspace.id,
                actorEmail: ctx.user.email,
                action: "brand.created",
                resourceType: "brand",
                resourceId: String(brand.id),
                metadata: { name: brand.name },
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
            if (!invitedEmail || !invitedEmail.includes("@")) {
                return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
            }
            const [member] = await db.insert(workspaceMembers, {
                workspaceId: ctx.workspace.id,
                userId: null,
                invitedEmail,
                memberName,
                role,
                status: "invited",
            });
            await db.insert(auditLogs, {
                workspaceId: ctx.workspace.id,
                actorEmail: ctx.user.email,
                action: "workspace.member_invited",
                resourceType: "workspace_member",
                resourceId: String(member.id),
                metadata: { invitedEmail, role },
            });
            return NextResponse.json({ ok: true, member });
        }
        if (action === "update_member_role") {
            if (ctx.memberRole !== "owner" && ctx.memberRole !== "admin") {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const memberId = Number(body.memberId);
            const role = String(body.role || "editor");
            await db.update(workspaceMembers, and(eq("id", memberId), eq("workspaceId", ctx.workspace.id)), { role });
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
        console.error("Workspaces API error:", err);
        return NextResponse.json({ error: "Workspace operation failed" }, { status: 500 });
    }
}
