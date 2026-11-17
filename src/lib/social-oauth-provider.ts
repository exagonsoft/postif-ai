import { z } from "zod";
import { isIP } from "node:net";
import { customerCredentials, SocialProviderError, type CustomerCredentials } from "./social-provider";
import type { SocialPlatform } from "./social-adapters";
import { workerFetch as fetch } from "./worker-network";
import { managedSocialConfiguration } from "./social-managed-config";
import { facebookDiagnosticRequest, facebookDiagnosticsEnabled, reportFacebookLongTokenShape, reportFacebookPermissions, reportFacebookProviderError, reportFacebookTokenType } from "./facebook-oauth-diagnostics";
import { instagramDiagnosticRequest, reportInstagramProviderError, reportInstagramToken, type InstagramDiagnosticStage } from "./instagram-oauth-diagnostics";
import { threadsDiagnosticRequest, reportThreadsProviderError, type ThreadsDiagnosticStage, type ThreadsErrorHint } from "./threads-oauth-diagnostics";

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
  if (credentials.oauthMode !== "managed" && ["facebook", "instagram"].includes(platform) && !/^\d+$/.test(credentials.accountId || "")) throw new SocialProviderError("Enter the intended Facebook Page ID or Instagram professional account ID before authorizing. The app never guesses a target account.");
  if (["facebook", "instagram"].includes(platform)) metaVersion(credentials);
}
export function oauthAuthorizationUrl(platform: string, clientId: string, state: string, challenge: string, settings: Omit<CustomerCredentials, "accessToken"> = {}, managedScopes?: string[], facebookConfigId?: string) {
  const config = oauthConfig(platform);
  const unified = platform === "instagram" && settings.oauthMode === "managed" && settings.instagramLogin === "unified";
  const url = new URL(platform === "facebook" || unified ? `https://www.facebook.com/${metaVersion(settings)}/dialog/oauth` : config.authorize);
  let scope: string = config.scope;
  if (platform === "linkedin" && settings.accountId?.startsWith("urn:li:organization:")) scope = "openid profile w_organization_social rw_organization_admin";
  if (!managedScopes && settings.analyticsEnabled !== false) {
    if (platform === "linkedin" && !settings.accountId?.startsWith("urn:li:organization:")) scope += " r_member_postAnalytics";
    if (platform === "instagram") scope += ",instagram_business_manage_insights";
    if (platform === "threads") scope += ",threads_manage_insights";
  }
  if (managedScopes) scope = managedScopes.join(["x", "youtube", "linkedin"].includes(platform) ? " " : ",");
  url.search = new URLSearchParams({ response_type: "code", [platform === "tiktok" ? "client_key" : "client_id"]: clientId, redirect_uri: oauthCallbackUrl(platform), ...(unified ? { config_id: settings.instagramConfigId!, override_default_response_type: "true" } : platform === "facebook" && settings.oauthMode === "managed" && facebookConfigId ? { config_id: facebookConfigId } : { scope }), state }).toString();
  if (unified) url.searchParams.set("prompt", "login");
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
const facebookBusinessUserToken = metaToken.extend({ expires_in: metaToken.shape.expires_in.optional() });
export class FacebookBusinessTokenError extends SocialProviderError {
  constructor(public code: "FACEBOOK_TOKEN_INVALID" | "FACEBOOK_USER_TOKEN_REQUIRED") { super(code, 403); }
}
export function resolveSocialOAuthClient(platform: SocialPlatform, credentials: CustomerCredentials): CustomerCredentials {
  if (credentials.oauthMode !== "managed") return credentials;
  const client = managedSocialConfiguration().clients[platform];
  if (!client.clientId?.trim() || !client.clientSecret?.trim()) throw new SocialProviderError("Managed provider application is not configured.", 503);
  if (credentials.clientId !== client.clientId.trim()) throw new SocialProviderError("Managed provider application changed. Reconnect this account.", 422);
  return { ...credentials, clientId: client.clientId.trim(), clientSecret: client.clientSecret };
}
export async function inspectThreadsToken(input: CustomerCredentials, deadline: number) {
  const credentials = resolveSocialOAuthClient("threads", input);
  if (!credentials.clientId || !credentials.clientSecret) throw new SocialProviderError("Threads app credentials are required to verify permissions.", 422);
  const url = new URL("https://graph.threads.com/v1.0/debug_token");
  url.search = new URLSearchParams({ access_token: `TH|${credentials.clientId}|${credentials.clientSecret}`, input_token: credentials.accessToken }).toString();
  return threadsDiagnosticRequest("token_debug", async () => {
    const parsed = z.object({ data: z.object({
      type: z.string(), is_valid: z.boolean(), user_id: metaId,
      expires_at: z.number().int().nonnegative().max(253402300799),
      data_access_expires_at: z.number().int().nonnegative().max(253402300799).optional(),
      scopes: z.array(z.string().min(1).max(200)).max(100),
    }) }).safeParse(await providerJson(url.toString(), { method: "GET" }, deadline, undefined, undefined, "token_debug"));
    if (!parsed.success) throw new SocialProviderError("Threads did not confirm token identity or permissions. Reauthorize or try again later.", 502);
    const token = parsed.data.data;
    if (!token.is_valid || token.type !== "USER" || !token.expires_at || token.expires_at * 1000 <= Date.now() ||
      token.data_access_expires_at !== undefined && token.data_access_expires_at * 1000 <= Date.now() ||
      input.accountId && token.user_id !== input.accountId) {
      throw new SocialProviderError("Threads did not confirm a valid token for the selected account. Reauthorize.", 401);
    }
    return token;
  });
}
export async function inspectFacebookToken(input: CustomerCredentials, token: string, deadline: number, diagnosticStage?: string) {
  const credentials = resolveSocialOAuthClient("facebook", input);
  const url = new URL(`https://graph.facebook.com/${metaVersion(credentials)}/debug_token`);
  url.searchParams.set("input_token", token);
  const load = async () => z.object({ data: z.object({ app_id: z.string().optional(), type: z.string().optional(), is_valid: z.boolean(),
    scopes: z.array(z.string()).max(200).optional(), expires_at: z.number().int().nonnegative().max(253402300799).optional(),
    granular_scopes: z.array(z.object({ scope: z.string(), target_ids: z.array(metaId).max(1000).optional() })).max(200).optional() }) })
    .parse(await providerJson(url.toString(), { headers: { Authorization: `Bearer ${credentials.clientId}|${credentials.clientSecret}` } }, deadline, diagnosticStage));
  const result = diagnosticStage ? await facebookDiagnosticRequest(diagnosticStage, load) : await load();
  if (diagnosticStage) {
    reportFacebookTokenType(diagnosticStage, result.data.type || "", result.data.is_valid);
    reportFacebookPermissions(diagnosticStage, result.data.scopes || []);
  }
  if (!result.data.is_valid || result.data.app_id !== credentials.clientId || !result.data.scopes || !result.data.type || result.data.expires_at === undefined ||
    result.data.expires_at && result.data.expires_at * 1000 <= Date.now()) throw new FacebookBusinessTokenError("FACEBOOK_TOKEN_INVALID");
  return { ...result.data, scopes: result.data.scopes };
}
export async function inspectInstagramUnifiedToken(input: CustomerCredentials, token: string, deadline: number) {
  const credentials = resolveSocialOAuthClient("instagram", input);
  const url = new URL(`https://graph.facebook.com/${metaVersion(credentials)}/debug_token`);
  url.searchParams.set("input_token", token);
  const result = await instagramDiagnosticRequest("token_debug", async () => z.object({ data: z.object({ app_id: z.string(), type: z.string(), is_valid: z.boolean(),
    scopes: z.array(z.string()).max(200), expires_at: z.number().int().nonnegative().max(253402300799) }) })
    .parse(await providerJson(url.toString(), { headers: { Authorization: `Bearer ${credentials.clientId}|${credentials.clientSecret}` } }, deadline, undefined, "token_debug")));
  reportInstagramToken(result.data.type, result.data.is_valid, result.data.app_id === credentials.clientId, result.data.scopes);
  if (!result.data.is_valid || result.data.app_id !== credentials.clientId || result.data.type !== "SYSTEM_USER" ||
    result.data.expires_at && result.data.expires_at * 1000 <= Date.now()) {
    throw new SocialProviderError("Meta did not confirm a valid system-user token for the configured Instagram app.", 403);
  }
  return result.data;
}
export async function exchangeInstagramUnifiedToken(input: CustomerCredentials, code: string, deadline: number) {
  const credentials = resolveSocialOAuthClient("instagram", input);
  const url = new URL(`https://graph.facebook.com/${metaVersion(credentials)}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: credentials.clientId!, client_secret: credentials.clientSecret!, redirect_uri: oauthCallbackUrl("instagram"), code }).toString();
  const token = await instagramDiagnosticRequest("code_exchange", async () =>
    z.object({ access_token: z.string().min(10).max(10000) }).parse(await providerJson(url.toString(), { method: "GET" }, deadline, undefined, "code_exchange")));
  const inspected = await inspectInstagramUnifiedToken(credentials, token.access_token, deadline);
  return customerCredentials.parse({ ...input, accessToken: token.access_token, clientSecret: undefined,
    tokenKind: "oauth", grantedScopes: inspected.scopes,
    expiresAt: inspected.expires_at ? new Date(inspected.expires_at * 1000).toISOString() : undefined });
}
export function facebookScopeForPage(token: Awaited<ReturnType<typeof inspectFacebookToken>>, scope: string, pageId: string) {
  if (!token.scopes.includes(scope)) return false;
  const grants = token.granular_scopes?.filter(grant => grant.scope === scope) || [];
  return !grants.length || grants.some(grant => grant.target_ids === undefined || grant.target_ids.includes(pageId));
}
export async function exchangeFacebookUserToken(input: CustomerCredentials, code: string, deadline: number, validateBusinessUser = false, diagnostics = false) {
  const credentials = resolveSocialOAuthClient("facebook", input);
  const root = `https://graph.facebook.com/${metaVersion(credentials)}`;
  const shortUrl = new URL(`${root}/oauth/access_token`);
  shortUrl.search = new URLSearchParams({ client_id: credentials.clientId!, client_secret: credentials.clientSecret!, redirect_uri: oauthCallbackUrl("facebook"), code }).toString();
  const exchangeShort = async () => z.object({ access_token: z.string().min(10).max(10000) }).parse(await providerJson(shortUrl.toString(), { method: "GET" }, deadline, diagnostics ? "user_code_exchange" : undefined));
  const short = diagnostics ? await facebookDiagnosticRequest("user_code_exchange", exchangeShort) : await exchangeShort();
  if (validateBusinessUser) {
    const inspected = await inspectFacebookToken(credentials, short.access_token, deadline, "user_initial_debug");
    if (inspected.type !== "USER") throw new FacebookBusinessTokenError("FACEBOOK_USER_TOKEN_REQUIRED");
  }
  const longUrl = new URL(`${root}/oauth/access_token`);
  longUrl.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: credentials.clientId!, client_secret: credentials.clientSecret!, fb_exchange_token: short.access_token }).toString();
  const exchangeLong = async () => {
    const result = await providerJson(longUrl.toString(), { method: "GET" }, deadline, diagnostics ? "user_long_exchange" : undefined);
    if (diagnostics) reportFacebookLongTokenShape(result);
    return (validateBusinessUser ? facebookBusinessUserToken : metaToken).parse(result);
  };
  return diagnostics ? facebookDiagnosticRequest("user_long_exchange", exchangeLong) : exchangeLong();
}
async function exchangeMetaCode(platform: "facebook" | "instagram" | "threads", credentials: CustomerCredentials, code: string, deadline: number) {
  validateSocialOAuthSettings(platform, credentials);
  const fields = new URLSearchParams({ client_id: credentials.clientId!, client_secret: credentials.clientSecret!, redirect_uri: oauthCallbackUrl(platform), code, grant_type: "authorization_code" });
  if (platform === "facebook") {
    const root = `https://graph.facebook.com/${metaVersion(credentials)}`;
    // Exchange the short-lived user token before deriving a token for the exact intended Page.
    const user = await exchangeFacebookUserToken(credentials, code, deadline);
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
  const shortSchema = z.object({ access_token: z.string().min(10).max(10000), user_id: metaId,
    permissions: z.union([z.string().max(20000), z.array(z.string().max(200)).max(100)]).optional() });
  const body = platform === "instagram" ? (() => { const form = new FormData(); fields.forEach((value, key) => form.set(key, value)); return form; })() : fields;
  const exchangeShort = async () => z.union([shortSchema, z.object({ data: z.array(shortSchema).length(1) }).transform(value => value.data[0])])
    .parse(await providerJson(oauthConfig(platform).token, { method: "POST", body, ...(platform === "threads" ? { headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}) }, deadline, undefined, undefined, platform === "threads" && credentials.oauthMode === "managed" ? "code_exchange" : undefined));
  const short = platform === "threads" && credentials.oauthMode === "managed" ? await threadsDiagnosticRequest("code_exchange", exchangeShort) : await exchangeShort();
  const grantedScopes = typeof short.permissions === "string" ? short.permissions.split(/[,\s]+/).filter(Boolean) : short.permissions;
  if (platform === "instagram" && credentials.oauthMode === "managed" && !grantedScopes) throw new SocialProviderError("Instagram did not confirm the granted permissions. Authorize the required permissions again.", 403);
  if (platform === "threads" && credentials.accountId && short.user_id !== credentials.accountId) throw new SocialProviderError("The authorized Threads account does not match your intended account.", 422);
  const longUrl = new URL(platform === "instagram" ? "https://graph.instagram.com/access_token" : "https://graph.threads.com/access_token");
  longUrl.search = new URLSearchParams({ grant_type: platform === "instagram" ? "ig_exchange_token" : "th_exchange_token", client_secret: credentials.clientSecret!, access_token: short.access_token }).toString();
  const exchangeLong = async () => metaToken.parse(await providerJson(longUrl.toString(), { method: "GET" }, deadline, undefined, undefined, platform === "threads" && credentials.oauthMode === "managed" ? "long_token_exchange" : undefined));
  const long = platform === "threads" && credentials.oauthMode === "managed" ? await threadsDiagnosticRequest("long_token_exchange", exchangeLong) : await exchangeLong();
  if (long.token_type && long.token_type.toLowerCase() !== "bearer") throw new SocialProviderError("Provider returned an unsupported token type.", 502);
  return customerCredentials.parse({ ...credentials, ...(platform === "threads" ? { accountId: short.user_id } : {}),
    ...(credentials.oauthMode === "managed" && grantedScopes && platform !== "threads" ? { grantedScopes } : {}),
    accessToken: long.access_token, tokenKind: "long_lived", expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(), refreshToken: undefined, refreshExpiresAt: undefined });
}
const tokenResponse = z.object({
  access_token: z.string().min(10).max(10000), expires_in: z.coerce.number().int().positive().max(315360000),
  refresh_token: z.string().min(1).max(10000).optional(),
  refresh_expires_in: z.coerce.number().int().nonnegative().optional(),
  refresh_token_expires_in: z.coerce.number().int().nonnegative().optional(),
  refresh_token_expires_at: z.coerce.number().int().nonnegative().safe().optional(),
  token_type: z.string().optional(), open_id: z.string().optional(),
  scope: z.string().max(20000).optional(),
});
export async function exchangeSocialToken(platform: SocialPlatform, credentials: CustomerCredentials, grant: { code: string; verifier: string } | { refresh: true }, deadline = Date.now() + 20000) {
  const result = await exchangeWithClient(platform, resolveSocialOAuthClient(platform, credentials), grant, deadline);
  return credentials.oauthMode === "managed" ? customerCredentials.parse({ ...result, clientSecret: undefined }) : result;
}
async function exchangeWithClient(platform: SocialPlatform, credentials: CustomerCredentials, grant: { code: string; verifier: string } | { refresh: true }, deadline: number) {
  const config = oauthConfig(platform);
  if (!credentials.clientId || (platform !== "x" && !credentials.clientSecret)) throw new SocialProviderError("Configure your own OAuth client ID and required client secret before authorizing or renewing.", 422);
  if (platform === "facebook" || platform === "instagram" || platform === "threads") {
    if ("refresh" in grant) throw new SocialProviderError("Meta tokens do not use a generic refresh-token grant. Instagram/Threads require an unexpired long-lived token; Facebook Page tokens require reauthorization if invalidated.", 422);
    return exchangeMetaCode(platform, credentials, grant.code, deadline);
  }
  const fields = new URLSearchParams({ grant_type: "refresh" in grant ? "refresh_token" : "authorization_code" });
  if (platform === "pinterest" && credentials.oauthMode === "managed") fields.set("continuous_refresh", "true");
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
  return customerCredentials.parse({ ...credentials, tokenKind: "oauth", accessToken: data.access_token, refreshToken: data.refresh_token || credentials.refreshToken,
    ...(platform === "tiktok" && data.open_id ? { accountId: data.open_id } : {}),
    ...(data.scope && credentials.oauthMode === "managed" ? { grantedScopes: data.scope.split(/[,\s]+/).filter(Boolean) } : {}),
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(), ...(refreshSeconds !== undefined
      ? { refreshExpiresAt: new Date(Date.now() + refreshSeconds * 1000).toISOString() }
      : data.refresh_token_expires_at !== undefined ? { refreshExpiresAt: new Date(data.refresh_token_expires_at * 1000).toISOString() } : {}) });
}
async function reportMetaError(response: Response, stage: string, report: (stage: string, httpStatus: number, code: number | null, subcode: number | null, hint?: ThreadsErrorHint) => void, threads = false) {
  let code: number | null = null;
  let subcode: number | null = null;
  let hint: ThreadsErrorHint | undefined;
  try {
    const reader = response.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size <= 16384) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size <= 16384) chunks.push(part.value);
      }
      if (size > 16384) await reader.cancel();
      else {
        const body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
        const numericCode = z.number().int().nonnegative().max(2147483647);
        code = numericCode.safeParse(body?.error?.code).data ?? (threads ? numericCode.safeParse(body?.code).data : undefined) ?? null;
        subcode = numericCode.safeParse(body?.error?.error_subcode).data ?? null;
        if (threads) {
          const message = typeof body?.error_message === "string" ? body.error_message : typeof body?.error?.message === "string" ? body.error.message : "";
          hint = /client[\s_-]*secret/i.test(message) ? "client_secret" : /client[\s_-]*id/i.test(message) ? "client_id" :
            /redirect[\s_-]*(?:uri|url)/i.test(message) ? "redirect_uri" : /(?:verification|authorization|matching)\s+code/i.test(message) ? "authorization_code" : "other";
        }
      }
    }
  } catch {
    // Error details are optional; the HTTP status is still reported.
  }
  report(stage, response.status, code, subcode, hint);
}
export async function providerResponse(url: string, init: RequestInit, deadline = Date.now() + 20000, facebookDiagnosticStage?: string, instagramDiagnosticStage?: InstagramDiagnosticStage, threadsDiagnosticStage?: ThreadsDiagnosticStage): Promise<Response> {
  if (deadline <= Date.now()) throw new SocialProviderError("Provider operation deadline reached.", 503);
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) }); }
  catch { throw new SocialProviderError("Provider request interrupted. Recheck authorization before retrying.", 503); }
  if (!response.ok) {
    if (facebookDiagnosticStage && facebookDiagnosticsEnabled()) await reportMetaError(response, facebookDiagnosticStage, reportFacebookProviderError);
    if (instagramDiagnosticStage && process.env.NODE_ENV === "development") await reportMetaError(response, instagramDiagnosticStage, reportInstagramProviderError);
    if (threadsDiagnosticStage && process.env.NODE_ENV === "development") await reportMetaError(response, threadsDiagnosticStage, reportThreadsProviderError, true);
    throw new SocialProviderError(response.status === 401 || response.status === 403 ? "Provider denied authorization. Reauthorize or review approved permissions." : `Provider request failed (HTTP ${response.status}).`, response.status);
  }
  return response;
}
export async function providerJson(url: string, init: RequestInit, deadline = Date.now() + 20000, facebookDiagnosticStage?: string, instagramDiagnosticStage?: InstagramDiagnosticStage, threadsDiagnosticStage?: ThreadsDiagnosticStage): Promise<unknown> {
  const response = await providerResponse(url, init, deadline, facebookDiagnosticStage, instagramDiagnosticStage, threadsDiagnosticStage);
  try {
    // Some Meta token endpoints encode 17-digit account IDs as JSON numbers.
    // Preserve unsafe integer lexemes instead of silently rounding a tenant identity.
    const text = await response.text();
    const precise = text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token);
    return JSON.parse(precise);
  } catch { throw new SocialProviderError("Provider returned invalid JSON.", 502); }
}
