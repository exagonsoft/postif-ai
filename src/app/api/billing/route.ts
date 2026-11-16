import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, aiConfigurations, auditLogs } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { BillingError } from "@/lib/paypal";
import { changeBillingSubscription, confirmBillingCheckout } from "@/lib/subscriptions";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ error: "Only workspace owners and admins can manage billing and AI keys." }, { status: 403 });
    const body = await req.json();
    const workspaceId = ctx.workspace.id;
    if (body.action === "topup_credits") return NextResponse.json({ error: "Credit top-ups are disabled pending pricing." }, { status: 501 });
    if (body.action === "refresh_subscription") {
      if (ctx.memberRole !== "owner") return NextResponse.json({ error: "Only the workspace owner can reconcile PayPal." }, { status: 403 });
      return NextResponse.json({ ok: true, ...await confirmBillingCheckout(workspaceId) });
    }
    if (body.action === "change_plan") {
      if (ctx.memberRole !== "owner") return NextResponse.json({ error: "Only the workspace owner can change subscriptions." }, { status: 403 });
      if (typeof body.planSlug !== "string" || (body.planSlug !== "free" && !["monthly", "annual"].includes(body.billingCycle))) return NextResponse.json({ error: "Choose a catalog plan and billing cycle." }, { status: 400 });
      if (body.planSlug !== "free" && !Number.isSafeInteger(body.catalogVersionId)) throw new BillingError("Refresh the published catalog before changing plans.", 400);
      return NextResponse.json({ ok: true, ...await changeBillingSubscription(workspaceId, body.planSlug, body.billingCycle === "annual" ? "year" : "month", body.catalogVersionId) });
    }
    if (body.action === "revoke_byok") {
      await db.update(aiConfigurations, { workspaceId }, { encryptedApiKey: null, keyLast4: null, keyValidated: false, updatedAt: new Date() });
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "save_ai_config") return NextResponse.json({ error: "Invalid billing action." }, { status: 400 });
    if (!["byok", "managed"].includes(body.mode)) return NextResponse.json({ error: "Invalid AI billing mode." }, { status: 400 });
    const mode: "byok" | "managed" = body.mode;
    const { plan } = await getWorkspaceEntitlements(workspaceId);
    if (!plan.allowsConfigurableAiMode && mode !== plan.defaultAiMode) return NextResponse.json({ error: `Your plan requires ${plan.defaultAiMode === "byok" ? "your own API key (BYOK)" : "Managed AI"}.` }, { status: 403 });
    const preferredModel = String(body.preferredModel || "gpt-4o-mini").trim();
    const rawKey = String(body.apiKey || "").trim();
    const [existing] = await db.find(aiConfigurations, { workspaceId });
    const key = mode === "byok" ? rawKey || (existing?.encryptedApiKey && decryptSecret(existing.encryptedApiKey)) : process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: mode === "byok" ? "Provide your OpenAI API key." : "Managed OpenAI is not configured. Use your own API key." }, { status: 422 });
    const check = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(preferredModel)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!check.ok) return NextResponse.json({ error: `OpenAI rejected the key or model (HTTP ${check.status}). Settings were not saved.` }, { status: 422 });
    const configuration = { provider: "openai", mode, preferredModel, ...(mode === "byok" ? { encryptedApiKey: encryptSecret(key), keyLast4: key.slice(-4), keyValidated: true } : {}), updatedAt: new Date() };
    await db.transaction(async tx => {
      const { plan: currentPlan } = await getWorkspaceEntitlements(workspaceId, tx);
      if (!currentPlan.allowsConfigurableAiMode && mode !== currentPlan.defaultAiMode) throw new BillingError("Your plan no longer allows this AI billing mode.", 403);
      await tx.upsert(aiConfigurations, "workspaceId", { workspaceId, ...configuration }, configuration);
      await tx.update(workspaces, { id: workspaceId }, { aiBillingMode: mode });
      await tx.insert(auditLogs, { workspaceId, actorEmail: ctx.user.email, action: "ai_config.updated", resourceType: "ai_configuration", resourceId: String(workspaceId), metadata: { mode, preferredModel } });
    });
    return NextResponse.json({ ok: true, message: mode === "byok" ? "OpenAI model access verified. Your key is stored encrypted." : "Managed OpenAI model access verified. Platform credits apply." });
  } catch (error) {
    console.error("AI configuration failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: error instanceof BillingError ? error.message : "AI configuration failed. Check provider availability and encryption settings." }, { status: error instanceof BillingError ? error.status : 502 });
  }
}
