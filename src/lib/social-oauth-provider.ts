import { z } from "zod";
import { isIP } from "node:net";
import { customerCredentials, SocialProviderError, type CustomerCredentials } from "./social-provider";
import type { SocialPlatform } from "./social-adapters";
import { workerFetch as fetch } from "./worker-network";

const configs = {
  x: { authorize: "https://x.com/i/oauth2/authorize", token: "https://api.x.com/2/oauth2/token", scope: "tweet.read tweet.write users.read media.write offline.access" },
  youtube: { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly" },
  tiktok: { authorize: "https://www.tiktok.com/v2/auth/authorize/", token: "https://open.tiktokapis.com/v2/oauth/token/", scope: "user.info.basic,user.info.profile,user.info.stats,video.publish,video.upload" },
  pinterest: { authorize: "https://www.pinterest.com/oauth/", token: "https://api.pinterest.com/v5/oauth/token", scope: "boards:read,pins:read,pins:write,user_accounts:read" },
  linkedin: { authorize: "https://www.linkedin.com/oauth/v2/authorization", token: "https://www.linkedin.com/oauth/v2/accessToken", scope: "openid profile w_member_social" },
  facebook: { authorize: "https://www.facebook.com/v27.0/dialog/oauth", token: "https://graph.facebook.com/v27.0/oauth/access_token", scope: "pages_show_list,pages_manage_posts,pages_read_engagement,pages_read_user_content" },
  instagram: { authorize: "https://www.instagram.com/oauth/authorize", token: "https://api.instagram.com/oauth/access_token", scope: "instagram_business_basic,instagram_business_content_publish" },
  threads: { authorize: "https://threads.com/oauth/authorize", token: "https://graph.threads.com/oauth/access_token", scope: "threads_basic,threads_content_publish" },
} as const;
export function oauthConfig(platform: string) {
  if (!Object.hasOwn(configs, platform)) throw new SocialProviderError("Browser authorization is unavailable for this provider. Use your own provider-issued token.", 422);
  return configs[platform as keyof typeof configs];
}
export function oauthCallbackUrl(platform: string) {
  const raw = process.env.APP_URL;
  if (!raw) throw new SocialProviderError("APP_URL must be configured for OAuth.", 503);
  const base = new URL(raw);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash || isIP(base.hostname) || !base.hostname.includes(".") || /(^localhost$|\.localhost$|\.local$|^\[)/i.test(base.hostname)) throw new SocialProviderError("OAuth requires a public HTTPS APP_URL origin.", 503);
  return `${base.origin}/api/social/oauth/${platform}/callback`;
}
export function validateSocialOAuthSettings(platform: string, credentials: Omit<CustomerCredentials, "accessToken">) {
  oauthConfig(platform);
  if (platform === "pinterest" && !credentials.boardId) throw new SocialProviderError("Choose the destination Pinterest board before authorizing.");
  if (platform === "linkedin" && !/^20\d{4}$/.test(credentials.apiVersion || "")) throw new SocialProviderError("Set your app's supported LinkedIn API version (YYYYMM) before authorizing.");
  if (platform === "youtube" && (typeof credentials.madeForKids !== "boolean" || !["public", "unlisted", "private"].includes(credentials.privacyLevel || ""))) throw new SocialProviderError("Choose the YouTube audience declaration and visibility before authorizing.");
  if (platform === "tiktok" && (typeof credentials.aiGenerated !== "boolean" || !["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE"].includes(credentials.privacyLevel || ""))) throw new SocialProviderError("Choose the TikTok AI declaration and visibility before authorizing.");
  if (["facebook", "instagram"].includes(platform) && !/^\d+$/.test(credentials.accountId || "")) throw new SocialProviderError("Enter the intended Facebook Page ID or Instagram professional account ID before authorizing. The app never guesses a target account.");
  if (["facebook", "instagram"].includes(platform)) metaVersion(credentials);
}
export function oauthAuthorizationUrl(platform: string, clientId: string, state: string, challenge: string, settings: Omit<CustomerCredentials, "accessToken"> = {}) {
  const config = oauthConfig(platform);
  const url = new URL(platform === "facebook" ? `https://www.facebook.com/${metaVersion(settings)}/dialog/oauth` : config.authorize);
  let scope: string = config.scope;
  if (platform === "linkedin" && settings.accountId?.startsWith("urn:li:organization:")) scope = "openid profile w_organization_social rw_organization_admin";
  if (settings.analyticsEnabled !== false) {
    if (platform === "linkedin" && !settings.accountId?.startsWith("urn:li:organization:")) scope += " r_member_postAnalytics";
    if (platform === "instagram") scope += ",instagram_business_manage_insights";
    if (platform === "threads") scope += ",threads_manage_insights";
  }
  url.search = new URLSearchParams({ response_type: "code", [platform === "tiktok" ? "client_key" : "client_id"]: clientId, redirect_uri: oauthCallbackUrl(platform), scope, state }).toString();
  if (platform === "x" || platform === "youtube") { url.searchParams.set("code_challenge", challenge); url.searchParams.set("code_challenge_method", "S256"); }
  if (platform === "youtube") { url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); }
  return url.toString();
}
export function metaVersion(credentials: Pick<CustomerCredentials, "apiVersion">) {
  const version = credentials.apiVersion || "v27.0";
  if (!/^v\d{1,3}\.0$/.test(version)) throw new SocialProviderError("Enter a supported Graph API version (for example v27.0).");
  return version;
}
const metaId = z.union([z.string().min(1), z.number().int().safe().nonnegative()]).transform(String);
const metaToken = z.object({ access_token: z.string().min(10).max(10000), expires_in: z.number().int().positive().max(315360000), token_type: z.string().optional() });
async function exchangeMetaCode(platform: "facebook" | "instagram" | "threads", credentials: CustomerCredentials, code: string, deadline: number) {
  validateSocialOAuthSettings(platform, credentials);
  const fields = new URLSearchParams({ client_id: credentials.clientId!, client_secret: credentials.clientSecret!, redirect_uri: oauthCallbackUrl(platform), code, grant_type: "authorization_code" });
  if (platform === "facebook") {
    const root = `https://graph.facebook.com/${metaVersion(credentials)}`;
    // Exchange the short-lived user token before deriving a token for the exact intended Page.
    const shortUrl = new URL(`${root}/oauth/access_token`);
    fields.delete("grant_type");
    shortUrl.search = fields.toString();
    const short = z.object({ access_token: z.string().min(10).max(10000) }).parse(await providerJson(shortUrl.toString(), { method: "GET" }, deadline));
    const longUrl = new URL(`${root}/oauth/access_token`);
    longUrl.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: credentials.clientId!, client_secret: credentials.clientSecret!, fb_exchange_token: short.access_token }).toString();
    const user = metaToken.parse(await providerJson(longUrl.toString(), { method: "GET" }, deadline));
    let after: string | undefined;
    for (let page = 0; page < 5; page++) {
      const url = new URL(`${root}/me/accounts`);
      url.search = new URLSearchParams({ fields: "id,access_token,tasks", limit: "100", ...(after ? { after } : {}) }).toString();
      const result = z.object({ data: z.array(z.object({ id: metaId, access_token: z.string().min(10).max(10000), tasks: z.array(z.string()) })), paging: z.object({ next: z.string().optional(), cursors: z.object({ after: z.string().max(4000).optional() }).optional() }).optional() }).parse(await providerJson(url.toString(), { headers: { Authorization: `Bearer ${user.access_token}` } }, deadline));
      const selected = result.data.find(item => item.id === credentials.accountId);
      if (selected) {
        if (!selected.tasks.some(task => ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL"].includes(task))) throw new SocialProviderError("The authorizing user cannot create content on the intended Facebook Page.", 403);
        // Long-lived Page tokens have no scheduled expiry. Never retain the intermediate user token.
        return customerCredentials.parse({ ...credentials, accessToken: selected.access_token, tokenKind: "long_lived", expiresAt: undefined, refreshToken: undefined, refreshExpiresAt: undefined });
      }
      if (!result.paging?.next || !result.paging.cursors?.after || result.paging.cursors.after === after) break;
      after = result.paging.cursors.after;
    }
    throw new SocialProviderError("The intended Page was not found in the authorized Page list (up to 500 Pages). Grant access to that exact Page and try again.", 422);
  }
  const shortSchema = z.object({ access_token: z.string().min(10).max(10000), user_id: metaId });
  const body = platform === "instagram" ? (() => { const form = new FormData(); fields.forEach((value, key) => form.set(key, value)); return form; })() : fields;
  const result = await providerJson(oauthConfig(platform).token, { method: "POST", body, ...(platform === "threads" ? { headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}) }, deadline);
  const short = z.union([shortSchema, z.object({ data: z.array(shortSchema).length(1) }).transform(value => value.data[0])]).parse(result);
  if (platform === "threads" && credentials.accountId && short.user_id !== credentials.accountId) throw new SocialProviderError("The authorized Threads account does not match your intended account.", 422);
  const longUrl = new URL(platform === "instagram" ? "https://graph.instagram.com/access_token" : "https://graph.threads.com/access_token");
  longUrl.search = new URLSearchParams({ grant_type: platform === "instagram" ? "ig_exchange_token" : "th_exchange_token", client_secret: credentials.clientSecret!, access_token: short.access_token }).toString();
  const long = metaToken.parse(await providerJson(longUrl.toString(), { method: "GET" }, deadline));
  if (long.token_type && long.token_type.toLowerCase() !== "bearer") throw new SocialProviderError("Provider returned an unsupported token type.", 502);
  return customerCredentials.parse({ ...credentials, accessToken: long.access_token, tokenKind: "long_lived", expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(), refreshToken: undefined, refreshExpiresAt: undefined });
}
const tokenResponse = z.object({
  access_token: z.string().min(10).max(10000), expires_in: z.coerce.number().int().positive().max(315360000),
  refresh_token: z.string().min(1).max(10000).optional(),
  refresh_expires_in: z.coerce.number().int().nonnegative().optional(),
  refresh_token_expires_in: z.coerce.number().int().nonnegative().optional(),
  token_type: z.string().optional(), open_id: z.string().optional(),
});
export async function exchangeSocialToken(platform: SocialPlatform, credentials: CustomerCredentials, grant: { code: string; verifier: string } | { refresh: true }, deadline = Date.now() + 20000) {
  const config = oauthConfig(platform);
  if (!credentials.clientId || (platform !== "x" && !credentials.clientSecret)) throw new SocialProviderError("Configure your own OAuth client ID and required client secret before authorizing or renewing.", 422);
  if (platform === "facebook" || platform === "instagram" || platform === "threads") {
    if ("refresh" in grant) throw new SocialProviderError("Meta tokens do not use a generic refresh-token grant. Instagram/Threads require an unexpired long-lived token; Facebook Page tokens require reauthorization if invalidated.", 422);
    return exchangeMetaCode(platform, credentials, grant.code, deadline);
  }
  const fields = new URLSearchParams({ grant_type: "refresh" in grant ? "refresh_token" : "authorization_code" });
  if ("refresh" in grant) {
    if (!credentials.refreshToken) throw new SocialProviderError("This token has no refresh grant. Authorize again or replace it.", 422);
    if (credentials.refreshExpiresAt && Date.parse(credentials.refreshExpiresAt) <= Date.now()) throw new SocialProviderError("Refresh grant expired. Authorize again.", 422);
    fields.set("refresh_token", credentials.refreshToken);
  } else {
    fields.set("code", grant.code); fields.set("redirect_uri", oauthCallbackUrl(platform));
    if (platform === "x" || platform === "youtube") fields.set("code_verifier", grant.verifier);
  }
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if ((platform === "x" && credentials.clientSecret) || platform === "pinterest") headers.Authorization = `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`;
  else { fields.set(platform === "tiktok" ? "client_key" : "client_id", credentials.clientId); if (credentials.clientSecret) fields.set("client_secret", credentials.clientSecret); }
  const data = tokenResponse.parse(await providerJson(config.token, { method: "POST", headers, body: fields }, deadline));
  if (data.token_type && data.token_type.toLowerCase() !== "bearer") throw new SocialProviderError("Provider returned an unsupported token type.", 502);
  if (platform === "tiktok" && (!data.open_id || !data.refresh_token)) throw new SocialProviderError("TikTok omitted its required account identity or rotating refresh token.", 502);
  if (platform === "tiktok" && credentials.accountId && data.open_id && data.open_id !== credentials.accountId) throw new SocialProviderError("Renewed token identity did not match.", 422);
  const refreshSeconds = data.refresh_expires_in ?? data.refresh_token_expires_in;
  return customerCredentials.parse({ ...credentials, tokenKind: "oauth", accessToken: data.access_token, refreshToken: data.refresh_token || credentials.refreshToken, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(), ...(refreshSeconds !== undefined ? { refreshExpiresAt: new Date(Date.now() + refreshSeconds * 1000).toISOString() } : {}) });
}
export async function providerJson(url: string, init: RequestInit, deadline = Date.now() + 20000): Promise<unknown> {
  if (deadline <= Date.now()) throw new SocialProviderError("Provider operation deadline reached.", 503);
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) }); }
  catch { throw new SocialProviderError("Provider request interrupted. Recheck authorization before retrying.", 503); }
  if (!response.ok) throw new SocialProviderError(response.status === 401 || response.status === 403 ? "Provider denied authorization. Reauthorize or review approved permissions." : `Provider request failed (HTTP ${response.status}).`, response.status);
  try {
    // Some Meta token endpoints encode 17-digit account IDs as JSON numbers.
    // Preserve unsafe integer lexemes instead of silently rounding a tenant identity.
    const text = await response.text();
    const precise = text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token);
    return JSON.parse(precise);
  } catch { throw new SocialProviderError("Provider returned invalid JSON.", 502); }
}
