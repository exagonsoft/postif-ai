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
        const createWorkspace = body.createWorkspace === true;
        if (!createWorkspace && ctx.memberRole !== "owner") {
            return NextResponse.json({ error: "Only the workspace owner can complete brand onboarding." }, { status: 403 });
        }
        if (body.workspaceId !== undefined && body.workspaceId !== ctx.workspace.id) {
            return NextResponse.json({ error: "Your active workspace changed. Reload onboarding before continuing." }, { status: 409 });
        }
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
            const rawToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
            const workspaceId = await db.transaction(async tx => {
            let workspace;
            if (createWorkspace) {
                [workspace] = await tx.insert(workspaces, {
                    name: workspaceName,
                    slug: `${workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID()}`,
                    ownerId: ctx.user.id,
                    planSlug: plan.slug,
                    aiBillingMode,
                });
                await tx.insert(workspaceMembers, {
                    workspaceId: workspace.id,
                    userId: ctx.user.id,
                    invitedEmail: ctx.user.email,
                    memberName: ctx.user.name,
                    role: "owner",
                    status: "active",
                });
            } else {
                [workspace] = await tx.find(workspaces, { id: ctx.workspace.id, ownerId: ctx.user.id }, { lock: true });
                if (!workspace) return null;
                const [completed] = await tx.find(auditLogs, { workspaceId: workspace.id, action: "onboarding.completed" }, { limit: 1 });
                if (completed) return workspace.id;
            }
            await tx.update(workspaces, eq("id", workspace.id), {
                name: workspaceName,
                aiBillingMode,
            });
            const brandValues = {
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
            };
            const [existingBrand] = await tx.find(brands, eq("workspaceId", workspace.id), { sort: { id: 1 }, limit: 1 });
            const [brand] = existingBrand
                ? await tx.update(brands, { id: existingBrand.id, workspaceId: workspace.id }, brandValues)
                : await tx.insert(brands, { workspaceId: workspace.id, ...brandValues });
            await tx.upsert(aiConfigurations, "workspaceId", {
                workspaceId: workspace.id,
            }, {
                provider: "openai",
                mode: aiBillingMode,
                ...(aiBillingMode === "byok" && byokApiKey ? {
                    encryptedApiKey: encryptSecret(byokApiKey),
                    keyLast4: byokApiKey.slice(-4),
                    keyValidated: false,
                } : {}),
                updatedAt: new Date(),
            });
            await tx.upsert(agentConfigurations, "workspaceId", {
                workspaceId: workspace.id,
            }, {
                brandId: brand.id,
                mode: plan.autopilotEnabled ? "assisted" : "manual",
                allowedPlatforms: selectedPlatforms,
                objectives: marketingGoals,
                currentStrategy: `Execute multi-platform growth across ${selectedPlatforms.join(", ")} aligned with ${brandName}'s core pillars.`,
                updatedAt: new Date(),
            });
            await tx.insert(notifications, {
                workspaceId: workspace.id,
                userId: ctx.user.id,
                type: "agent_action",
                title: `Workspace '${workspaceName}' is ready`,
                message: `Brand profile saved for ${brandName}. Connect your own platform credentials to enable publishing.`,
                actionHref: "/app/social",
            });
            await tx.insert(auditLogs, {
                workspaceId: workspace.id,
                actorEmail: ctx.user.email,
                action: "onboarding.completed",
                resourceType: "workspace",
                resourceId: String(workspace.id),
                metadata: { planSlug: plan.slug, aiBillingMode },
            });
            if (createWorkspace && rawToken) {
                await tx.update(sessions, eq("tokenHash", hashToken(rawToken)), { activeWorkspaceId: workspace.id });
            }
            return workspace.id;
            });
            if (workspaceId === null) {
                return NextResponse.json({ error: "Workspace ownership changed. Reload before continuing." }, { status: 403 });
            }
            return NextResponse.json({
                ok: true,
                workspaceId,
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
