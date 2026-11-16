import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { socialAccounts, socialCredentials, auditLogs, brands, workspaces } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { getPlanDefinition } from "@/lib/plans";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { customerCredentials, SocialProviderError, verifyCustomerConnection } from "@/lib/social-provider";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "@/lib/social-adapters";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ error: "Only workspace owners and admins can manage social credentials." }, { status: 403 });
    const body = z.object({ action: z.enum(["connect", "refresh", "disconnect"]), accountId: z.number().int().positive().optional(), brandId: z.number().int().positive().optional(), platform: z.string().optional(), credentials: customerCredentials.optional() }).parse(await req.json());
    const workspaceId = ctx.workspace.id;
    if (body.action === "disconnect") {
      if (!body.accountId) throw new SocialProviderError("Choose an account.");
      await db.transaction(async tx => {
        const [account] = await tx.find(socialAccounts, { id: body.accountId, workspaceId }, { lock: true });
        if (!account) throw new SocialProviderError("Account not found.", 404);
        await tx.remove(socialCredentials, { socialAccountId: account.id, workspaceId });
        await tx.update(socialAccounts, { id: account.id }, { status: "disconnected", lastSyncAt: new Date(), lastError: null });
        await tx.insert(auditLogs, { workspaceId, actorEmail: ctx.user.email, action: "social_account.disconnected", resourceType: "social_account", resourceId: String(account.id) });
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "refresh") {
      const [account] = await db.find(socialAccounts, { id: body.accountId, workspaceId });
      if (!account || !Object.hasOwn(SOCIAL_PLATFORM_SPECS, account.platform)) throw new SocialProviderError("Account not found.", 404);
      const [stored] = await db.find(socialCredentials, { socialAccountId: account.id, workspaceId });
      const decrypted = stored && decryptSecret(stored.encryptedCredentials);
      if (!decrypted) throw new SocialProviderError("Reconnect this account with your own provider access token.");
      try {
        const verified = await verifyCustomerConnection(account.platform as SocialPlatform, customerCredentials.parse(JSON.parse(decrypted)));
        const [updated] = await db.update(socialAccounts, { id: account.id, workspaceId }, { accountName: verified.name, handle: verified.handle, status: "connected", lastSyncAt: new Date(), lastError: null });
        return NextResponse.json({ ok: true, account: updated });
      } catch (error) {
        await db.update(socialAccounts, { id: account.id, workspaceId }, { status: "needs_review", lastError: "Credential verification failed. Replace the token or review platform permissions." });
        throw error;
      }
    }
    if (!body.platform || !Object.hasOwn(SOCIAL_PLATFORM_SPECS, body.platform)) throw new SocialProviderError("Unsupported social platform.");
    if (!body.credentials) throw new SocialProviderError("Provide your own platform-issued access token.");
    const platform = body.platform as SocialPlatform;
    const brandId = body.brandId || ctx.activeBrand.id;
    if (!(await db.find(brands, { id: brandId, workspaceId })).length) throw new SocialProviderError("Brand not found.", 404);
    const verified = await verifyCustomerConnection(platform, body.credentials);
    const encryptedCredentials = encryptSecret(JSON.stringify(verified.credentials));
    const account = await db.transaction(async tx => {
      const [workspace] = await tx.find(workspaces, { id: workspaceId }, { lock: true });
      if (!workspace) throw new SocialProviderError("Workspace not found.", 404);
      const [existing] = await tx.find(socialAccounts, { workspaceId, brandId, platform, handle: verified.handle });
      const connected = await tx.find(socialAccounts, { workspaceId, status: "connected" });
      if (existing?.status !== "connected" && connected.length >= getPlanDefinition(workspace.planSlug).maxChannels) throw new SocialProviderError("Your plan's connected-channel limit has been reached.", 403);
      const fields = { accountName: verified.name, handle: verified.handle, status: "connected", integrationMode: "customer_credentials", lastSyncAt: new Date(), lastError: null };
      const [account] = existing ? await tx.update(socialAccounts, { id: existing.id }, fields) : await tx.insert(socialAccounts, { workspaceId, brandId, platform, ...fields });
      const credentialFields = { workspaceId, encryptedCredentials, verifiedAt: new Date(), expiresAt: verified.credentials.expiresAt ? new Date(verified.credentials.expiresAt) : null };
      await tx.upsert(socialCredentials, "socialAccountId", { socialAccountId: account.id, ...credentialFields }, credentialFields);
      await tx.insert(auditLogs, { workspaceId, actorEmail: ctx.user.email, action: "social_account.connected", resourceType: "social_account", resourceId: String(account.id), metadata: { platform, brandId, credentialOwner: "customer" } });
      return account;
    });
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid account details or credential format." }, { status: 400 });
    if (error instanceof SocialProviderError) return NextResponse.json({ error: error.message }, { status: error.status >= 500 ? 502 : error.status === 401 ? 422 : error.status });
    console.error("Social connection failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Social connection failed. Check provider availability and encryption configuration." }, { status: 500 });
  }
}
