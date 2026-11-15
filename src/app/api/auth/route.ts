import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  users,
  sessions,
  workspaces,
  workspaceMembers,
  brands,
  aiConfigurations,
  agentConfigurations,
  auditLogs,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/crypto";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const action = body.action as string;

    if (action === "logout") {
      const cookieStore = await cookies();
      const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (rawToken) {
        await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));
      }
      cookieStore.delete(SESSION_COOKIE_NAME);
      return NextResponse.json({ ok: true });
    }

    if (action === "recover_password") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) {
        return NextResponse.json({ error: "Email address is required." }, { status: 400 });
      }
      await db.insert(auditLogs).values({
        actorEmail: email,
        action: "auth.password_recovery_requested",
        resourceType: "user",
        resourceId: email,
        metadata: { delivery: "simulated_transactional_email" },
      });
      return NextResponse.json({
        ok: true,
        message:
          "If an account exists for that email, a password reset link has been queued (simulated email delivery in local environment).",
      });
    }

    if (action === "demo_login") {
      const [demoUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, "alex.mercer@nebulacloud.io"));
      if (!demoUser) {
        return NextResponse.json({ error: "Demo user unavailable" }, { status: 500 });
      }
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      await db.insert(sessions).values({
        userId: demoUser.id,
        tokenHash: hashToken(token),
        expiresAt,
      });
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
      return NextResponse.json({ ok: true, redirectTo: "/app" });
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return NextResponse.json(
          { error: "Invalid email or password." },
          { status: 401 }
        );
      }

      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      await db.insert(sessions).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
      });
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
      return NextResponse.json({ ok: true, redirectTo: "/app" });
    }

    if (action === "register") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const workspaceName = String(body.workspaceName || `${name}'s Workspace`).trim();

      if (!name || !email || password.length < 6) {
        return NextResponse.json(
          { error: "Please provide name, valid email, and a password of at least 6 characters." },
          { status: 400 }
        );
      }

      const existing = await db.select().from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }

      const [newUser] = await db
        .insert(users)
        .values({
          name,
          email,
          passwordHash: hashPassword(password),
          systemRole: "user",
          emailVerified: true,
        })
        .returning();

      const slug = `${workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

      const [ws] = await db
        .insert(workspaces)
        .values({
          name: workspaceName,
          slug,
          ownerId: newUser.id,
          planSlug: "pro_ai",
          billingCycle: "monthly",
          aiBillingMode: "managed",
          aiCreditsBalance: 250,
          aiCreditsMonthlyAllowance: 1000,
          postsPublishedThisMonth: 0,
        })
        .returning();

      await db.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: newUser.id,
        invitedEmail: newUser.email,
        memberName: newUser.name,
        role: "owner",
        status: "active",
      });

      const [brand] = await db
        .insert(brands)
        .values({
          workspaceId: ws.id,
          name: workspaceName,
          industry: "Technology & Digital",
          description: `Primary brand workspace for ${workspaceName}.`,
        })
        .returning();

      await db.insert(aiConfigurations).values({
        workspaceId: ws.id,
        provider: "openai",
        mode: "managed",
        preferredModel: "gpt-4o-mini",
      });

      await db.insert(agentConfigurations).values({
        workspaceId: ws.id,
        brandId: brand.id,
        mode: "assisted",
        allowedPlatforms: ["linkedin", "x", "instagram"],
        objectives: ["Build consistent multi-channel visibility"],
        currentStrategy: "Publish 3 educational and product-focused posts each week.",
      });

      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      await db.insert(sessions).values({
        userId: newUser.id,
        tokenHash: hashToken(token),
        activeWorkspaceId: ws.id,
        expiresAt,
      });

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });

      return NextResponse.json({ ok: true, redirectTo: "/onboarding" });
    }

    if (action === "switch_workspace") {
      const workspaceId = Number(body.workspaceId);
      const cookieStore = await cookies();
      const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (rawToken) {
        await db
          .update(sessions)
          .set({ activeWorkspaceId: workspaceId })
          .where(eq(sessions.tokenHash, hashToken(rawToken)));
      } else {
        // Create session for demo user with selected workspace
        const [demoUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, "alex.mercer@nebulacloud.io"));
        if (demoUser) {
          const token = generateSessionToken();
          const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
          await db.insert(sessions).values({
            userId: demoUser.id,
            tokenHash: hashToken(token),
            activeWorkspaceId: workspaceId,
            expiresAt,
          });
          cookieStore.set(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            expires: expiresAt,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported auth action" }, { status: 400 });
  } catch (err) {
    console.error("Auth API error:", err);
    return NextResponse.json({ error: "Authentication request failed" }, { status: 500 });
  }
}
