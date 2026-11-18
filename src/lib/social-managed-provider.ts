import { z } from "zod";
import { managedSocialAvailability, managedSocialConfiguration } from "./social-managed-config";
import { customerCredentials, SocialProviderError, verifyCustomerConnection, type CustomerCredentials } from "./social-provider";
import { exchangeFacebookUserToken, exchangeInstagramUnifiedToken, exchangeSocialToken, FacebookBusinessTokenError, facebookScopeForPage, inspectFacebookToken, inspectLinkedInToken, inspectThreadsToken, metaVersion, providerJson } from "./social-oauth-provider";
import type { SocialPlatform } from "./social-adapters";
import type { ManagedSocialDestination } from "./social-managed-types";
import { facebookDiagnosticRequest, facebookDiagnosticsEnabled, reportFacebookAuthorization, reportFacebookGrantCheck, reportFacebookPageDiscovery, reportFacebookPageRestrictions, reportFacebookPageTasks, reportFacebookPermissions } from "./facebook-oauth-diagnostics";
import { instagramDiagnosticRequest } from "./instagram-oauth-diagnostics";
import { threadsDiagnosticRequest } from "./threads-oauth-diagnostics";

export class ManagedSocialOAuthError extends SocialProviderError {
  constructor(public code: string, status = 400) { super(code, status); }
}
export interface AuthorizedSocialDestination extends ManagedSocialDestination {
  credentials: CustomerCredentials;
}
export function managedCredentials(platform: SocialPlatform, analyticsEnabled: boolean, organizations: boolean) {
  const config = managedSocialConfiguration();
  const status = managedSocialAvailability().find(item => item.platform === platform)?.status;
  if (status !== "available") throw new ManagedSocialOAuthError("NOT_CONFIGURED", 503);
  if (analyticsEnabled && !config.analytics.includes(platform)) throw new ManagedSocialOAuthError("APPROVAL_REQUIRED", 403);
  if (organizations && (platform !== "linkedin" || !config.linkedinOrganizations)) throw new ManagedSocialOAuthError("APPROVAL_REQUIRED", 403);
  const clientId = config.clients[platform].clientId?.trim();
  if (!clientId) throw new ManagedSocialOAuthError("NOT_CONFIGURED", 503);
  return customerCredentials.omit({ accessToken: true }).parse({
    clientId, oauthMode: "managed", analyticsEnabled,
    ...(["facebook", "instagram"].includes(platform) ? { apiVersion: config.graphVersion } : {}),
    ...(platform === "instagram" ? { instagramLogin: "unified", instagramConfigId: config.instagramConfigId } : {}),
    ...(platform === "linkedin" ? { apiVersion: config.linkedinVersion } : {}),
  });
}
export function managedScopes(platform: SocialPlatform, analytics: boolean, organizations: boolean): string[] {
  switch (platform) {
    case "facebook": return ["pages_show_list", "pages_manage_posts", "pages_read_engagement", ...(analytics ? ["pages_read_user_content"] : [])];
    case "instagram": return ["instagram_basic", "instagram_content_publish", ...(analytics ? ["instagram_manage_insights"] : [])];
    case "threads": return ["threads_basic", "threads_content_publish", ...(analytics ? ["threads_manage_insights"] : [])];
    case "x": return ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
    case "youtube": return ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
    case "pinterest": return ["boards:read", "pins:write", "user_accounts:read", ...(analytics ? ["pins:read"] : [])];
    case "tiktok": return ["user.info.basic", "video.publish", ...(analytics ? ["user.info.stats"] : [])];
    case "linkedin": return ["openid", "profile", ...(organizations ? ["w_organization_social", "r_organization_admin"] : ["w_member_social"]),
      ...(analytics ? organizations ? ["r_organization_social"] : ["r_member_postAnalytics"] : [])];
  }
}
const identifier = z.union([z.string().regex(/^[A-Za-z0-9:_-]{1,250}$/), z.number().int().safe().nonnegative()]).transform(String);
const scopeGrants = z.object({ data: z.array(z.object({ permission: z.string(), status: z.string() })) });

