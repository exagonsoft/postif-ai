import { NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts, auditLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";
import { checkPlatformLiveReadiness, SOCIAL_PLATFORM_SPECS, SocialPlatformSpec } from "@/lib/social-adapters";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace || !ctx.user || !ctx.activeBrand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "connect") {
      const platform = String(body.platform || "linkedin") as SocialPlatformSpec["id"];
      const spec = SOCIAL_PLATFORM_SPECS[platform];
      if (!spec) {
        return NextResponse.json({ error: "Unsupported social platform" }, { status: 400 });
      }

      const plan = getPlanDefinition(ctx.workspace.planSlug);
      const currentAccounts = await db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.workspaceId, ctx.workspace.id));

      const connectedCount = currentAccounts.filter((a) => a.status === "connected").length;
      if (connectedCount >= plan.maxChannels) {
        return NextResponse.json(
          {
            error: `Channel limit (${plan.maxChannels}) reached for ${plan.name}. Upgrade your plan to connect more accounts.`,
          },
          { status: 403 }
        );
      }

      const readiness = checkPlatformLiveReadiness(platform);
      const accountName =
        String(body.accountName || "").trim() || `${ctx.activeBrand.name} ${spec.name}`;
      const handle =
        String(body.handle || "").trim() ||
        `@${ctx.activeBrand.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

      const [account] = await db
        .insert(socialAccounts)
        .values({
          workspaceId: ctx.workspace.id,
          brandId: Number(body.brandId || ctx.activeBrand.id),
          platform,
          accountName,
          handle,
          accountType: String(body.accountType || "Business"),
          status: "connected",
          integrationMode: readiness.isLiveConfigured ? "oauth_live" : "simulated_sandbox",
          permissions: spec.officialScopes,
          rateLimitRemaining: spec.rateLimitPerHour,
          rateLimitMax: spec.rateLimitPerHour,
          followersCount: 1250 + Math.floor(Math.random() * 4800),
          lastSyncAt: new Date(),
        })
        .returning();

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: "social_account.connected",
        resourceType: "social_account",
        resourceId: String(account.id),
        metadata: {
          platform,
          integrationMode: account.integrationMode,
        },
      });

      return NextResponse.json({ ok: true, account, readiness });
    }

    if (action === "refresh") {
      const accountId = Number(body.accountId);
      const [existing] = await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.id, accountId),
            eq(socialAccounts.workspaceId, ctx.workspace.id)
          )
        );
      if (!existing) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }

      const readiness = checkPlatformLiveReadiness(existing.platform);
      const [updated] = await db
        .update(socialAccounts)
        .set({
          status: "connected",
          integrationMode: readiness.isLiveConfigured ? "oauth_live" : "simulated_sandbox",
          rateLimitRemaining: existing.rateLimitMax,
          lastSyncAt: new Date(),
          lastError: null,
        })
        .where(eq(socialAccounts.id, accountId))
        .returning();

      return NextResponse.json({ ok: true, account: updated });
    }

    if (action === "disconnect") {
      const accountId = Number(body.accountId);
      await db
        .update(socialAccounts)
        .set({
          status: "disconnected",
          lastSyncAt: new Date(),
        })
        .where(
          and(
            eq(socialAccounts.id, accountId),
            eq(socialAccounts.workspaceId, ctx.workspace.id)
          )
        );

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: "social_account.disconnected",
        resourceType: "social_account",
        resourceId: String(accountId),
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid social action" }, { status: 400 });
  } catch (err) {
    console.error("Social API error:", err);
    return NextResponse.json({ error: "Social connection update failed" }, { status: 500 });
  }
}
