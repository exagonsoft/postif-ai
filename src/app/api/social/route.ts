import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { socialAccounts, socialCredentials, auditLogs } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { assertSocialConnectCapacity, renewSocialCredentials } from "@/lib/social-lifecycle";
import { persistSocialConnection } from "@/lib/social-connect";
import { customerCredentials, SocialProviderError, verifyCustomerConnection } from "@/lib/social-provider";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "@/lib/social-adapters";
import { WorkflowError } from "@/lib/post-policy";
import { assertBrandEntitlement } from "@/lib/entitlements";
import { socialOAuthAttempts, socialLifecycleStatuses } from "@/db/social-lifecycle-schema";
import { withWorkerDeadline } from "@/lib/worker-network";
import { assertSocialMutationOrigin, managedSocialErrorCode } from "@/lib/social-managed-oauth";
import { revokeManagedSocialGrant } from "@/lib/social-managed-revocation";

export async function POST(req: Request) {
  return withWorkerDeadline(Date.now() + 20000, () => socialAction(req));
}
async function socialAction(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ error: "Only workspace owners and admins can manage social credentials." }, { status: 403 });
    assertSocialMutationOrigin(req);
    const body = z.object({ action: z.enum(["connect", "refresh", "renew", "disconnect"]), revokeProvider: z.boolean().default(false), accountId: z.number().int().positive().optional(), brandId: z.number().int().positive().optional(), platform: z.string().optional(), credentials: customerCredentials.omit({ oauthMode: true, grantedScopes: true }).optional() }).parse(await req.json());
    const workspaceId = ctx.workspace.id;
    if (body.action === "disconnect") {
      if (!body.accountId) throw new SocialProviderError("Choose an account.");
      const completed = await db.withLease(`social:${workspaceId}:${body.accountId}`, async () => {
        let expectedCredentials: string | undefined;
        if (body.revokeProvider) {
          const [account] = await db.find(socialAccounts, { id: body.accountId, workspaceId });
          const [stored] = await db.find(socialCredentials, { socialAccountId: body.accountId, workspaceId });
          const decrypted = stored && decryptSecret(stored.encryptedCredentials);
          if (!account || !Object.hasOwn(SOCIAL_PLATFORM_SPECS, account.platform) || !decrypted) throw new SocialProviderError("Account credentials not found.", 404);
          expectedCredentials = stored.encryptedCredentials;
          await revokeManagedSocialGrant(account.platform as SocialPlatform, customerCredentials.parse(JSON.parse(decrypted)));
        }
        await db.transaction(async tx => {
        const [account] = await tx.find(socialAccounts, { id: body.accountId, workspaceId }, { lock: true });
        if (!account) throw new SocialProviderError("Account not found.", 404);
        if (expectedCredentials) {
          const [current] = await tx.find(socialCredentials, { socialAccountId: account.id, workspaceId }, { lock: true });
          if (current?.encryptedCredentials !== expectedCredentials) throw new SocialProviderError("Connection changed while revoking. Verify the current connection.", 409);
        }
        await tx.remove(socialCredentials, { socialAccountId: account.id, workspaceId });
        await tx.remove(socialOAuthAttempts, { workspaceId, brandId: account.brandId, platform: account.platform });
        await tx.upsert(socialLifecycleStatuses, "socialAccountId", { workspaceId, socialAccountId: account.id }, { renewalStatus: "disconnected", renewalMessage: body.revokeProvider ? "Provider confirmed grant revocation and local credentials were deleted." : "Local credentials deleted. Revoke authorization with the provider separately.", analyticsStatus: "paused", analyticsMessage: "Account disconnected.", updatedAt: new Date() });
        await tx.update(socialAccounts, { id: account.id }, { status: "disconnected", lastSyncAt: new Date(), lastError: null });
        await tx.insert(auditLogs, { workspaceId, actorEmail: ctx.user.email, action: "social_account.disconnected", resourceType: "social_account", resourceId: String(account.id), metadata: { revocation: body.revokeProvider ? "revoked" : "local_only" } });
        });
        return true;
      }, false);
      if (!completed) throw new SocialProviderError("Another account operation is in progress. Retry disconnecting.", 409);
      return NextResponse.json({ ok: true, revocation: body.revokeProvider ? "revoked" : "local_only" });
    }
    if (body.action === "renew") {
      if (!body.accountId || !(await db.find(socialAccounts, { id: body.accountId, workspaceId })).length) throw new SocialProviderError("Account not found.", 404);
      const result = await renewSocialCredentials({ workspaceId, accountId: body.accountId, deadline: Date.now() + 20000, limit: 1 });
      return NextResponse.json(result.failed ? { error: "Token could not be renewed. Review the account lifecycle status and reconnect if needed.", ...result } : result.skipped ? { error: "Account is unavailable or another operation is already in progress. Retry later.", ...result } : result, { status: result.failed ? 422 : result.skipped ? 409 : 200 });
    }
    if (body.action === "refresh") {
      if (!body.accountId) throw new SocialProviderError("Choose an account.");
      const [account] = await db.find(socialAccounts, { id: body.accountId, workspaceId });
      if (!account || !Object.hasOwn(SOCIAL_PLATFORM_SPECS, account.platform)) throw new SocialProviderError("Account not found.", 404);
      await assertBrandEntitlement(workspaceId, account.brandId);
      const [stored] = await db.find(socialCredentials, { socialAccountId: account.id, workspaceId });
      const decrypted = stored && decryptSecret(stored.encryptedCredentials);
      if (!decrypted) throw new SocialProviderError("Reconnect this account with your own provider access token.");
      let providerVerified = false;
      try {
        const verified = await verifyCustomerConnection(account.platform as SocialPlatform, customerCredentials.parse(JSON.parse(decrypted)));
        providerVerified = true;
        const updated = await db.transaction(async tx => {
          await assertSocialConnectCapacity(workspaceId, account.id, tx);
          await assertBrandEntitlement(workspaceId, account.brandId, tx);
          const [current] = await tx.find(socialCredentials, { socialAccountId: stored.socialAccountId, workspaceId }, { lock: true });
          if (current?.encryptedCredentials !== stored.encryptedCredentials) throw new SocialProviderError("Connection changed. Retry verification.", 409);
          const [updated] = await tx.update(socialAccounts, { id: account.id, workspaceId, status: { $ne: "disconnected" } }, { accountName: verified.name, handle: verified.handle, status: "connected", lastSyncAt: new Date(), lastError: null });
          if (!updated) throw new SocialProviderError("Reconnect this disconnected account.", 409);
          return updated;
        });
        return NextResponse.json({ ok: true, account: updated });
      } catch (error) {
        if (!providerVerified) await db.transaction(async tx => {
          const [current] = await tx.find(socialCredentials, { socialAccountId: stored.socialAccountId, workspaceId }, { lock: true });
          if (current?.encryptedCredentials === stored.encryptedCredentials) await tx.update(socialAccounts, { id: account.id, workspaceId, status: { $ne: "disconnected" } }, { status: "needs_review", lastError: "Credential verification failed. Replace the token or review platform permissions." });
        });
        throw error;
      }
    }
    if (!body.platform || !Object.hasOwn(SOCIAL_PLATFORM_SPECS, body.platform)) throw new SocialProviderError("Unsupported social platform.");
    if (!body.credentials) throw new SocialProviderError("Provide your own platform-issued access token.");
    const platform = body.platform as SocialPlatform;
    const brandId = body.brandId || ctx.activeBrand.id;
    await assertBrandEntitlement(workspaceId, brandId);
    const verified = await verifyCustomerConnection(platform, body.credentials);
    const account = await persistSocialConnection({ workspaceId, brandId, platform, actorEmail: ctx.user.email, verified });
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid account details or credential format." }, { status: 400 });
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message, code: managedSocialErrorCode(error) }, { status: error.status });
    if (error instanceof SocialProviderError) return NextResponse.json({ error: error.message, code: managedSocialErrorCode(error) }, { status: error.status >= 500 ? 502 : error.status === 401 ? 422 : error.status });
    console.error("Social connection failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Social connection failed. Check provider availability and encryption configuration." }, { status: 500 });
  }
}
