import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  workspaces,
  workspaceMembers,
  brands,
  socialAccounts,
  aiConfigurations,
  agentConfigurations,
  notifications,
  auditLogs,
  sessions,
} from "@/db/schema";
import { eq } from "drizzle-orm";
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
      const industry = String(body.industry || "SaaS & Technology").trim();
      const description = String(body.description || "").trim();
      const productsServices = String(body.productsServices || "").trim();
      const targetAudience = String(body.targetAudience || "").trim();
      const brandVoice = String(body.brandVoice || "Clear & Authoritative").trim();
      const tone = String(body.tone || "Professional").trim();
      const marketingGoals = Array.isArray(body.marketingGoals) ? body.marketingGoals : [];
      const contentPillars = Array.isArray(body.contentPillars) ? body.contentPillars : [];
      const suggestedHashtags = Array.isArray(body.suggestedHashtags)
        ? body.suggestedHashtags
        : [];
      const selectedPlatforms = Array.isArray(body.platforms)
        ? body.platforms
        : ["linkedin", "x"];
      const aiBillingMode = body.aiBillingMode === "byok" ? "byok" : "managed";
      const byokApiKey = String(body.byokApiKey || "").trim();
      const planSlug = String(body.planSlug || "pro_ai");
      const plan = getPlanDefinition(planSlug);

      const slug = `${workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

      const [newWorkspace] = await db
        .insert(workspaces)
        .values({
          name: workspaceName,
          slug,
          ownerId: ctx.user.id,
          planSlug: plan.slug,
          billingCycle: "monthly",
          aiBillingMode,
          aiCreditsBalance: plan.includedMonthlyCredits || 50,
          aiCreditsMonthlyAllowance: plan.includedMonthlyCredits,
          postsPublishedThisMonth: 0,
        })
        .returning();

      await db.insert(workspaceMembers).values({
        workspaceId: newWorkspace.id,
        userId: ctx.user.id,
        invitedEmail: ctx.user.email,
        memberName: ctx.user.name,
        role: "owner",
        status: "active",
      });

      const [newBrand] = await db
        .insert(brands)
        .values({
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
        })
        .returning();

      if (selectedPlatforms.length > 0) {
        await db.insert(socialAccounts).values(
          selectedPlatforms.slice(0, plan.maxChannels).map((platform: string) => ({
            workspaceId: newWorkspace.id,
            brandId: newBrand.id,
            platform,
            accountName: `${brandName} (${platform.toUpperCase()})`,
            handle: `@${brandName.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
            accountType: "Business",
            status: "connected",
            integrationMode: "simulated_sandbox",
            permissions: ["publish", "read_insights"],
            rateLimitRemaining: 95,
            rateLimitMax: 100,
            followersCount: 0,
          }))
        );
      }

      await db.insert(aiConfigurations).values({
        workspaceId: newWorkspace.id,
        provider: "openai",
        mode: aiBillingMode,
        encryptedApiKey:
          aiBillingMode === "byok" && byokApiKey.startsWith("sk-")
            ? encryptSecret(byokApiKey)
            : null,
        keyLast4:
          aiBillingMode === "byok" && byokApiKey.startsWith("sk-")
            ? byokApiKey.slice(-4)
            : null,
        keyValidated: aiBillingMode === "byok" && byokApiKey.startsWith("sk-"),
        preferredModel: "gpt-4o-mini",
      });

      await db.insert(agentConfigurations).values({
        workspaceId: newWorkspace.id,
        brandId: newBrand.id,
        mode: plan.autopilotEnabled ? "assisted" : "manual",
        allowedPlatforms: selectedPlatforms,
        objectives: marketingGoals,
        currentStrategy: `Execute multi-platform growth across ${selectedPlatforms.join(
          ", "
        )} aligned with ${brandName}'s core pillars.`,
      });

      await db.insert(notifications).values({
        workspaceId: newWorkspace.id,
        userId: ctx.user.id,
        type: "agent_action",
        title: `Workspace '${workspaceName}' is ready`,
        message: `AI Brand Discovery configured ${brandName} with ${selectedPlatforms.length} connected channel(s).`,
        actionHref: "/app",
      });

      await db.insert(auditLogs).values({
        workspaceId: newWorkspace.id,
        actorEmail: ctx.user.email,
        action: "onboarding.completed",
        resourceType: "workspace",
        resourceId: String(newWorkspace.id),
        metadata: { planSlug: plan.slug, aiBillingMode },
      });

      const cookieStore = await cookies();
      const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (rawToken) {
        await db
          .update(sessions)
          .set({ activeWorkspaceId: newWorkspace.id })
          .where(eq(sessions.tokenHash, hashToken(rawToken)));
      }

      return NextResponse.json({
        ok: true,
        workspaceId: newWorkspace.id,
        redirectTo: "/app",
      });
    }

    return NextResponse.json({ error: "Invalid onboarding action" }, { status: 400 });
  } catch (err) {
    console.error("Onboarding API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Onboarding failed" },
      { status: 500 }
    );
  }
}
