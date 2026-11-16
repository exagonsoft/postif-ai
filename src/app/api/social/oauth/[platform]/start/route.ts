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

export async function POST(req: Request, context: { params: Promise<{ platform: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ error: "Owner or admin required." }, { status: 403 });
    const { platform } = await context.params;
    const body = z.object({ credentials: customerCredentials.omit({ accessToken: true }), brandId: z.number().int().positive().optional() }).parse(await req.json());
    if (!body.credentials.clientId || (platform !== "x" && !body.credentials.clientSecret)) throw new SocialProviderError("Provide your own OAuth client ID and required client secret.");
    validateSocialOAuthSettings(platform, body.credentials);
    const brandId = body.brandId ?? ctx.activeBrand.id;
    if (!(await db.find(brands, { id: brandId, workspaceId: ctx.workspace.id })).length) throw new SocialProviderError("Brand not found.", 404);
    await assertBrandEntitlement(ctx.workspace.id, brandId);
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const url = oauthAuthorizationUrl(platform, body.credentials.clientId, state, createHash("sha256").update(verifier).digest("base64url"), body.credentials);
    await db.remove(socialOAuthAttempts, { workspaceId: ctx.workspace.id, expiresAt: { $lte: new Date() } });
    await db.insert(socialOAuthAttempts, { workspaceId: ctx.workspace.id, userId: ctx.user.id, brandId, platform, stateHash: createHash("sha256").update(state).digest("hex"), encryptedPayload: encryptSecret(JSON.stringify({ credentials: body.credentials, verifier })), expiresAt: new Date(Date.now() + 600000) });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SocialProviderError || error instanceof WorkflowError ? error.message : "Authorization could not start. Check your customer-owned client configuration and plan." }, { status: error instanceof SocialProviderError || error instanceof WorkflowError ? error.status : 400 });
  }
}
