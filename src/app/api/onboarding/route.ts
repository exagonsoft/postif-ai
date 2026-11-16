import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, workspaceMembers, brands, aiConfigurations, agentConfigurations, notifications, auditLogs, sessions, } from "@/db/schema";
import { eq } from "@/db/filters";
import { getAuthContext, SESSION_COOKIE_NAME } from "@/lib/auth";
import { runBrandDiscovery } from "@/lib/ai-engine";
import { getPlanDefinition } from "@/lib/plans";
import { encryptSecret, hashToken } from "@/lib/crypto";
import { cookies } from "next/headers";
export async function POST(req: Request) {
    try {
        const ctx = await getAuthContext();
        if (!ctx || !ctx.user || !ctx.workspace) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await req.json();
        const action = body.action as string;
        if (action === "discover") {
            const brandName = String(body.brandName || "").trim();
            const websiteUrl = String(body.websiteUrl || "").trim();
            const notes = String(body.notes || "").trim();
            if (!brandName) {
                return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
            }
            const result = await runBrandDiscovery({
                workspaceId: ctx.workspace.id,
                userId: ctx.user.id,
                brandName,
                websiteUrl,
                notes,
            });
            return NextResponse.json({ ok: true, ...result });
        }
        if (action === "complete") {
            const workspaceName = String(body.workspaceName || ctx.workspace.name).trim();
            const brandName = String(body.brandName || workspaceName).trim();
            const websiteUrl = String(body.websiteUrl || "").trim();
            const industry = String(body.industry || "").trim();
            const description = String(body.description || "").trim();
            const productsServices = String(body.productsServices || "").trim();
            const targetAudience = String(body.targetAudience || "").trim();
            const brandVoice = String(body.brandVoice || "").trim();
            const tone = String(body.tone || "Professional").trim();
            const marketingGoals = Array.isArray(body.marketingGoals) ? body.marketingGoals : [];
            const contentPillars = Array.isArray(body.contentPillars) ? body.contentPillars : [];
            const suggestedHashtags = Array.isArray(body.suggestedHashtags)
                ? body.suggestedHashtags
                : [];
            const selectedPlatforms = Array.isArray(body.platforms)
                ? body.platforms
                : [];
            const aiBillingMode = body.aiBillingMode === "managed" ? "managed" : "byok";
            const byokApiKey = String(body.byokApiKey || "").trim();
            const planSlug = String(body.planSlug || "free");
            if (planSlug !== "free") return NextResponse.json({ error: "Paid workspaces require verified billing, which is not enabled yet." }, { status: 501 });
            if (!workspaceName || !brandName) return NextResponse.json({ error: "Workspace and brand names are required." }, { status: 400 });
            if (byokApiKey && !/^sk-\S+$/.test(byokApiKey)) return NextResponse.json({ error: "Enter a valid OpenAI API key or leave it empty." }, { status: 400 });
            const plan = getPlanDefinition(planSlug);
            const cookieStore = await cookies();
            const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
            const slug = `${workspaceName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")}-${crypto.randomUUID()}`;
            const newWorkspace = await db.transaction(async tx => {
            const [newWorkspace] = await tx.insert(workspaces, {
                name: workspaceName,
                slug,
                ownerId: ctx.user.id,
                planSlug: plan.slug,
                billingCycle: "monthly",
                aiBillingMode,
                aiCreditsBalance: 0,
                aiCreditsMonthlyAllowance: 0,
                postsPublishedThisMonth: 0,
            });
            await tx.insert(workspaceMembers, {
                workspaceId: newWorkspace.id,
                userId: ctx.user.id,
                invitedEmail: ctx.user.email,
                memberName: ctx.user.name,
                role: "owner",
                status: "active",
            });
            const [newBrand] = await tx.insert(brands, {
                workspaceId: newWorkspace.id,
                name: brandName,
                websiteUrl,
                industry,
                description,
                productsServices,
                targetAudience,
                brandVoice,
                tone,
                marketingGoals,
                contentPillars,
                suggestedHashtags,
                isActive: true,
            });
            await tx.insert(aiConfigurations, {
                workspaceId: newWorkspace.id,
                provider: "openai",
                mode: aiBillingMode,
                encryptedApiKey: aiBillingMode === "byok" && byokApiKey.startsWith("sk-") ? encryptSecret(byokApiKey) : null,
                keyLast4: aiBillingMode === "byok" && byokApiKey.startsWith("sk-") ? byokApiKey.slice(-4) : null,
                keyValidated: false,
                preferredModel: "gpt-4o-mini",
            });
            await tx.insert(agentConfigurations, {
                workspaceId: newWorkspace.id,
                brandId: newBrand.id,
                mode: plan.autopilotEnabled ? "assisted" : "manual",
                allowedPlatforms: selectedPlatforms,
                objectives: marketingGoals,
                currentStrategy: `Execute multi-platform growth across ${selectedPlatforms.join(", ")} aligned with ${brandName}'s core pillars.`,
            });
            await tx.insert(notifications, {
                workspaceId: newWorkspace.id,
                userId: ctx.user.id,
                type: "agent_action",
                title: `Workspace '${workspaceName}' is ready`,
                message: `Brand profile saved for ${brandName}. Connect your own platform credentials to enable publishing.`,
                actionHref: "/app/social",
            });
            await tx.insert(auditLogs, {
                workspaceId: newWorkspace.id,
                actorEmail: ctx.user.email,
                action: "onboarding.completed",
                resourceType: "workspace",
                resourceId: String(newWorkspace.id),
                metadata: { planSlug: plan.slug, aiBillingMode },
            });
            if (rawToken) {
                await tx.update(sessions, eq("tokenHash", hashToken(rawToken)), { activeWorkspaceId: newWorkspace.id });
            }
            return newWorkspace;
            });
            return NextResponse.json({
                ok: true,
                workspaceId: newWorkspace.id,
                redirectTo: "/app",
            });
        }
        return NextResponse.json({ error: "Invalid onboarding action" }, { status: 400 });
    }
    catch (err) {
        console.error("Onboarding API error:", err);
        return NextResponse.json({ error: err instanceof Error ? err.message : "Onboarding failed" }, { status: 500 });
    }
}
