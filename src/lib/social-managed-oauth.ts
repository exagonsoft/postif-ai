import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { socialOAuthAttempts } from "@/db/social-lifecycle-schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "./social-adapters";
import { customerCredentials, SocialProviderError, verifyCustomerConnection } from "./social-provider";
import { assertBrandEntitlement } from "./entitlements";
import { persistSocialConnection } from "./social-connect";
import { managedSocialConfiguration } from "./social-managed-config";
import { managedCredentials, ManagedSocialOAuthError, type AuthorizedSocialDestination } from "./social-managed-provider";
import type { ManagedSocialSelection } from "./social-managed-types";
import { WorkflowError } from "./post-policy";

const ticketFormat = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const selectionPayload = z.object({
  stage: z.literal("select"), organizations: z.boolean(), analyticsEnabled: z.boolean(),
  destinations: z.array(z.object({
    id: z.string().min(1).max(250), name: z.string().min(1).max(500), handle: z.string().min(1).max(500),
    accountType: z.string().max(500), permissions: z.array(z.string().max(200)).max(100),
    privacyLevels: z.array(z.string().max(100)).max(20).optional(), credentials: customerCredentials,
  })).min(1).max(500),
});
export function managedSocialErrorCode(error: unknown): string {
  if (error instanceof ManagedSocialOAuthError) return error.code;
  if (error instanceof WorkflowError) return /channel/i.test(error.message) ? "CHANNEL_LIMIT" : "FORBIDDEN";
  if (error instanceof SocialProviderError) {
    if (/application changed/.test(error.message)) return "MANAGED_APP_CHANGED";
    if (/channel limit/i.test(error.message)) return "CHANNEL_LIMIT";
    if (error.status === 401) return "TOKEN_EXPIRED";
    if (error.status === 403) return "PERMISSION_MISSING";
    if (error.status >= 429) return "PROVIDER_UNAVAILABLE";
  }
  return error instanceof z.ZodError ? "INVALID_REQUEST" : "AUTHORIZATION_FAILED";
}
export function assertSocialMutationOrigin(req: Request) {
  const origin = req.headers.get("origin");
  let applicationOrigin: string | undefined;
  try { applicationOrigin = new URL(process.env.APP_URL || "").origin; } catch { /* Advanced token connections do not require a public OAuth origin. */ }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "") ||
    req.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(req.url).origin && origin !== applicationOrigin)) {
    throw new ManagedSocialOAuthError("FORBIDDEN", 403);
  }
}
export async function createManagedSelection(input: {
  workspaceId: number; userId: number; brandId: number; platform: SocialPlatform;
  organizations: boolean; analyticsEnabled: boolean; destinations: AuthorizedSocialDestination[];
}) {
  const payload = selectionPayload.parse({ stage: "select", organizations: input.organizations,
    analyticsEnabled: input.analyticsEnabled, destinations: input.destinations });
  const ticket = randomBytes(32).toString("base64url");
  await db.insert(socialOAuthAttempts, { workspaceId: input.workspaceId, userId: input.userId, brandId: input.brandId, platform: input.platform,
    stateHash: createHash("sha256").update(`select:${ticket}`).digest("hex"),
    encryptedPayload: encryptSecret(JSON.stringify(payload)), expiresAt: new Date(Date.now() + 600000) });
  return ticket;
}
async function selectionRecord(input: { workspaceId: number; userId: number; platform: string; ticket: string }) {
  if (!Object.hasOwn(SOCIAL_PLATFORM_SPECS, input.platform) || !ticketFormat.safeParse(input.ticket).success) throw new ManagedSocialOAuthError("STATE_INVALID");
  const filter = { workspaceId: input.workspaceId, userId: input.userId, platform: input.platform,
    stateHash: createHash("sha256").update(`select:${input.ticket}`).digest("hex"), consumedAt: null, expiresAt: { $gt: new Date() } };
  const [record] = await db.find(socialOAuthAttempts, filter);
  if (!record) throw new ManagedSocialOAuthError("STATE_INVALID");
  const decrypted = decryptSecret(record.encryptedPayload);
  if (!decrypted) throw new ManagedSocialOAuthError("STATE_INVALID");
  const payload = selectionPayload.parse(JSON.parse(decrypted));
  await assertBrandEntitlement(input.workspaceId, record.brandId);
  return { record, payload, filter, platform: input.platform as SocialPlatform };
}
export async function readManagedSelection(input: { workspaceId: number; userId: number; platform: string; ticket: string }): Promise<ManagedSocialSelection> {
  const { payload, platform } = await selectionRecord(input);
  return { platform, ticket: input.ticket, analyticsEnabled: payload.analyticsEnabled,
    publicPostingAvailable: managedSocialConfiguration().publicPosting.includes(platform),
    destinations: payload.destinations.map(({ id, name, handle, accountType, permissions, privacyLevels }) => ({
      id, name, handle, accountType, permissions, ...(privacyLevels ? { privacyLevels } : {}),
    })) };
}
export const managedSelectionInput = z.object({
  ticket: ticketFormat, destinationId: z.string().min(1).max(250),
  privacyLevel: customerCredentials.shape.privacyLevel,
  madeForKids: z.boolean().optional(), aiGenerated: z.boolean().optional(),
}).strict();
export async function selectManagedDestination(input: z.infer<typeof managedSelectionInput> & {
  workspaceId: number; userId: number; actorEmail: string; platform: string;
}) {
  const { record, payload, filter, platform } = await selectionRecord(input);
  const destination = payload.destinations.find(item => item.id === input.destinationId);
  if (!destination) throw new ManagedSocialOAuthError("ACCOUNT_UNSUPPORTED", 403);
  const current = managedCredentials(platform, payload.analyticsEnabled, payload.organizations);
  if (destination.credentials.oauthMode !== "managed" || current.clientId !== destination.credentials.clientId) throw new ManagedSocialOAuthError("MANAGED_APP_CHANGED", 422);
  const credentials = { ...destination.credentials };
  const publicPosting = managedSocialConfiguration().publicPosting.includes(platform);
  if (platform === "youtube") {
    if (!input.privacyLevel || !["private", "unlisted", "public"].includes(input.privacyLevel) || typeof input.madeForKids !== "boolean") throw new ManagedSocialOAuthError("INVALID_REQUEST");
    if (!publicPosting && input.privacyLevel !== "private") throw new ManagedSocialOAuthError("APPROVAL_REQUIRED", 403);
    credentials.privacyLevel = input.privacyLevel; credentials.madeForKids = input.madeForKids;
  }
  if (platform === "tiktok") {
    if (!input.privacyLevel || !destination.privacyLevels?.includes(input.privacyLevel) || typeof input.aiGenerated !== "boolean") throw new ManagedSocialOAuthError("INVALID_REQUEST");
    if (!publicPosting && input.privacyLevel !== "SELF_ONLY") throw new ManagedSocialOAuthError("APPROVAL_REQUIRED", 403);
    credentials.privacyLevel = input.privacyLevel; credentials.aiGenerated = input.aiGenerated;
  }
  const verified = await verifyCustomerConnection(platform, credentials);
  if (platform === "pinterest" || platform === "linkedin" && payload.organizations) {
    verified.handle = destination.handle;
    verified.name = destination.name;
  }
  return db.transaction(async tx => {
    const [claimed] = await tx.update(socialOAuthAttempts, { ...filter, expiresAt: { $gt: new Date() } }, { consumedAt: new Date(), encryptedPayload: "" });
    if (!claimed) throw new ManagedSocialOAuthError("STATE_INVALID");
    await persistSocialConnection({ workspaceId: input.workspaceId, brandId: record.brandId, platform, actorEmail: input.actorEmail, accountType: destination.accountType, verified }, tx);
  });
}
