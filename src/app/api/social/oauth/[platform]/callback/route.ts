import { createHash } from "node:crypto";
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

export async function GET(req: Request, context: { params: Promise<{ platform: string }> }) {
  return withWorkerDeadline(Date.now() + 20000, () => completeAuthorization(req, context));
}
async function completeAuthorization(req: Request, context: { params: Promise<{ platform: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !["owner", "admin"].includes(ctx.memberRole)) throw new SocialProviderError("Sign in as the workspace owner or administrator before authorizing.", 403);
    const { platform } = await context.params;
    const url = new URL(req.url);
    const state = z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(url.searchParams.get("state"));
    const filter = { stateHash: createHash("sha256").update(state).digest("hex"), platform, workspaceId: ctx.workspace.id, userId: ctx.user.id, consumedAt: null, expiresAt: { $gt: new Date() } };
    const [pending] = await db.find(socialOAuthAttempts, filter);
    if (!pending) throw new SocialProviderError("Authorization state expired, was already used, or belongs to a different workspace/user.", 400);
    await assertBrandEntitlement(ctx.workspace.id, pending.brandId);
    const [attempt] = await db.update(socialOAuthAttempts, { ...filter, expiresAt: { $gt: new Date() } }, { consumedAt: new Date() });
    if (!attempt) throw new SocialProviderError("Authorization state expired, was already used, or belongs to a different workspace/user.", 400);
    // Consume on provider refusal too. Never relay provider error text or codes to the browser.
    const encryptedPayload = attempt.encryptedPayload;
    await db.update(socialOAuthAttempts, { id: attempt.id }, { encryptedPayload: "" });
    if (url.searchParams.has("error")) throw new SocialProviderError("Provider authorization was declined. Start again when ready.", 422);
    const code = z.string().min(1).max(4096).parse(url.searchParams.get("code"));
    const payload = z.object({ verifier: z.string().min(32), credentials: customerCredentials.omit({ accessToken: true }) }).parse(JSON.parse(decryptSecret(encryptedPayload) || "{}"));
    const credentials = await exchangeSocialToken(platform as SocialPlatform, { ...payload.credentials, accessToken: "pending-authorization" }, { code, verifier: payload.verifier });
    const verified = await verifyCustomerConnection(platform as SocialPlatform, credentials);
    await persistSocialConnection({ workspaceId: ctx.workspace.id, brandId: attempt.brandId, platform: platform as SocialPlatform, actorEmail: ctx.user.email, verified });
    return NextResponse.redirect(new URL("/app/social", oauthCallbackUrl(platform)), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SocialProviderError || error instanceof WorkflowError ? error.message : "Authorization failed. Start again and check your app permissions." }, { status: error instanceof SocialProviderError || error instanceof WorkflowError ? error.status : 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
