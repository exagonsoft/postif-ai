import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, sessions, workspaces, workspaceMembers, brands, aiConfigurations, agentConfigurations } from "@/db/schema";
import { eq } from "@/db/filters";
import { generateSessionToken, hashPassword, hashToken, verifyPassword, } from "@/lib/crypto";
import { getAuthContext, SESSION_COOKIE_NAME } from "@/lib/auth";
import { completeAccountAction, requestAccountEmail } from "@/lib/account-email";
import { WorkflowError } from "@/lib/post-policy";
import { validateAccountRegistration } from "@/lib/account-registration";
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const action = body.action as string;
        if (action === "logout") {
            const cookieStore = await cookies();
            const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
            if (rawToken) {
                await db.remove(sessions, eq("tokenHash", hashToken(rawToken)));
            }
            cookieStore.delete(SESSION_COOKIE_NAME);
            return NextResponse.json({ ok: true });
        }
        if (action === "recover_password") {
            const email = String(body.email || "").trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new WorkflowError("Enter a valid email address.");
            await requestAccountEmail(email, "reset_password");
            return NextResponse.json({ ok: true, message: "If this email has an account, a recovery link has been sent." });
        }
        if (action === "send_verification") {
            const ctx = await getAuthContext();
            if (!ctx) throw new WorkflowError("Sign in to verify your email.", 401);
            await requestAccountEmail(ctx.user.email, "verify_email");
            return NextResponse.json({ ok: true });
        }
        if (action === "verify_email" || action === "reset_password") {
            const result = await completeAccountAction(String(body.token || ""), action, typeof body.password === "string" ? body.password : undefined);
            return NextResponse.json(result);
        }
        if (action === "login") {
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");
            if (email.length > 254 || password.length > 1024) throw new WorkflowError("Invalid email or password.");
            const [user] = await db.find(users, eq("email", email), {});
            if (!user || !verifyPassword(password, user.passwordHash)) {
                return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
            }
            const token = generateSessionToken();
            const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
            await db.insert(sessions, {
                userId: user.id,
                tokenHash: hashToken(token),
                expiresAt,
            });
            const cookieStore = await cookies();
            cookieStore.set(SESSION_COOKIE_NAME, token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                expires: expiresAt,
            });
            return NextResponse.json({ ok: true, redirectTo: user.systemRole === "operator" ? "/app/admin" : "/app" });
        }
        if (action === "register") {
            const { name, email, password } = validateAccountRegistration(body);
            const workspaceName = String(body.workspaceName || `${name}'s Workspace`).trim();
            if (workspaceName.length > 300) {
                return NextResponse.json({ error: "Please provide a name, valid email, and a password of at least 12 characters." }, { status: 400 });
            }
            const existing = await db.find(users, eq("email", email), {});
            if (existing.length > 0) {
                return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
            }
            const passwordHash = hashPassword(password);
            const { newUser, ws } = await db.transaction(async tx => {
            const [newUser] = await tx.insert(users, {
                name,
                email,
                passwordHash,
                systemRole: "user",
                emailVerified: false,
            });
            const slug = `${workspaceName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")}-${crypto.randomUUID()}`;
            const [ws] = await tx.insert(workspaces, {
                name: workspaceName,
                slug,
                ownerId: newUser.id,
                planSlug: "free",
                billingCycle: "monthly",
                aiBillingMode: "byok",
                aiCreditsBalance: 0,
                aiCreditsMonthlyAllowance: 0,
                postsPublishedThisMonth: 0,
            });
            await tx.insert(workspaceMembers, {
                workspaceId: ws.id,
                userId: newUser.id,
                invitedEmail: newUser.email,
                memberName: newUser.name,
                role: "owner",
                status: "active",
            });
            const [brand] = await tx.insert(brands, {
                workspaceId: ws.id,
                name: workspaceName,
            });
            await tx.insert(aiConfigurations, {
                workspaceId: ws.id,
                provider: "openai",
                mode: "byok",
                preferredModel: "gpt-4o-mini",
            });
            await tx.insert(agentConfigurations, {
                workspaceId: ws.id,
                brandId: brand.id,
                mode: "manual",
                allowedPlatforms: [],
            });
            return { newUser, ws };
            });
            const token = generateSessionToken();
            const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
            await db.insert(sessions, {
                userId: newUser.id,
                tokenHash: hashToken(token),
                activeWorkspaceId: ws.id,
                expiresAt,
            });
            const cookieStore = await cookies();
            cookieStore.set(SESSION_COOKIE_NAME, token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                expires: expiresAt,
            });
            return NextResponse.json({ ok: true, redirectTo: "/onboarding" });
        }
        if (action === "switch_workspace") {
            const workspaceId = Number(body.workspaceId);
            const ctx = await getAuthContext();
            if (!ctx || !ctx.workspaces.some(workspace => workspace.id === workspaceId)) {
                return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
            }
            const cookieStore = await cookies();
            const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
            if (rawToken) {
                await db.update(sessions, eq("tokenHash", hashToken(rawToken)), { activeWorkspaceId: workspaceId });
            }
            return NextResponse.json({ ok: true });
        }
        return NextResponse.json({ error: "Unsupported auth action" }, { status: 400 });
    }
    catch (err) {
        if (err instanceof WorkflowError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error("Authentication request failed", { type: err instanceof Error ? err.name : "unknown" });
        return NextResponse.json({ error: "Authentication request failed" }, { status: 500 });
    }
}
