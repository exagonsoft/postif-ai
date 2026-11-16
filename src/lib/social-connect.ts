import { db } from "@/db";
import { socialAccounts, socialCredentials, auditLogs, brands, workspaces } from "@/db/schema";
import { encryptSecret } from "./crypto";
import { assertSocialConnectCapacity } from "./social-lifecycle";
import { SocialProviderError, verifyCustomerConnection } from "./social-provider";
import type { SocialPlatform } from "./social-adapters";
import { assertBrandEntitlement } from "./entitlements";
import { socialLifecycleStatuses } from "@/db/social-lifecycle-schema";

export async function persistSocialConnection(input: { workspaceId: number; brandId: number; platform: SocialPlatform; actorEmail: string; verified: Awaited<ReturnType<typeof verifyCustomerConnection>> }) {
  const { workspaceId, brandId, platform, actorEmail, verified } = input;
  const encryptedCredentials = encryptSecret(JSON.stringify(verified.credentials));
  return db.transaction(async tx => {
    if (!(await tx.find(brands, { id: brandId, workspaceId })).length) throw new SocialProviderError("Brand not found.", 404);
    // Lock workspace before counting, including reconnects and OAuth completions.
    await tx.find(workspaces, { id: workspaceId }, { lock: true });
    await assertBrandEntitlement(workspaceId, brandId, tx);
    const [existing] = await tx.find(socialAccounts, { workspaceId, brandId, platform, handle: verified.handle });
    await assertSocialConnectCapacity(workspaceId, existing?.id, tx);
    const fields = { accountName: verified.name, handle: verified.handle, status: "connected", integrationMode: "customer_credentials", lastSyncAt: new Date(), lastError: null };
    const [account] = existing ? await tx.update(socialAccounts, { id: existing.id, workspaceId }, fields) : await tx.insert(socialAccounts, { workspaceId, brandId, platform, ...fields });
    const credentialFields = { workspaceId, encryptedCredentials, verifiedAt: new Date(), expiresAt: verified.credentials.expiresAt ? new Date(verified.credentials.expiresAt) : null };
    await tx.upsert(socialCredentials, "socialAccountId", { socialAccountId: account.id, ...credentialFields }, credentialFields);
    await tx.upsert(socialLifecycleStatuses, "socialAccountId", { workspaceId, socialAccountId: account.id }, { renewalStatus: "configured", renewalMessage: null, analyticsStatus: "not_checked", analyticsMessage: null, renewAfter: new Date(0), syncAfter: new Date(0), updatedAt: new Date() });
    await tx.insert(auditLogs, { workspaceId, actorEmail, action: "social_account.connected", resourceType: "social_account", resourceId: String(account.id), metadata: { platform, brandId, credentialOwner: "customer" } });
    return account;
  });
}
