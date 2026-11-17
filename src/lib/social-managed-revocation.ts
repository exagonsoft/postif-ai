import { z } from "zod";
import { SocialProviderError, type CustomerCredentials } from "./social-provider";
import { providerResponse, resolveSocialOAuthClient } from "./social-oauth-provider";
import type { SocialPlatform } from "./social-adapters";

export async function revokeManagedSocialGrant(platform: SocialPlatform, credentials: CustomerCredentials) {
  if (credentials.oauthMode !== "managed" || !["youtube", "tiktok"].includes(platform)) {
    throw new SocialProviderError("Remove this application's authorization in the provider's account settings; local disconnect remains available.", 422);
  }
  const resolved = resolveSocialOAuthClient(platform, credentials);
  const body = platform === "youtube"
    ? new URLSearchParams({ token: credentials.refreshToken || credentials.accessToken })
    : new URLSearchParams({ client_key: resolved.clientId!, client_secret: resolved.clientSecret!, token: credentials.accessToken });
  const response = await providerResponse(platform === "youtube" ? "https://oauth2.googleapis.com/revoke" : "https://open.tiktokapis.com/v2/oauth/revoke/",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (platform === "tiktok") {
    const text = await response.text();
    if (text.trim() && !z.object({}).strict().safeParse(JSON.parse(text)).success) throw new SocialProviderError("TikTok did not confirm revocation. Retry or disconnect locally and remove the app in TikTok settings.", 502);
  }
}
