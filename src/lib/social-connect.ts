import { db } from "@/db";
import { socialAccounts, socialCredentials, auditLogs, brands, workspaces } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { assertSocialConnectCapacity } from "./social-lifecycle";
import { customerCredentials, SocialProviderError, verifyCustomerConnection } from "./social-provider";
import type { SocialPlatform } from "./social-adapters";
import { assertBrandEntitlement } from "./entitlements";
import { socialLifecycleStatuses } from "@/db/social-lifecycle-schema";

export async function persistSocialConnection(input: { workspaceId: number; brandId: number; platform: SocialPlatform; actorEmail: string; accountType?: string; verified: Awaited<ReturnType<typeof verifyCustomerConnection>> }, connection?: typeof db) {
  const { workspaceId, brandId, platform, actorEmail, verified } = input;
  const encryptedCredentials = encryptSecret(JSON.stringify(verified.credentials));
  const persist = async (tx: typeof db) => {
    if (!(await tx.find(brands, { id: brandId, workspaceId })).length) throw new SocialProviderError("Brand not found.", 404);
    // Lock workspace before counting, including reconnects and OAuth completions.
    await tx.find(workspaces, { id: workspaceId }, { lock: true });
    await assertBrandEntitlement(workspaceId, brandId, tx);
    let [existing] = await tx.find(socialAccounts, { workspaceId, brandId, platform, handle: verified.handle });
    if (!existing && verified.credentials.oauthMode === "managed") {
      const candidates = await tx.find(socialAccounts, { workspaceId, brandId, platform });
      for (const candidate of candidates) {
        const [stored] = await tx.find(socialCredentials, { workspaceId, socialAccountId: candidate.id });
        if (!stored) continue;
        const decrypted = decryptSecret(stored.encryptedCredentials);
        if (!decrypted) throw new SocialProviderError("Existing connection identity cannot be read. Review its encrypted credentials.", 422);
        const previous = customerCredentials.parse(JSON.parse(decrypted));
        if (previous.accountId === verified.credentials.accountId && previous.boardId === verified.credentials.boardId) { existing = candidate; break; }
      }
    }
    await assertSocialConnectCapacity(workspaceId, existing?.id, tx);
    const managed = verified.credentials.oauthMode === "managed";
    const fields = { accountName: verified.name, handle: verified.handle, status: "connected", integrationMode: managed ? "managed_oauth" : "customer_credentials",
      ...(input.accountType ? { accountType: input.accountType } : {}),
      ...(verified.credentials.grantedScopes ? { permissions: verified.credentials.grantedScopes } : {}), lastSyncAt: new Date(), lastError: null };
    const [account] = existing ? await tx.update(socialAccounts, { id: existing.id, workspaceId }, fields) : await tx.insert(socialAccounts, { workspaceId, brandId, platform, ...fields });
    const credentialFields = { workspaceId, encryptedCredentials, verifiedAt: new Date(), expiresAt: verified.credentials.expiresAt ? new Date(verified.credentials.expiresAt) : null };
    await tx.upsert(socialCredentials, "socialAccountId", { socialAccountId: account.id, ...credentialFields }, credentialFields);
    await tx.upsert(socialLifecycleStatuses, "socialAccountId", { workspaceId, socialAccountId: account.id }, { renewalStatus: "configured", renewalMessage: null, analyticsStatus: "not_checked", analyticsMessage: null, renewAfter: new Date(0), syncAfter: new Date(0), updatedAt: new Date() });
    await tx.insert(auditLogs, { workspaceId, actorEmail, action: "social_account.connected", resourceType: "social_account", resourceId: String(account.id), metadata: { platform, brandId, credentialOwner: managed ? "platform" : "customer" } });
    return account;
  };
  return connection ? persist(connection) : db.transaction(persist);
}
