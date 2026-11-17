import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { socialOAuthAttempts } from "@/db/social-lifecycle-schema";
import { getAuthContext } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { customerCredentials, SocialProviderError, verifyCustomerConnection } from "@/lib/social-provider";
import { exchangeSocialToken, oauthCallbackUrl } from "@/lib/social-oauth-provider";
import { persistSocialConnection } from "@/lib/social-connect";
import type { SocialPlatform } from "@/lib/social-adapters";
import { WorkflowError } from "@/lib/post-policy";
import { assertBrandEntitlement } from "@/lib/entitlements";
import { withWorkerDeadline } from "@/lib/worker-network";
import { discoverManagedDestinations, ManagedSocialOAuthError } from "@/lib/social-managed-provider";
import { createManagedSelection, managedSocialErrorCode } from "@/lib/social-managed-oauth";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import { managedSocialConfiguration } from "@/lib/social-managed-config";
import { facebookDiagnosticsEnabled, reportFacebookEntry, reportFacebookRejection } from "@/lib/facebook-oauth-diagnostics";
import { reportInstagramRejection } from "@/lib/instagram-oauth-diagnostics";
import { reportThreadsRejection } from "@/lib/threads-oauth-diagnostics";

const diagnosticInstance = randomBytes(16).toString("hex");
export async function GET(req: Request, context: { params: Promise<{ platform: string }> }) {
  const response = await withWorkerDeadline(Date.now() + 20000, () => completeAuthorization(req, context));
  const { platform } = await context.params;
  if (process.env.NODE_ENV === "development" && platform === "facebook" &&
    req.headers.get("x-postif-diagnostic-probe") === "1" && !new URL(req.url).search) {
    response.headers.set("x-postif-dev-instance", diagnosticInstance);
    response.headers.set("x-postif-dev-diagnostics", facebookDiagnosticsEnabled() ? "on" : "off");
  }
  return response;
}
async function completeAuthorization(req: Request, context: { params: Promise<{ platform: string }> }) {
  const url = new URL(req.url);
  let managed = url.searchParams.get("state")?.startsWith("m_") || false;
  const { platform } = await context.params;
  let stage = "callback_session";
  if (platform === "facebook") reportFacebookEntry("callback_received");
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !["owner", "admin"].includes(ctx.memberRole)) throw new SocialProviderError("Sign in as the workspace owner or administrator before authorizing.", 403);
    stage = "callback_state";
    if (!Object.hasOwn(SOCIAL_PLATFORM_SPECS, platform)) throw new ManagedSocialOAuthError("INVALID_REQUEST");
    if (url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length > 1 || url.searchParams.getAll("error").length > 1) throw new ManagedSocialOAuthError("STATE_INVALID");
    const state = z.string().regex(/^(?:m_)?[A-Za-z0-9_-]{43}$/).parse(url.searchParams.get("state"));
    const filter = { stateHash: createHash("sha256").update(state).digest("hex"), platform, workspaceId: ctx.workspace.id, userId: ctx.user.id, consumedAt: null, expiresAt: { $gt: new Date() } };
    const [pending] = await db.find(socialOAuthAttempts, filter);
    if (!pending) throw new ManagedSocialOAuthError("STATE_INVALID");
    const payload = z.object({ stage: z.literal("authorize").optional(), mode: z.enum(["managed", "advanced"]).optional(),
      redirectUri: z.string().optional(), organizations: z.boolean().default(false), facebookConfigId: z.string().regex(/^\d{1,32}$/).optional(),
      verifier: z.string().min(32), credentials: customerCredentials.omit({ accessToken: true }) }).parse(JSON.parse(decryptSecret(pending.encryptedPayload) || "{}"));
    managed = payload.mode === "managed";
    if (managed !== (payload.credentials.oauthMode === "managed") || payload.redirectUri && payload.redirectUri !== oauthCallbackUrl(platform)) throw new ManagedSocialOAuthError("STATE_INVALID");
    if (managed && platform === "facebook" && payload.facebookConfigId !== managedSocialConfiguration().facebookConfigId) throw new ManagedSocialOAuthError("MANAGED_APP_CHANGED", 422);
    if (managed && platform === "instagram" && (payload.credentials.instagramLogin !== "unified" || payload.credentials.instagramConfigId !== managedSocialConfiguration().instagramConfigId)) throw new ManagedSocialOAuthError("MANAGED_APP_CHANGED", 422);
    await assertBrandEntitlement(ctx.workspace.id, pending.brandId);
    const [attempt] = await db.update(socialOAuthAttempts, { ...filter, expiresAt: { $gt: new Date() } }, { consumedAt: new Date(), encryptedPayload: "" });
    if (!attempt) throw new ManagedSocialOAuthError("STATE_INVALID");
    stage = "callback_provider_response";
    // Consume on provider refusal too. Never relay provider error text or codes to the browser.
    if (url.searchParams.has("error")) {
      if (managed) throw new ManagedSocialOAuthError("AUTHORIZATION_DENIED", 422);
      throw new SocialProviderError("Provider authorization was declined. Start again when ready.", 422);
    }
    const code = z.string().min(1).max(4096).parse(url.searchParams.get("code"));
    if (managed) {
      stage = "callback_discovery";
      const destinations = await discoverManagedDestinations(platform as SocialPlatform, payload.credentials, { code, verifier: payload.verifier }, payload.organizations, undefined, !!payload.facebookConfigId);
      if (!destinations.length) throw new ManagedSocialOAuthError("ACCOUNT_UNSUPPORTED", 422);
      stage = "callback_selection_ticket";
      const ticket = await createManagedSelection({ workspaceId: ctx.workspace.id, userId: ctx.user.id, brandId: attempt.brandId,
        platform: platform as SocialPlatform, destinations, analyticsEnabled: !!payload.credentials.analyticsEnabled, organizations: payload.organizations, facebookConfigId: payload.facebookConfigId });
      const target = new URL("/app/social", oauthCallbackUrl(platform));
      target.search = new URLSearchParams({ social_provider: platform, social_selection: ticket }).toString();
      return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
    stage = "callback_advanced_exchange";
    const credentials = await exchangeSocialToken(platform as SocialPlatform, { ...payload.credentials, accessToken: "pending-authorization" }, { code, verifier: payload.verifier });
    const verified = await verifyCustomerConnection(platform as SocialPlatform, credentials);
    await persistSocialConnection({ workspaceId: ctx.workspace.id, brandId: attempt.brandId, platform: platform as SocialPlatform, actorEmail: ctx.user.email, verified });
    return NextResponse.redirect(new URL("/app/social", oauthCallbackUrl(platform)), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (platform === "facebook") reportFacebookRejection(stage, managedSocialErrorCode(error));
    if (platform === "instagram") reportInstagramRejection(stage, managedSocialErrorCode(error, platform));
    if (platform === "threads") reportThreadsRejection(stage, managedSocialErrorCode(error, platform));
    if (managed && Object.hasOwn(SOCIAL_PLATFORM_SPECS, platform)) {
      let callback: string;
      try { callback = oauthCallbackUrl(platform); } catch (configurationError) {
        if (!(configurationError instanceof SocialProviderError || configurationError instanceof TypeError)) throw configurationError;
        return NextResponse.json({ code: "NOT_CONFIGURED", error: "Managed provider callback configuration is unavailable." },
          { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
      }
      const target = new URL("/app/social", callback);
      target.search = new URLSearchParams({ social_error: managedSocialErrorCode(error, platform), social_provider: platform }).toString();
      return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
    return NextResponse.json({ error: error instanceof SocialProviderError || error instanceof WorkflowError ? error.message : "Authorization failed. Start again and check your app permissions." }, { status: error instanceof SocialProviderError || error instanceof WorkflowError ? error.status : 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
