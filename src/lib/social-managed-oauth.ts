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
import { instagramAssignedAccounts, managedCredentials, managedScopes, ManagedSocialOAuthError, type AuthorizedSocialDestination } from "./social-managed-provider";
import type { ManagedSocialSelection } from "./social-managed-types";
import { WorkflowError } from "./post-policy";
import { FacebookBusinessTokenError, facebookScopeForPage, inspectFacebookToken, inspectInstagramUnifiedToken, inspectThreadsToken } from "./social-oauth-provider";
import { reportFacebookGrantCheck } from "./facebook-oauth-diagnostics";

const ticketFormat = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const selectionPayload = z.object({
  stage: z.literal("select"), organizations: z.boolean(), analyticsEnabled: z.boolean(), facebookConfigId: z.string().regex(/^\d{1,32}$/).optional(),
  destinations: z.array(z.object({
    id: z.string().min(1).max(250), name: z.string().min(1).max(500), handle: z.string().min(1).max(500),
    accountType: z.string().max(500), permissions: z.array(z.string().max(200)).max(100),
    privacyLevels: z.array(z.string().max(100)).max(20).optional(), credentials: customerCredentials,
  })).min(1).max(500),
});
export function managedSocialErrorCode(error: unknown, platform?: string): string {
  if (error instanceof ManagedSocialOAuthError) return error.code;
  if (error instanceof FacebookBusinessTokenError) return error.code;
  if (error instanceof WorkflowError) return /channel/i.test(error.message) ? "CHANNEL_LIMIT" : /brand/i.test(error.message) ? "BRAND_LIMIT" : "AUTHORIZATION_FAILED";
  if (error instanceof SocialProviderError) {
    if (platform === "instagram" && error.status === 400 && /^Provider request failed \(HTTP 400\)\.$/.test(error.message)) return "INSTAGRAM_PROVIDER_REJECTED";
    if (/valid system-user token/.test(error.message)) return "INSTAGRAM_TOKEN_INVALID";
    if (/application changed/.test(error.message)) return "MANAGED_APP_CHANGED";
    if (/channel limit/i.test(error.message)) return "CHANNEL_LIMIT";
    if (error.status === 401) return "TOKEN_EXPIRED";
    if (error.status === 403) return "PERMISSION_MISSING";
    if (error.status >= 429) return "PROVIDER_UNAVAILABLE";
  }
  return error instanceof z.ZodError ? "INVALID_REQUEST" : "AUTHORIZATION_FAILED";
}
export function assertSocialMutationOrigin(req: Request, detailedErrors = false) {
  const origin = req.headers.get("origin");
  const requestUrl = new URL(req.url);
  let applicationUrl: URL | undefined;
  try { applicationUrl = new URL(process.env.APP_URL || ""); } catch { /* Advanced token connections do not require a public OAuth origin. */ }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || ""))
    throw new ManagedSocialOAuthError(detailedErrors ? "REQUEST_FORMAT" : "FORBIDDEN", 403);
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new ManagedSocialOAuthError(detailedErrors ? "REQUEST_CROSS_SITE" : "FORBIDDEN", 403);
  // VS Code Dev Tunnels rewrite a same-origin HTTPS Origin to the local HTTP target.
  const devTunnelOrigin = process.env.NODE_ENV === "development" &&
    applicationUrl?.protocol === "https:" && applicationUrl.hostname.endsWith(".devtunnels.ms") &&
    req.headers.get("x-forwarded-host") === applicationUrl.host && req.headers.get("x-forwarded-proto") === "https" &&
    req.headers.get("sec-fetch-site") === "same-origin" && requestUrl.hostname === "localhost" &&
    req.headers.get("host") === requestUrl.host && origin === `http://${requestUrl.host}`;
  if (origin && origin !== requestUrl.origin && origin !== applicationUrl?.origin && !devTunnelOrigin)
    throw new ManagedSocialOAuthError(detailedErrors ? "REQUEST_ORIGIN" : "FORBIDDEN", 403);
}
export async function createManagedSelection(input: {
  workspaceId: number; userId: number; brandId: number; platform: SocialPlatform;
  organizations: boolean; analyticsEnabled: boolean; destinations: AuthorizedSocialDestination[]; facebookConfigId?: string;
}) {
  const payload = selectionPayload.parse({ stage: "select", organizations: input.organizations,
    analyticsEnabled: input.analyticsEnabled, destinations: input.destinations, facebookConfigId: input.facebookConfigId });
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
  if (platform === "threads") {
    const token = await inspectThreadsToken(credentials, Date.now() + 20000);
    if (managedScopes("threads", payload.analyticsEnabled, false).some(scope => !token.scopes.includes(scope))) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
    credentials.grantedScopes = token.scopes;
  }
  if (platform === "instagram") {
    if (credentials.instagramLogin !== "unified" || credentials.instagramConfigId !== current.instagramConfigId) throw new ManagedSocialOAuthError("MANAGED_APP_CHANGED", 422);
    const deadline = Date.now() + 20000;
    const token = await inspectInstagramUnifiedToken(credentials, credentials.accessToken, deadline);
    if (managedScopes("instagram", payload.analyticsEnabled, false).some(scope => !token.scopes.includes(scope))) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
    if (!(await instagramAssignedAccounts(credentials, deadline)).some(account => account.id === destination.id)) throw new ManagedSocialOAuthError("INSTAGRAM_ASSET_MISSING", 403);
    credentials.grantedScopes = token.scopes;
    credentials.expiresAt = token.expires_at ? new Date(token.expires_at * 1000).toISOString() : undefined;
  }
  if (platform === "facebook" && payload.facebookConfigId) {
    if (managedSocialConfiguration().facebookConfigId !== payload.facebookConfigId) throw new ManagedSocialOAuthError("MANAGED_APP_CHANGED", 422);
    const token = await inspectFacebookToken(credentials, credentials.accessToken, Date.now() + 20000, "selected_page_debug");
    if (token.type !== "PAGE") throw new ManagedSocialOAuthError("FACEBOOK_TOKEN_INVALID", 403);
    reportFacebookGrantCheck("selected_page_grant_check", managedScopes("facebook", payload.analyticsEnabled, false),
      token.scopes.filter(scope => facebookScopeForPage(token, scope, destination.id)), true);
    if (["pages_show_list", "pages_manage_posts", "pages_read_engagement"].some(scope => !facebookScopeForPage(token, scope, destination.id))) throw new ManagedSocialOAuthError("FACEBOOK_PUBLISH_ACCESS_MISSING", 403);
    if (managedScopes("facebook", payload.analyticsEnabled, false).some(scope => !facebookScopeForPage(token, scope, destination.id))) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
    credentials.grantedScopes = (credentials.grantedScopes || []).filter(scope => token.scopes.includes(scope));
    if (token.expires_at) credentials.expiresAt = new Date(token.expires_at * 1000).toISOString();
  }
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
