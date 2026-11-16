import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, aiConfigurations, auditLogs } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ error: "Only workspace owners and admins can manage billing and AI keys." }, { status: 403 });
    const body = await req.json();
    const workspaceId = ctx.workspace.id;
    if (["change_plan", "topup_credits"].includes(body.action)) return NextResponse.json({ error: "Payments are not enabled. Plans and credits can only be granted after verified payment." }, { status: 501 });
    if (body.action === "revoke_byok") {
      await db.update(aiConfigurations, { workspaceId }, { encryptedApiKey: null, keyLast4: null, keyValidated: false, updatedAt: new Date() });
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "save_ai_config") return NextResponse.json({ error: "Invalid billing action." }, { status: 400 });
    const mode = body.mode === "byok" ? "byok" : "managed";
    const preferredModel = String(body.preferredModel || "gpt-4o-mini").trim();
    const rawKey = String(body.apiKey || "").trim();
    const [existing] = await db.find(aiConfigurations, { workspaceId });
    const key = mode === "byok" ? rawKey || (existing?.encryptedApiKey && decryptSecret(existing.encryptedApiKey)) : process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: mode === "byok" ? "Provide your OpenAI API key." : "Managed OpenAI is not configured. Use your own API key." }, { status: 422 });
    const check = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(preferredModel)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!check.ok) return NextResponse.json({ error: `OpenAI rejected the key or model (HTTP ${check.status}). Settings were not saved.` }, { status: 422 });
    const configuration = { provider: "openai", mode, preferredModel, ...(mode === "byok" ? { encryptedApiKey: encryptSecret(key), keyLast4: key.slice(-4), keyValidated: true } : {}), updatedAt: new Date() };
    await db.transaction(async tx => {
      await tx.upsert(aiConfigurations, "workspaceId", { workspaceId, ...configuration }, configuration);
      await tx.update(workspaces, { id: workspaceId }, { aiBillingMode: mode });
      await tx.insert(auditLogs, { workspaceId, actorEmail: ctx.user.email, action: "ai_config.updated", resourceType: "ai_configuration", resourceId: String(workspaceId), metadata: { mode, preferredModel } });
    });
    return NextResponse.json({ ok: true, message: "OpenAI model access verified. Your key is stored encrypted." });
  } catch (error) {
    console.error("AI configuration failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "AI configuration failed. Check provider availability and encryption settings." }, { status: 502 });
  }
}
