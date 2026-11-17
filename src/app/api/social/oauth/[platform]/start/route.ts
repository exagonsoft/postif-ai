import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { brands } from "@/db/schema";
import { socialOAuthAttempts } from "@/db/social-lifecycle-schema";
import { getAuthContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { customerCredentials, SocialProviderError } from "@/lib/social-provider";
import { oauthAuthorizationUrl, validateSocialOAuthSettings } from "@/lib/social-oauth-provider";
import { assertBrandEntitlement } from "@/lib/entitlements";
import { WorkflowError } from "@/lib/post-policy";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "@/lib/social-adapters";
import { managedCredentials, managedScopes, ManagedSocialOAuthError } from "@/lib/social-managed-provider";
import { assertSocialMutationOrigin, managedSocialErrorCode } from "@/lib/social-managed-oauth";
import { oauthCallbackUrl } from "@/lib/social-oauth-provider";
import { managedSocialConfiguration } from "@/lib/social-managed-config";
import { reportFacebookEntry, reportFacebookRejection } from "@/lib/facebook-oauth-diagnostics";

export async function POST(req: Request, context: { params: Promise<{ platform: string }> }) {
  const { platform } = await context.params;
  if (platform === "facebook") reportFacebookEntry("start_received");
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ code: "FORBIDDEN", error: "Owner or admin required." }, { status: 403 });
    assertSocialMutationOrigin(req, true);
    if (!Object.hasOwn(SOCIAL_PLATFORM_SPECS, platform)) throw new ManagedSocialOAuthError("INVALID_REQUEST");
    const body = z.object({ mode: z.enum(["managed", "advanced"]).optional(),
      credentials: customerCredentials.omit({ accessToken: true, oauthMode: true, grantedScopes: true }).optional(),
      analyticsEnabled: z.boolean().default(false), organizations: z.boolean().default(false),
      brandId: z.number().int().positive().optional() }).strict().parse(await req.json());
    const managed = body.mode === "managed" || body.mode !== "advanced" && !body.credentials;
    if (managed && body.credentials) throw new ManagedSocialOAuthError("INVALID_REQUEST");
    const credentials = managed ? managedCredentials(platform as SocialPlatform, body.analyticsEnabled, body.organizations) : body.credentials;
    if (!credentials?.clientId || !managed && platform !== "x" && !credentials.clientSecret) throw new SocialProviderError("Provide your own OAuth client ID and required client secret.");
    if (!managed) validateSocialOAuthSettings(platform, credentials);
    const brandId = body.brandId ?? ctx.activeBrand.id;
    if (!(await db.find(brands, { id: brandId, workspaceId: ctx.workspace.id })).length) throw new SocialProviderError("Brand not found.", 404);
    await assertBrandEntitlement(ctx.workspace.id, brandId);
    const state = `${managed ? "m_" : ""}${randomBytes(32).toString("base64url")}`;
    const verifier = randomBytes(48).toString("base64url");
    const facebookConfigId = managed && platform === "facebook" ? managedSocialConfiguration().facebookConfigId : undefined;
    const url = oauthAuthorizationUrl(platform, credentials.clientId, state, createHash("sha256").update(verifier).digest("base64url"), credentials,
      managed ? managedScopes(platform as SocialPlatform, body.analyticsEnabled, body.organizations) : undefined, facebookConfigId);
    await db.remove(socialOAuthAttempts, { workspaceId: ctx.workspace.id, expiresAt: { $lte: new Date() } });
    await db.insert(socialOAuthAttempts, { workspaceId: ctx.workspace.id, userId: ctx.user.id, brandId, platform, stateHash: createHash("sha256").update(state).digest("hex"),
      encryptedPayload: encryptSecret(JSON.stringify({ credentials, verifier, stage: "authorize", mode: managed ? "managed" : "advanced",
        redirectUri: oauthCallbackUrl(platform), organizations: body.organizations, facebookConfigId })), expiresAt: new Date(Date.now() + 600000) });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (platform === "facebook") reportFacebookRejection("start", managedSocialErrorCode(error));
    return NextResponse.json({ code: managedSocialErrorCode(error), error: error instanceof SocialProviderError || error instanceof WorkflowError ? error.message : "Authorization could not start. Check provider configuration and plan." }, { status: error instanceof SocialProviderError || error instanceof WorkflowError ? error.status : 400, headers: { "Cache-Control": "no-store" } });
  }
}