export async function discoverManagedDestinations(platform: SocialPlatform, settings: Omit<CustomerCredentials, "accessToken">,
  grant: { code: string; verifier: string }, organizations: boolean, deadline = Date.now() + 20000, facebookBusiness = false): Promise<AuthorizedSocialDestination[]> {
  if (platform === "instagram" && settings.instagramLogin === "unified") {
    const credentials = await exchangeInstagramUnifiedToken(customerCredentials.parse({ ...settings, accessToken: "pending-authorization" }), grant.code, deadline);
    if (managedScopes("instagram", !!settings.analyticsEnabled, false).some(scope => !credentials.grantedScopes?.includes(scope))) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
    const root = `https://graph.facebook.com/${metaVersion(credentials)}`;
    const headers = { Authorization: `Bearer ${credentials.accessToken}` };
    const business = await instagramDiagnosticRequest("client_business", async () =>
      z.object({ client_business_id: identifier.optional() }).parse(await providerJson(`${root}/me?fields=client_business_id`, { headers }, deadline, undefined, "client_business")));
    if (!business.client_business_id) throw new ManagedSocialOAuthError("INSTAGRAM_ASSET_MISSING", 422);
    const accounts = await instagramAssignedAccounts(credentials, deadline);
    if (!accounts.length) throw new ManagedSocialOAuthError("INSTAGRAM_ASSET_MISSING", 422);
    return accounts.map(account => ({ id: account.id, name: account.username, handle: `@${account.username}`, accountType: "professional",
      permissions: credentials.grantedScopes!, credentials: customerCredentials.parse({ ...credentials, accountId: account.id, instagramBusinessId: business.client_business_id }) }));
  }
  if (platform !== "facebook") return discoverOtherDestinations(platform, settings, grant, organizations, deadline);
  const credentials = customerCredentials.parse({ ...settings, accessToken: "pending-authorization" });
  const required = managedScopes(platform, !!credentials.analyticsEnabled, organizations);
  reportFacebookAuthorization(required, facebookBusiness);
  const token = await exchangeFacebookUserToken(credentials, grant.code, deadline, facebookBusiness, true);
  const root = `https://graph.facebook.com/${metaVersion(credentials)}`;
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const loadGrants = async () => scopeGrants.parse(await providerJson(`${root}/me/permissions`, { headers }, deadline, "user_permissions"));
  const grants = await facebookDiagnosticRequest("user_permissions", loadGrants);
  reportFacebookPermissions("user_permissions", [], grants.data);
  let scopes = grants.data.filter(item => item.status === "granted").map(item => item.permission);
  let userToken: Awaited<ReturnType<typeof inspectFacebookToken>> | undefined;
  if (facebookBusiness) {
    const inspected = await inspectFacebookToken(credentials, token.access_token, deadline, "user_extended_debug");
    if (inspected.type !== "USER") throw new FacebookBusinessTokenError("FACEBOOK_USER_TOKEN_REQUIRED");
    userToken = inspected;
    scopes = scopes.filter(scope => inspected.scopes.includes(scope));
    reportFacebookGrantCheck("user_grant_check", required, scopes, facebookBusiness);
    if (!scopes.includes("pages_show_list")) throw new ManagedSocialOAuthError("FACEBOOK_PAGE_ACCESS_MISSING", 403);
  } else {
    reportFacebookGrantCheck("user_grant_check", required, scopes, facebookBusiness);
    if (required.some(scope => !scopes.includes(scope))) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
  }
  const destinations: AuthorizedSocialDestination[] = [];
  let publishingAccessMissing = false;
  let optionalAccessMissing = false;
  let pageIndex = 0;
  let after: string | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${root}/me/accounts`);
    url.search = new URLSearchParams({ fields: "id,name,category,access_token,tasks", limit: "100", ...(after ? { after } : {}) }).toString();
    const loadPages = async () => z.object({
      data: z.array(z.object({ id: identifier, name: z.string().min(1).max(500), category: z.string().optional(),
        access_token: z.string().min(10).max(10000), tasks: z.array(z.string()) })).max(100),
      paging: z.object({ next: z.string().optional(), cursors: z.object({ after: z.string().max(4000).optional() }).optional() }).optional(),
    }).parse(await providerJson(url.toString(), { headers }, deadline, "page_discovery"));
    const result = await facebookDiagnosticRequest("page_discovery", loadPages);
    reportFacebookPageDiscovery(result.data.length, !!result.paging?.next);
    for (const page of result.data) {
      pageIndex++;
      if (facebookDiagnosticsEnabled()) {
        reportFacebookPageTasks(pageIndex, page.tasks);
        const diagnosticDeadline = Math.min(deadline - 3000, Date.now() + 2000);
        if (facebookBusiness && pageIndex <= 3 && diagnosticDeadline > Date.now()) {
          try {
            const inspected = await inspectFacebookToken(credentials, page.access_token, diagnosticDeadline, `page_${pageIndex}_debug`);
            reportFacebookPageRestrictions(pageIndex, page.id, inspected.granular_scopes || []);
          }
          catch (error) { if (!(error instanceof SocialProviderError || error instanceof z.ZodError)) throw error; }
        }
      }
      if (!page.tasks.some(task => ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL"].includes(task))) continue;
      if (destinations.some(item => item.id === page.id)) continue;
      if (userToken) {
        const inspected = userToken;
        reportFacebookGrantCheck("page_grant_check", required, scopes.filter(scope => facebookScopeForPage(inspected, scope, page.id)), true, pageIndex);
        if (["pages_show_list", "pages_manage_posts", "pages_read_engagement"].some(scope => !scopes.includes(scope) || !facebookScopeForPage(inspected, scope, page.id))) {
          publishingAccessMissing = true;
          continue;
        }
        if (managedScopes("facebook", !!credentials.analyticsEnabled, organizations).some(scope => !scopes.includes(scope) || !facebookScopeForPage(inspected, scope, page.id))) {
          optionalAccessMissing = true;
          continue;
        }
      }
      destinations.push({ id: page.id, name: page.name, handle: page.id, accountType: page.category || "Page",
        permissions: scopes,
        credentials: customerCredentials.parse({ ...credentials, accessToken: page.access_token, accountId: page.id,
          clientSecret: undefined, tokenKind: "long_lived", grantedScopes: scopes }) });
    }
    if (!result.paging?.next) break;
    const cursor = result.paging.cursors?.after;
    if (!cursor || cursor === after || page === 4) throw new ManagedSocialOAuthError("DISCOVERY_INCOMPLETE", 422);
    after = cursor;
  }
  if (facebookBusiness && publishingAccessMissing && !destinations.length) {
    throw new ManagedSocialOAuthError("FACEBOOK_PUBLISH_ACCESS_MISSING", 403);
  }
  if (facebookBusiness && optionalAccessMissing && !destinations.length) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
  if (facebookBusiness && ["pages_manage_posts", "pages_read_engagement"].some(scope => !scopes.includes(scope))) throw new ManagedSocialOAuthError("FACEBOOK_PUBLISH_ACCESS_MISSING", 403);
  if (facebookBusiness && managedScopes(platform, !!credentials.analyticsEnabled, organizations).some(scope => !scopes.includes(scope))) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
  return destinations;
}

export async function instagramAssignedAccounts(credentials: CustomerCredentials, deadline: number) {
  const root = `https://graph.facebook.com/${metaVersion(credentials)}`;
  const accounts: { id: string; username: string }[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${root}/me/assigned_instagram_accounts`);
    url.search = new URLSearchParams({ fields: "id,username", limit: "100", ...(after ? { after } : {}) }).toString();
    const result = await instagramDiagnosticRequest("account_discovery", async () => z.object({ data: z.array(z.object({ id: identifier, username: z.string().min(1).max(250) })).max(100),
      paging: z.object({ next: z.string().optional(), cursors: z.object({ after: z.string().max(4000).optional() }).optional() }).optional() })
      .parse(await providerJson(url.toString(), { headers: { Authorization: `Bearer ${credentials.accessToken}` } }, deadline, undefined, "account_discovery")));
    for (const account of result.data) if (!accounts.some(item => item.id === account.id)) accounts.push(account);
    if (!result.paging?.next) return accounts;
    const cursor = result.paging.cursors?.after;
    if (!cursor || cursor === after || page === 4) throw new ManagedSocialOAuthError("DISCOVERY_INCOMPLETE", 422);
    after = cursor;
  }
  return accounts;
}

async function discoverOtherDestinations(platform: Exclude<SocialPlatform, "facebook">, settings: Omit<CustomerCredentials, "accessToken">,
  grant: { code: string; verifier: string }, organizations: boolean, deadline: number): Promise<AuthorizedSocialDestination[]> {
  const credentials = await exchangeSocialToken(platform, { ...settings, accessToken: "pending-authorization" }, grant, deadline);
  const requested = managedScopes(platform, !!settings.analyticsEnabled, organizations);
  const linkedInScopes = platform === "linkedin" ? await inspectLinkedInToken(credentials, deadline) : undefined;
  const permissions = platform === "linkedin" ? linkedInScopes ?? credentials.grantedScopes ?? [] : platform === "threads"
    ? (await inspectThreadsToken(credentials, deadline)).scopes
    : credentials.grantedScopes || requested;
  const unknown = platform === "linkedin" && linkedInScopes === undefined && credentials.grantedScopes === undefined;
  if (!unknown && requested.some(scope => !permissions.includes(scope))) throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
  const withIdentity = (id: string, name: string, handle: string, accountType: string, extra: Partial<CustomerCredentials> = {}): AuthorizedSocialDestination => ({
    id, name, handle, accountType, permissions,
    ...(platform === "linkedin" ? { requestedPermissions: requested, unknownPermissions: unknown ? requested : [] } : {}),
    credentials: customerCredentials.parse({ ...credentials, ...extra, grantedScopes: unknown ? undefined : permissions }),
  });
  const headers = { Authorization: `Bearer ${credentials.accessToken}` };
  if (platform === "pinterest") {
    const user = z.object({ username: z.string().min(1), account_type: z.string().optional() })
      .parse(await providerJson("https://api.pinterest.com/v5/user_account", { headers }, deadline));
    if (user.account_type && user.account_type !== "BUSINESS") throw new ManagedSocialOAuthError("ACCOUNT_UNSUPPORTED", 422);
    const destinations: AuthorizedSocialDestination[] = [];
    let bookmark: string | undefined;
    for (let page = 0; page < 5; page++) {
      const url = new URL("https://api.pinterest.com/v5/boards");
      url.search = new URLSearchParams({ page_size: "100", ...(bookmark ? { bookmark } : {}) }).toString();
      const result = z.object({ items: z.array(z.object({ id: identifier, name: z.string().min(1).max(500),
        owner: z.object({ username: z.string() }) })).max(100), bookmark: z.string().max(4000).nullish() })
        .parse(await providerJson(url.toString(), { headers }, deadline));
      for (const board of result.items) {
        if (board.owner.username.toLowerCase() !== user.username.toLowerCase() || destinations.some(item => item.id === board.id)) continue;
        destinations.push(withIdentity(board.id, board.name, `${user.username}:${board.id}`, "board", { boardId: board.id, accountId: user.username }));
      }
      if (!result.bookmark) return destinations;
      if (result.bookmark === bookmark || page === 4) throw new ManagedSocialOAuthError("DISCOVERY_INCOMPLETE", 422);
      bookmark = result.bookmark;
    }
    return destinations;
  }
  if (platform === "youtube") {
    const destinations: AuthorizedSocialDestination[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.search = new URLSearchParams({ part: "snippet", mine: "true", maxResults: "50", ...(pageToken ? { pageToken } : {}) }).toString();
      const result = z.object({ items: z.array(z.object({ id: identifier, snippet: z.object({ title: z.string().min(1).max(500) }) })).max(50),
        nextPageToken: z.string().max(4000).optional() }).parse(await providerJson(url.toString(), { headers }, deadline));
      for (const channel of result.items) if (!destinations.some(item => item.id === channel.id)) destinations.push(withIdentity(channel.id, channel.snippet.title, channel.id, "channel", { accountId: channel.id }));
      if (!result.nextPageToken) return destinations;
      if (result.nextPageToken === pageToken || page === 9) throw new ManagedSocialOAuthError("DISCOVERY_INCOMPLETE", 422);
      pageToken = result.nextPageToken;
    }
    return destinations;
  }
  if (platform === "linkedin" && organizations) {
    const linkedHeaders = { ...headers, "Linkedin-Version": credentials.apiVersion!, "X-Restli-Protocol-Version": "2.0.0" };
    const destinations: AuthorizedSocialDestination[] = [];
    for (let page = 0; page < 5; page++) {
      const url = `https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=${page * 100}`;
      const result = z.object({ elements: z.array(z.object({ organization: z.string().optional(), organizationTarget: z.string().optional(),
        role: z.string(), state: z.string() })).max(100), paging: z.object({ links: z.array(z.object({ rel: z.string() })).optional() }).optional() })
        .parse(await providerJson(url, { headers: linkedHeaders }, deadline));
      for (const role of result.elements) {
        const urn = role.organizationTarget || role.organization;
        if (role.state !== "APPROVED" || !["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"].includes(role.role) || !urn || !/^urn:li:organization:\d+$/.test(urn) || destinations.some(item => item.id === urn)) continue;
        const organization = z.object({ id: identifier, localizedName: z.string().min(1).max(500) })
          .parse(await providerJson(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(urn.split(":").at(-1)!)}`, { headers: linkedHeaders }, deadline));
        if (`urn:li:organization:${organization.id}` !== urn) throw new ManagedSocialOAuthError("ACCOUNT_UNSUPPORTED", 403);
        destinations.push(withIdentity(urn, organization.localizedName, urn, "organization", { accountId: urn }));
      }
      if (!result.paging?.links?.some(link => link.rel === "next") && result.elements.length < 100) return destinations;
      if (page === 4) throw new ManagedSocialOAuthError("DISCOVERY_INCOMPLETE", 422);
    }
    return destinations;
  }
  if (platform === "tiktok") {
    const user = z.object({ data: z.object({ user: z.object({ open_id: identifier, display_name: z.string().min(1).max(500) }) }),
      error: z.object({ code: z.string() }) }).parse(await providerJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers }, deadline));
    if (user.error.code !== "ok" || credentials.accountId && credentials.accountId !== user.data.user.open_id) throw new ManagedSocialOAuthError("ACCOUNT_UNSUPPORTED", 403);
    const creator = z.object({ data: z.object({ creator_username: z.string().min(1).max(250), privacy_level_options: z.array(z.string()).max(20) }),
      error: z.object({ code: z.string() }) }).parse(await providerJson("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { method: "POST",
      headers: { ...headers, "Content-Type": "application/json" }, body: "{}" }, deadline));
    if (creator.error.code !== "ok") throw new ManagedSocialOAuthError("PERMISSION_MISSING", 403);
    const destination = withIdentity(user.data.user.open_id, user.data.user.display_name, `@${creator.data.creator_username}`, "creator", { accountId: user.data.user.open_id });
    const publicPosting = managedSocialConfiguration().publicPosting.includes("tiktok");
    destination.privacyLevels = creator.data.privacy_level_options.filter(value =>
      ["SELF_ONLY", "PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS"].includes(value) && (publicPosting || value === "SELF_ONLY"));
    if (!destination.privacyLevels.length) throw new ManagedSocialOAuthError("APPROVAL_REQUIRED", 403);
    return [destination];
  }
  if (platform === "instagram") {
    const identityResponse = z.object({ user_id: identifier, username: z.string().min(1).max(250), account_type: z.string() });
    const result = z.union([identityResponse, z.object({ data: z.array(identityResponse).length(1) }).transform(value => value.data[0])])
      .parse(await providerJson(`https://graph.instagram.com/${metaVersion(credentials)}/me?fields=user_id,username,account_type`, { headers }, deadline));
    if (!["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(result.account_type)) throw new ManagedSocialOAuthError("ACCOUNT_UNSUPPORTED", 422);
    return [withIdentity(result.user_id, result.username, `@${result.username}`, "professional", { accountId: result.user_id })];
  }
  const verified = platform === "threads"
    ? await threadsDiagnosticRequest("account_discovery", () => verifyCustomerConnection(platform, credentials))
    : await verifyCustomerConnection(platform, credentials);
  return [withIdentity(verified.credentials.accountId!, verified.name, verified.handle, platform === "linkedin" ? "member" : "account", { accountId: verified.credentials.accountId })];
}
