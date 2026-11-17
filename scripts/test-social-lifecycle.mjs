import "./register-ts.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test, beforeEach } from "node:test";

// This suite never loads environment files, opens a database, or permits an unmocked fetch.
delete process.env.MONGODB_URI;
delete process.env.MONGODB_DB;
process.env.ENCRYPTION_SECRET = "isolated-social-lifecycle-encryption-key-only";
process.env.APP_URL = "https://customer-app.example.test";
const rows = new Map();
const leases = new Set();
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  const actual = row[key];
  if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
    if (op === "$in") return expected.includes(actual);
    if (op === "$nin") return !expected.includes(actual);
    if (op === "$ne") return actual !== expected;
    if (op === "$gt") return actual > expected;
    if (op === "$lte") return actual <= expected;
    throw new Error(`Unimplemented isolated filter ${op}`);
  });
  return actual === value;
});
const list = model => rows.get(model.name) || [];
const database = {
  async find(model, filter = {}, options = {}) {
    const found = list(model).filter(row => match(row, filter));
    if (options.sort) found.sort((a, b) => { for (const [key, order] of Object.entries(options.sort)) { if (a[key] < b[key]) return -order; if (a[key] > b[key]) return order; } return 0; });
    return structuredClone(options.limit ? found.slice(0, options.limit) : found);
  },
  async insert(model, input) {
    const added = { ...model.defaults(), ...(model.autoId ? { id: list(model).length + 1 } : {}), ...input };
    rows.set(model.name, [...list(model), structuredClone(added)]);
    return [structuredClone(added)];
  },
  async update(model, filter, changes) {
    const updated = [];
    for (const row of list(model)) if (match(row, filter)) { Object.assign(row, structuredClone(changes)); updated.push(structuredClone(row)); }
    return updated;
  },
  async upsert(model, key, initial, changes) {
    const existing = list(model).find(row => row[key] === initial[key]);
    return existing ? this.update(model, { [key]: initial[key] }, changes) : this.insert(model, { ...initial, ...changes });
  },
  async remove(model, filter) { rows.set(model.name, list(model).filter(row => !match(row, filter))); },
  async transaction(callback) {
    const snapshot = structuredClone(rows);
    try { return await callback(this); } catch (error) { rows.clear(); for (const [key, value] of snapshot) rows.set(key, value); throw error; }
  },
  async withLease(key, callback, busy) {
    if (leases.has(key)) return busy;
    leases.add(key);
    try { return await callback(); } finally { leases.delete(key); }
  },
};
globalThis.postifLifecycleTestDb = database;
globalThis.postifLifecycleEntitlement = { plan: { maxChannels: 10 }, features: { advancedAnalytics: true }, paid: true };
registerHooks({
  resolve(specifier, context, next) {
    const modules = {
      "@/db": "export const db=globalThis.postifLifecycleTestDb;",
      "@/lib/auth": "export async function getAuthContext(){return globalThis.postifLifecycleAuth;}",
      "@/lib/entitlements": "export async function getWorkspaceEntitlements(){return globalThis.postifLifecycleEntitlement;} export async function assertBrandEntitlement(){if(globalThis.postifLifecycleDenyBrand) throw globalThis.postifLifecycleBrandError;}",
    };
    if (specifier === "./entitlements" && context.parentURL?.includes("social-")) specifier = "@/lib/entitlements";
    if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    if (specifier === "next/server") return next("next/server.js", context);
    return next(specifier, context);
  },
});
const { socialAccounts, socialCredentials, brands, workspaces } = await import("../src/db/schema.ts");
const { socialOAuthAttempts, socialEngagementSnapshots, socialLifecycleStatuses } = await import("../src/db/social-lifecycle-schema.ts");
const { encryptSecret, decryptSecret } = await import("../src/lib/crypto.ts");
const { WorkflowError } = await import("../src/lib/post-policy.ts");
globalThis.postifLifecycleBrandError = new WorkflowError("Brand outside plan allowance", 403);
const { readSocialAnalytics, renewSocialCredentials, syncSocialAnalytics, assertSocialConnectCapacity } = await import("../src/lib/social-lifecycle.ts");
const { exchangeSocialToken, oauthCallbackUrl, providerJson, oauthAuthorizationUrl, validateSocialOAuthSettings } = await import("../src/lib/social-oauth-provider.ts");
const { verifyCustomerConnection } = await import("../src/lib/social-provider.ts");
const { withWorkerDeadline } = await import("../src/lib/worker-network.ts");
const { POST: start } = await import("../src/app/api/social/oauth/[platform]/start/route.ts");
const { GET: callback } = await import("../src/app/api/social/oauth/[platform]/callback/route.ts");
const { POST: social } = await import("../src/app/api/social/route.ts");
const { POST: selectManaged, GET: listManaged } = await import("../src/app/api/social/oauth/[platform]/select/route.ts");
const secret = {
  accessToken: "original-access-token-test", accountId: "x-account", apiVersion: "v27.0",
  privacyLevel: "private", madeForKids: true, clientId: "customer-client", clientSecret: "customer-secret",
  refreshToken: "customer-refresh", expiresAt: new Date(Date.now() + 600000).toISOString(),
};
let calls = [];
let transport;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ url, init });
  assert.equal(init.redirect, "error", "Provider redirects must never forward customer secrets");
  if (!transport) throw new Error("Unmocked transport is prohibited");
  return transport(url, init);
};
const reply = value => Response.json(value);
beforeEach(() => {
  for (const key of Object.keys(process.env)) if (/^(SOCIAL_(MANAGED|OAUTH)_|(?:FACEBOOK|INSTAGRAM|LINKEDIN|X|TIKTOK|PINTEREST|YOUTUBE|THREADS)_OAUTH_)/.test(key)) delete process.env[key];
  rows.clear(); leases.clear(); calls = []; transport = undefined;
  globalThis.postifLifecycleEntitlement = { plan: { maxChannels: 10 }, features: { advancedAnalytics: true }, paid: true };
  globalThis.postifLifecycleDenyBrand = false;
  rows.set(workspaces.name, [{ id: 1 }]);
  rows.set(brands.name, [{ id: 1, workspaceId: 1 }]);
  rows.set(socialAccounts.name, [{ id: 1, workspaceId: 1, brandId: 1, platform: "x", accountName: "X customer", handle: "@customer", status: "connected", lastSyncAt: new Date(0), createdAt: new Date(0) }]);
  rows.set(socialCredentials.name, [{ socialAccountId: 1, workspaceId: 1, encryptedCredentials: encryptSecret(JSON.stringify(secret)), verifiedAt: new Date(0), expiresAt: new Date(secret.expiresAt) }]);
  globalThis.postifLifecycleAuth = { user: { id: 1, email: "owner@example.test" }, workspace: { id: 1 }, activeBrand: { id: 1 }, memberRole: "owner" };
});

async function managedFacebook() {
  process.env.SOCIAL_MANAGED_PROVIDERS = "facebook";
  process.env.SOCIAL_OAUTH_APPROVED_PROVIDERS = "facebook";
  process.env.FACEBOOK_OAUTH_CLIENT_ID = "managed-app";
  process.env.FACEBOOK_OAUTH_CLIENT_SECRET = "server-only-managed-secret";
  const context = { params: Promise.resolve({ platform: "facebook" }) };
  transport = async url => {
    if (url.pathname.endsWith("/oauth/access_token")) return reply({ access_token: url.searchParams.has("grant_type") ? "private-long-user-token" : "private-short-user-token", expires_in: 5184000 });
    if (url.pathname.endsWith("/me/permissions")) return reply({ data: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"].map(permission => ({ permission, status: "granted" })) });
    if (url.pathname.endsWith("/me/accounts")) return reply({ data: [
      { id: "123", name: "First Page", access_token: "private-page-123-token", tasks: ["CREATE_CONTENT"], category: "Business" },
      { id: "456", name: "Second Page", access_token: "private-page-456-token", tasks: ["CREATE_CONTENT"], category: "Business" },
      { id: "789", name: "Read-only Page", access_token: "private-page-789-token", tasks: ["ANALYZE"] },
    ] });
    if (url.pathname.endsWith("/me")) return reply({ id: "456", name: "Second Page", category: "Business" });
    throw new Error("Unmocked managed Facebook request");
  };
  const started = await start(new Request("https://customer-app.example.test/api/social/oauth/facebook/start", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: process.env.APP_URL }, body: JSON.stringify({ mode: "managed" }),
  }), context);
  assert.equal(started.status, 200);
  const authorization = new URL((await started.json()).url);
  assert.ok(!authorization.searchParams.get("scope").includes("pages_read_user_content"), "Analytics must be opt-in");
  const state = authorization.searchParams.get("state");
  const response = await callback(new Request(`https://customer-app.example.test/api/social/oauth/facebook/callback?state=${state}&code=provider-code&next=https://evil.example/`), context);
  assert.equal(response.status, 307);
  const target = new URL(response.headers.get("location"));
  assert.equal(target.origin, process.env.APP_URL);
  const ticket = target.searchParams.get("social_selection");
  assert.ok(ticket, target.toString());
  return { context, ticket, state };
}
const chooseManaged = (context, body) => selectManaged(new Request("https://customer-app.example.test/api/social/oauth/facebook/select", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: process.env.APP_URL }, body: JSON.stringify(body),
}), context);
test("managed Facebook discovers authorized Pages, exposes no tokens and persists only the selected destination", async () => {
  const { context, ticket } = await managedFacebook();
  assert.equal(list(socialAccounts).length, 1, "Callback cannot claim a connection before selection");
  const discovered = await listManaged(new Request(`https://customer-app.example.test/api/social/oauth/facebook/select?ticket=${ticket}`), context);
  const dto = await discovered.json();
  assert.deepEqual(dto.destinations.map(item => item.id), ["123", "456"]);
  assert.doesNotMatch(JSON.stringify(dto), /private-|server-only|accessToken|clientSecret/);
  assert.ok(list(socialOAuthAttempts).every(item => !item.encryptedPayload.includes("private-")));
  const selected = await chooseManaged(context, { ticket, destinationId: "456" });
  assert.equal(selected.status, 200);
  const account = list(socialAccounts).find(item => item.platform === "facebook");
  assert.equal(account.integrationMode, "managed_oauth");
  const stored = JSON.parse(decryptSecret(list(socialCredentials).find(item => item.socialAccountId === account.id).encryptedCredentials));
  assert.equal(stored.accessToken, "private-page-456-token");
  assert.equal(stored.oauthMode, "managed");
  assert.equal(stored.clientSecret, undefined);
  assert.doesNotMatch(JSON.stringify(stored), /private-long|private-short|page-123|server-only/);
  assert.equal((await chooseManaged(context, { ticket, destinationId: "456" })).status, 400);
});
test("managed selection rejects account substitution, cross-workspace/user access and expired tickets", async () => {
  const { context, ticket } = await managedFacebook();
  assert.equal((await chooseManaged(context, { ticket, destinationId: "789" })).status, 403);
  globalThis.postifLifecycleAuth.workspace.id = 2;
  assert.equal((await chooseManaged(context, { ticket, destinationId: "456" })).status, 400);
  globalThis.postifLifecycleAuth.workspace.id = 1;
  globalThis.postifLifecycleAuth.user.id = 2;
  assert.equal((await chooseManaged(context, { ticket, destinationId: "456" })).status, 400);
  globalThis.postifLifecycleAuth.user.id = 1;
  rows.get(socialOAuthAttempts.name).find(item => !item.consumedAt).expiresAt = new Date(0);
  assert.equal((await chooseManaged(context, { ticket, destinationId: "456" })).status, 400);
  assert.equal(list(socialAccounts).length, 1);
});
test("managed selection and channel quota commit atomically, retaining the ticket after a quota rejection", async () => {
  const { context, ticket } = await managedFacebook();
  globalThis.postifLifecycleEntitlement.plan.maxChannels = 1;
  const result = await chooseManaged(context, { ticket, destinationId: "456" });
  assert.equal(result.status, 403);
  assert.equal((await result.json()).code, "CHANNEL_LIMIT");
  assert.equal(list(socialAccounts).length, 1);
  globalThis.postifLifecycleEntitlement.plan.maxChannels = 2;
  assert.equal((await chooseManaged(context, { ticket, destinationId: "456" })).status, 200);
});
test("managed start rejects cross-origin requests and unconfigured apps without contacting a provider", async () => {
  const context = { params: Promise.resolve({ platform: "facebook" }) };
  const request = origin => new Request("https://customer-app.example.test/api/social/oauth/facebook/start", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: "{}",
  });
  assert.equal((await start(request("https://evil.example"), context)).status, 403);
  const unconfigured = await start(request(process.env.APP_URL), context);
  assert.equal((await unconfigured.json()).code, "NOT_CONFIGURED");
  assert.equal(calls.length, 0);
});

for (const platform of ["x", "linkedin", "instagram", "threads", "pinterest", "youtube", "tiktok"]) {
  test(`managed ${platform} authorization discovers a real destination and preserves server-only credentials`, async () => {
    process.env.SOCIAL_MANAGED_PROVIDERS = platform;
    process.env.SOCIAL_OAUTH_APPROVED_PROVIDERS = platform;
    process.env[`${platform.toUpperCase()}_OAUTH_CLIENT_ID`] = "managed-app";
    process.env[`${platform.toUpperCase()}_OAUTH_CLIENT_SECRET`] = "server-only-managed-secret";
    process.env.LINKEDIN_API_VERSION = "202610";
    const context = { params: Promise.resolve({ platform }) };
    transport = async (url, init) => {
      if (["/2/oauth2/token", "/oauth/v2/accessToken", "/v5/oauth/token", "/token", "/v2/oauth/token/"].includes(url.pathname)) {
        if (platform === "pinterest") assert.equal(init.body.get("continuous_refresh"), "true");
        return reply({ access_token: "private-managed-access", refresh_token: "private-managed-refresh", expires_in: 7200, refresh_expires_in: 864000, open_id: "creator-id" });
      }
      if (["api.instagram.com", "graph.threads.com"].includes(url.hostname) && url.pathname === "/oauth/access_token") return reply({ access_token: "private-short-token", user_id: "123",
        permissions: platform === "instagram" ? "instagram_business_basic,instagram_business_content_publish" : "threads_basic,threads_content_publish" });
      if (url.pathname === "/access_token") return reply({ access_token: "private-long-token", expires_in: 5184000 });
      if (url.pathname === "/2/users/me") return reply({ data: { id: "managed-x-id", name: "Managed X", username: "managed-x" } });
      if (url.pathname === "/v2/userinfo") return reply({ sub: "member", name: "Member" });
      if (url.hostname === "graph.instagram.com") return reply({ user_id: "123", username: "professional", account_type: "BUSINESS" });
      if (url.hostname === "graph.threads.com") return reply({ id: "123", username: "threads-user" });
      if (url.pathname === "/v5/user_account") return reply({ username: "owner", account_type: "BUSINESS" });
      if (url.pathname === "/v5/boards") return reply({ items: [{ id: "board1", name: "Owned Board", owner: { username: "owner" } }, { id: "board2", name: "Other Board", owner: { username: "other" } }] });
      if (url.pathname === "/v5/boards/board1") return reply({ id: "board1" });
      if (url.pathname === "/youtube/v3/channels") return reply({ items: [{ id: "channel1", snippet: { title: "Channel" } }] });
      if (url.pathname === "/v2/user/info/") return reply({ data: { user: { open_id: "creator-id", display_name: "Creator" } }, error: { code: "ok" } });
      if (url.pathname === "/v2/post/publish/creator_info/query/") return reply({ data: { creator_username: "creator", privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }, error: { code: "ok" } });
      throw new Error("Unmocked managed provider request");
    };
    const result = await start(new Request(`https://customer-app.example.test/api/social/oauth/${platform}/start`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }), context);
    assert.equal(result.status, 200);
    const auth = new URL((await result.json()).url);
    if (["x", "youtube"].includes(platform)) assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    const completed = await callback(new Request(`https://customer-app.example.test/api/social/oauth/${platform}/callback?state=${auth.searchParams.get("state")}&code=provider-code`), context);
    const target = new URL(completed.headers.get("location"));
    const ticket = target.searchParams.get("social_selection");
    assert.ok(ticket, `${platform}: ${target}`);
    const discovery = await listManaged(new Request(`https://customer-app.example.test/api/social/oauth/${platform}/select?ticket=${ticket}`), context);
    const dto = await discovery.json();
    assert.equal(dto.destinations.length, 1);
    assert.doesNotMatch(JSON.stringify(dto), /private-|server-only|accessToken|clientSecret/);
    if (platform === "tiktok") assert.deepEqual(dto.destinations[0].privacyLevels, ["SELF_ONLY"]);
    const selection = { ticket, destinationId: dto.destinations[0].id };
    if (["youtube", "tiktok"].includes(platform)) {
      assert.equal((await chooseManaged(context, selection)).status, 400, "Video declarations must never be assumed");
      Object.assign(selection, platform === "youtube" ? { privacyLevel: "private", madeForKids: false } : { privacyLevel: "SELF_ONLY", aiGenerated: true });
    }
    const selected = await chooseManaged(context, selection);
    assert.equal(selected.status, 200, JSON.stringify(await selected.json()));
    const saved = list(socialCredentials).filter(item => item.socialAccountId !== 1);
    assert.equal(saved.length, 1);
    const stored = JSON.parse(decryptSecret(saved[0].encryptedCredentials));
    assert.equal(stored.oauthMode, "managed");
    assert.equal(stored.clientSecret, undefined);
    assert.equal(stored.analyticsEnabled, false);
  });
}
test("managed renew resolves the current server secret without storing it, and detects an app-ID change", async () => {
  process.env.X_OAUTH_CLIENT_ID = "managed-app";
  process.env.X_OAUTH_CLIENT_SECRET = "server-only-managed-secret";
  transport = async (url, init) => {
    assert.equal(init.headers.Authorization, `Basic ${Buffer.from("managed-app:server-only-managed-secret").toString("base64")}`);
    return reply({ access_token: "private-rotated-token", refresh_token: "private-rotated-refresh", expires_in: 7200 });
  };
  const result = await exchangeSocialToken("x", { ...secret, oauthMode: "managed", clientId: "managed-app", clientSecret: undefined }, { refresh: true });
  assert.equal(result.clientSecret, undefined);
  assert.equal(result.refreshToken, "private-rotated-refresh");
  process.env.X_OAUTH_CLIENT_ID = "different-app";
  await assert.rejects(() => exchangeSocialToken("x", result, { refresh: true }), /application changed/);
  assert.equal(calls.length, 1);
});
test("managed organization verification accepts current ACL fields but never another member or a sponsored-only role", async () => {
  const credentials = { ...secret, oauthMode: "managed", accountId: "urn:li:organization:123", apiVersion: "202610" };
  let role = { organizationTarget: credentials.accountId, roleAssignee: "urn:li:person:other", role: "ADMINISTRATOR", state: "APPROVED" };
  transport = async url => url.pathname === "/v2/userinfo" ? reply({ sub: "member", name: "Member" }) : reply({ elements: [role] });
  await assert.rejects(() => verifyCustomerConnection("linkedin", credentials), /cannot publish/);
  role = { ...role, roleAssignee: "urn:li:person:member", role: "DIRECT_SPONSORED_CONTENT_POSTER" };
  await assert.rejects(() => verifyCustomerConnection("linkedin", credentials), /cannot publish/);
  role.role = "CONTENT_ADMINISTRATOR";
  assert.equal((await verifyCustomerConnection("linkedin", credentials)).credentials.accountId, credentials.accountId);
});
test("manual inputs cannot forge managed markers to use server application credentials", async () => {
  assert.equal((await socialRequest({ action: "connect", platform: "x", credentials: { ...secret, oauthMode: "managed" } })).status, 400);
  const result = await start(new Request("https://customer-app.example.test/api/social/oauth/x/start", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentials: { clientId: "managed-app", oauthMode: "managed" } }),
  }), { params: Promise.resolve({ platform: "x" }) });
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});
test("managed configuration is optional until enabled and validates the selected app group", async () => {
  const { validateManagedSocialConfiguration } = await import("../src/lib/social-managed-config.ts");
  assert.doesNotThrow(() => validateManagedSocialConfiguration({ APP_URL: "http://localhost:3000" }));
  assert.throws(() => validateManagedSocialConfiguration({ SOCIAL_MANAGED_PROVIDERS: "x", APP_URL: process.env.APP_URL }), /client ID and secret/);
  assert.throws(() => validateManagedSocialConfiguration({ SOCIAL_MANAGED_PROVIDERS: "x", APP_URL: "http://localhost:3000",
    X_OAUTH_CLIENT_ID: "managed-app", X_OAUTH_CLIENT_SECRET: "server-only-managed-secret" }), /public HTTPS/);
  assert.throws(() => validateManagedSocialConfiguration({ SOCIAL_MANAGED_PROVIDERS: "invented" }), /supported provider/);
});
test("managed analytics opt-out performs no provider calls and does not prevent token renewal", async () => {
  rows.get(socialCredentials.name)[0].encryptedCredentials = encryptSecret(JSON.stringify({ ...secret, analyticsEnabled: false }));
  assert.deepEqual(await syncSocialAnalytics({ workspaceId: 1, accountId: 1 }), { processed: 0, failed: 0, skipped: 1 });
  assert.equal(calls.length, 0);
  transport = async () => reply({ access_token: "private-rotated-token", refresh_token: "private-rotated-refresh", expires_in: 7200 });
  assert.equal((await renewSocialCredentials({ workspaceId: 1, accountId: 1 })).processed, 1);
});
test("provider grant revocation is explicit, tenant-bound and never reported successful on provider failure", async () => {
  process.env.YOUTUBE_OAUTH_CLIENT_ID = "managed-app";
  process.env.YOUTUBE_OAUTH_CLIENT_SECRET = "server-only-managed-secret";
  rows.get(socialAccounts.name)[0].platform = "youtube";
  rows.get(socialCredentials.name)[0].encryptedCredentials = encryptSecret(JSON.stringify({ ...secret, oauthMode: "managed", clientId: "managed-app", clientSecret: undefined }));
  transport = async (url, init) => {
    assert.equal(url.href, "https://oauth2.googleapis.com/revoke");
    assert.equal(init.body.get("token"), secret.refreshToken);
    return new Response(null, { status: 503 });
  };
  const failed = await socialRequest({ action: "disconnect", accountId: 1, revokeProvider: true });
  assert.equal(failed.status, 502);
  assert.equal(list(socialCredentials).length, 1);
  transport = async () => new Response(null, { status: 200 });
  const removed = await socialRequest({ action: "disconnect", accountId: 1, revokeProvider: true });
  assert.equal((await removed.json()).revocation, "revoked");
  assert.equal(list(socialCredentials).length, 0);
});

test("refresh rotates tenant tokens and preserves identity, API version and publishing declarations", async () => {
  const otherEncrypted = encryptSecret(JSON.stringify({ ...secret, accountId: "other-account" }));
  rows.get(socialCredentials.name).push({ socialAccountId: 2, workspaceId: 1, encryptedCredentials: otherEncrypted, verifiedAt: new Date(0), expiresAt: new Date(secret.expiresAt) });
  transport = async (url, init) => {
    assert.equal(url.href, "https://api.x.com/2/oauth2/token");
    assert.equal(init.body.get("grant_type"), "refresh_token");
    assert.equal(init.body.get("refresh_token"), secret.refreshToken);
    return reply({ access_token: "rotated-access-token", refresh_token: "rotated-refresh-token", expires_in: 7200, token_type: "bearer" });
  };
  assert.deepEqual(await renewSocialCredentials({ workspaceId: 1, accountId: 1 }), { processed: 1, failed: 0, skipped: 0 });
  const stored = JSON.parse(decryptSecret(list(socialCredentials)[0].encryptedCredentials));
  assert.equal(stored.refreshToken, "rotated-refresh-token");
  for (const key of ["accountId", "apiVersion", "privacyLevel", "madeForKids", "clientId", "clientSecret"]) assert.equal(stored[key], secret[key]);
  assert.equal(list(socialAccounts)[0].status, "connected");
  assert.equal(list(socialCredentials)[1].encryptedCredentials, otherEncrypted, "Credential CAS must use socialAccountId, not a nonexistent id");
});
test("refresh claims prevent concurrent rotating-token requests", async () => {
  let release;
  transport = async () => { await new Promise(resolve => { release = resolve; }); return reply({ access_token: "rotated-access-token", refresh_token: "rotated-refresh-token", expires_in: 7200 }); };
  const first = renewSocialCredentials({ workspaceId: 1, accountId: 1 });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const second = await renewSocialCredentials({ workspaceId: 1, accountId: 1 });
  release();
  assert.equal((await first).processed, 1);
  assert.equal(second.skipped, 1);
  assert.equal(calls.length, 1);
});
test("registered public X clients use client_id without an invented client secret", async () => {
  transport = async (_url, init) => {
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.body.get("client_id"), secret.clientId);
    assert.equal(init.body.has("client_secret"), false);
    return reply({ access_token: "public-client-access-token", expires_in: 7200, refresh_token: "public-client-refresh-token" });
  };
  const renewed = await exchangeSocialToken("x", { ...secret, clientSecret: undefined }, { refresh: true });
  assert.equal(renewed.refreshToken, "public-client-refresh-token");
});
test("unsupported grants, expired refresh tokens and cap violations never contact a provider", async () => {
  rows.get(socialAccounts.name)[0].platform = "facebook";
  assert.equal((await renewSocialCredentials({ accountId: 1 })).failed, 1);
  assert.match(list(socialLifecycleStatuses)[0].renewalMessage, /generic refresh/);
  rows.get(socialAccounts.name)[0].platform = "x";
  globalThis.postifLifecycleEntitlement.plan.maxChannels = 0;
  assert.equal((await renewSocialCredentials({ accountId: 1 })).failed, 1);
  assert.equal(calls.length, 0);
  await assert.rejects(() => exchangeSocialToken("youtube", { ...secret, refreshExpiresAt: new Date(0).toISOString() }, { refresh: true }), /expired/);
  assert.equal(calls.length, 0);
});
test("malformed or rejected refresh never replaces stored secrets or exposes provider bodies", async () => {
  const original = list(socialCredentials)[0].encryptedCredentials;
  transport = async () => new Response("sensitive-provider-body customer-secret", { status: 401 });
  assert.equal((await renewSocialCredentials({ accountId: 1 })).failed, 1);
  assert.equal(list(socialCredentials)[0].encryptedCredentials, original);
  assert.doesNotMatch(JSON.stringify(list(socialLifecycleStatuses)), /sensitive-provider-body|customer-secret/);
  transport = async () => reply({ access_token: "new-token-test", expires_in: -1 });
  assert.equal((await renewSocialCredentials({ accountId: 1 })).failed, 1);
  assert.equal(list(socialCredentials)[0].encryptedCredentials, original);
});
test("TikTok requires and stores its rotated refresh token and validates open_id", async () => {
  const credentials = { ...secret, accountId: "tiktok-account" };
  transport = async (url, init) => {
    assert.equal(url.href, "https://open.tiktokapis.com/v2/oauth/token/");
    assert.equal(init.body.get("client_key"), secret.clientId);
    return reply({ access_token: "rotated-tiktok-access", refresh_token: "rotated-tiktok-refresh", expires_in: 7200, refresh_expires_in: 86400, open_id: "tiktok-account", token_type: "Bearer" });
  };
  const result = await exchangeSocialToken("tiktok", credentials, { refresh: true });
  assert.equal(result.refreshToken, "rotated-tiktok-refresh");
  assert.ok(Date.parse(result.refreshExpiresAt) > Date.now());
  transport = async () => reply({ access_token: "rotated-tiktok-access", expires_in: 7200, open_id: "tiktok-account" });
  await assert.rejects(() => exchangeSocialToken("tiktok", credentials, { refresh: true }), /rotating refresh token/);
  transport = async () => reply({ access_token: "rotated-tiktok-access", refresh_token: "rotated-tiktok-refresh", expires_in: 7200, open_id: "foreign-account" });
  await assert.rejects(() => exchangeSocialToken("tiktok", credentials, { refresh: true }), /identity did not match/);
});
test("Meta long-lived refresh requires explicit kind, nonexpiry and 24 hours; uses documented endpoint", async () => {
  rows.get(socialAccounts.name)[0].platform = "threads";
  assert.equal((await renewSocialCredentials({ accountId: 1 })).failed, 1);
  assert.equal(calls.length, 0);
  rows.get(socialCredentials.name)[0].encryptedCredentials = encryptSecret(JSON.stringify({ ...secret, tokenKind: "long_lived" }));
  rows.get(socialCredentials.name)[0].verifiedAt = new Date();
  assert.equal((await renewSocialCredentials({ accountId: 1 })).failed, 1);
  assert.equal(calls.length, 0);
  rows.get(socialCredentials.name)[0].verifiedAt = new Date(0);
  transport = async url => {
    assert.equal(url.origin + url.pathname, "https://graph.threads.com/refresh_access_token");
    assert.equal(url.searchParams.get("grant_type"), "th_refresh_token");
    return reply({ access_token: "renewed-long-lived-token", expires_in: 5184000 });
  };
  assert.equal((await renewSocialCredentials({ accountId: 1 })).processed, 1);
});
test("renew respects workspace scope and an exhausted deadline", async () => {
  assert.equal((await renewSocialCredentials({ accountId: 1, workspaceId: 2 })).processed, 0);
  assert.equal((await renewSocialCredentials({ accountId: 1, deadline: Date.now() - 1 })).processed, 0);
  assert.equal(calls.length, 0);
});
test("publishing verification and OAuth helpers abort at the remaining worker/request deadline", async () => {
  transport = async (_url, init) => new Promise((_resolve, reject) => {
    if (init.signal.aborted) { reject(init.signal.reason); return; }
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(() => withWorkerDeadline(Date.now() + 30, () => verifyCustomerConnection("x", { accessToken: secret.accessToken })), /interrupted/);
    await assert.rejects(() => withWorkerDeadline(Date.now() + 30, () => providerJson("https://api.x.com/2/oauth2/token", { method: "POST" }, Date.now() + 15000)), /interrupted/);
    await assert.rejects(() => providerJson("https://api.x.com/2/oauth2/token", { method: "POST" }, Date.now() + 30), /interrupted/);
  } finally { clearTimeout(keepAlive); }
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.init.signal.aborted));
});
test("YouTube hidden subscribers and unavailable metrics remain absent rather than zero", async () => {
  transport = async () => reply({ items: [{ id: "channel", statistics: { viewCount: "500", videoCount: "5", hiddenSubscriberCount: true } }] });
  const result = await readSocialAnalytics("youtube", { ...secret, accountId: "channel" });
  assert.deepEqual(result.metrics, { views: 500, posts: 5 });
  assert.ok(result.unavailableMetrics.includes("followers"));
  assert.ok(result.unavailableMetrics.includes("reach"));
  assert.match(result.coverage, /lifetime/);
  transport = async () => reply({ items: [{ id: "channel", statistics: { viewCount: null, videoCount: "5", hiddenSubscriberCount: true } }] });
  await assert.rejects(() => readSocialAnalytics("youtube", { ...secret, accountId: "channel" }));
});
test("TikTok real counters dedupe account/day, enforce entitlement and reject identity mismatch", async () => {
  rows.get(socialAccounts.name)[0].platform = "tiktok";
  const updatedSecret = { ...secret, accountId: "tiktok-account" };
  rows.get(socialCredentials.name)[0].encryptedCredentials = encryptSecret(JSON.stringify(updatedSecret));
  transport = async () => reply({ error: { code: "ok" }, data: { user: { open_id: "tiktok-account", follower_count: 7, likes_count: 18, video_count: 2 } } });
  assert.equal((await syncSocialAnalytics({ workspaceId: 1, accountId: 1 })).processed, 1);
  assert.equal((await syncSocialAnalytics({ workspaceId: 1, accountId: 1 })).processed, 1);
  assert.equal(list(socialEngagementSnapshots).length, 1);
  assert.deepEqual(list(socialEngagementSnapshots)[0].metrics, { followers: 7, likes: 18, posts: 2 });
  assert.equal(list(socialEngagementSnapshots)[0].isSampleData, false);
  const callCount = calls.length;
  globalThis.postifLifecycleEntitlement.features.advancedAnalytics = false;
  assert.equal((await syncSocialAnalytics({ workspaceId: 1, accountId: 1 })).skipped, 1);
  assert.equal(calls.length, callCount);
  transport = async () => reply({ error: { code: "ok" }, data: { user: { open_id: "foreign-account", follower_count: 7, likes_count: 18, video_count: 2 } } });
  await assert.rejects(() => readSocialAnalytics("tiktok", updatedSecret), /identity mismatch/);
});
test("Pinterest reads an explicit previous-day aggregate and leaves absent engagement metrics unavailable", async () => {
  transport = async url => {
    if (url.pathname === "/v5/user_account") return reply({ username: "customer-pinterest" });
    assert.equal(url.origin + url.pathname, "https://api.pinterest.com/v5/user_account/analytics");
    assert.equal(url.searchParams.get("start_date"), url.searchParams.get("end_date"));
    assert.ok(url.searchParams.get("start_date") < new Date().toISOString().slice(0, 10));
    assert.equal(url.searchParams.get("metric_types"), "IMPRESSION,ENGAGEMENT,PIN_CLICK,OUTBOUND_CLICK,SAVE");
    return reply({ all: { summary_metrics: { IMPRESSION: 123, OUTBOUND_CLICK: 3, SAVE: 0 } } });
  };
  const result = await readSocialAnalytics("pinterest", { ...secret, accountId: "customer-pinterest" });
  assert.deepEqual(result.metrics, { impressions: 123, clicks: 3, saves: 0 });
  assert.ok(result.unavailableMetrics.includes("engagements"));
  assert.match(result.coverage, /UTC/);
});
test("LinkedIn organization organic statistics validate entity, preserve real signed likes and configured version", async () => {
  transport = async (url, init) => {
    assert.equal(url.origin + url.pathname, "https://api.linkedin.com/rest/organizationalEntityShareStatistics");
    assert.equal(url.searchParams.get("organizationalEntity"), "urn:li:organization:123");
    assert.equal(init.headers["Linkedin-Version"], "202610");
    return reply({ elements: [{ organizationalEntity: "urn:li:organization:123", totalShareStatistics: { impressionCount: 111, likeCount: -1, commentCount: 3, shareCount: 2 } }] });
  };
  const result = await readSocialAnalytics("linkedin", { ...secret, apiVersion: "202610", accountId: "urn:li:organization:123" });
  assert.deepEqual(result.metrics, { impressions: 111, likes: -1, comments: 3, shares: 2 });
  assert.ok(result.unavailableMetrics.includes("clicks"));
  transport = async () => reply({ elements: [{ organizationalEntity: "urn:li:organization:999", totalShareStatistics: { impressionCount: 12 } }] });
  await assert.rejects(() => readSocialAnalytics("linkedin", { ...secret, apiVersion: "202610", accountId: "urn:li:organization:123" }), /organization analytics scope/);
});
test("LinkedIn member reads real TOTAL metrics without equating reactions with likes or inventing empty values", async () => {
  transport = async url => {
    if (url.pathname === "/v2/userinfo") return reply({ sub: "member" });
    assert.equal(url.origin + url.pathname, "https://api.linkedin.com/rest/memberCreatorPostAnalytics");
    assert.equal(url.searchParams.get("q"), "me");
    assert.equal(url.searchParams.get("aggregation"), "TOTAL");
    const type = url.searchParams.get("queryType");
    return reply({ elements: type === "MEMBERS_REACHED" ? [] : [{ count: type === "IMPRESSION" ? 22 : 1, metricType: type }] });
  };
  const result = await readSocialAnalytics("linkedin", { ...secret, apiVersion: "202610", accountId: "urn:li:person:member" });
  assert.deepEqual(result.metrics, { impressions: 22, reactions: 1, comments: 1, shares: 1 });
  assert.ok(result.unavailableMetrics.includes("reach"));
  assert.ok(result.unavailableMetrics.includes("likes"));
});
test("parallel LinkedIn reads settle before a failed sync returns; no detached provider work remains", async () => {
  let completed = 0;
  transport = async url => {
    if (url.pathname === "/v2/userinfo") return reply({ sub: "member" });
    const type = url.searchParams.get("queryType");
    if (type === "IMPRESSION") return new Response("provider unavailable", { status: 503 });
    await new Promise(resolve => setTimeout(resolve, 20));
    completed++;
    return reply({ elements: [{ count: 1, metricType: type }] });
  };
  await assert.rejects(() => readSocialAnalytics("linkedin", { ...secret, apiVersion: "202610", accountId: "urn:li:person:member" }), /HTTP 503/);
  assert.equal(completed, 4);
});
test("Facebook engagement excludes visitor/draft posts and never turns omitted share counts into zero", async () => {
  transport = async url => {
    if (!url.pathname.endsWith("/feed")) return reply({ id: "123", followers_count: 7, fan_count: 5 });
    assert.equal(url.origin + url.pathname, "https://graph.facebook.com/v27.0/123/feed");
    return reply({ data: [
      { id: "123_post", from: { id: "123" }, is_published: true, reactions: { summary: { total_count: 8 } }, comments: { summary: { total_count: 2 } } },
      { id: "visitor_post", from: { id: "999" }, is_published: true, reactions: { summary: { total_count: 500 } } },
      { id: "draft_post", from: { id: "123" }, is_published: false, reactions: { summary: { total_count: 500 } } },
    ] });
  };
  const result = await readSocialAnalytics("facebook", { ...secret, accountId: "123" });
  assert.deepEqual(result.metrics, { followers: 7, pageLikes: 5, sampledPosts: 1, reactions: 8, comments: 2 });
  assert.ok(result.unavailableMetrics.includes("shares"));
  assert.ok(result.unavailableMetrics.includes("likes"));
});
test("Instagram uses current total-value insights and retains real profile counts when insights permission is missing", async () => {
  transport = async url => {
    if (url.pathname.endsWith("/me")) return reply({ data: [{ user_id: "1784", followers_count: 34, media_count: 5 }] });
    assert.equal(url.origin + url.pathname, "https://graph.instagram.com/v27.0/1784/insights");
    assert.equal(url.searchParams.get("metric_type"), "total_value");
    assert.ok(!url.searchParams.get("metric").includes("impressions"));
    return reply({ data: [{ name: "views", total_value: { value: 100 } }, { name: "likes", total_value: { value: 0 } }, { name: "reach", total_value: { value: 80 } }] });
  };
  const result = await readSocialAnalytics("instagram", { ...secret, accountId: "1784" });
  assert.deepEqual(result.metrics, { followers: 34, posts: 5, views: 100, likes: 0, reach: 80 });
  assert.ok(result.unavailableMetrics.includes("comments"));
  transport = async url => url.pathname.endsWith("/me") ? reply({ user_id: "1784", followers_count: 34 }) : new Response("sensitive provider body", { status: 403 });
  const limited = await readSocialAnalytics("instagram", { ...secret, accountId: "1784" });
  assert.deepEqual(limited.metrics, { followers: 34 });
  assert.match(limited.coverage, /insights unavailable/);
  assert.doesNotMatch(limited.coverage, /sensitive provider/);
});
test("Threads separates lifetime follower request from date-filtered insights and sums actual link counts only", async () => {
  transport = async url => {
    if (url.pathname.endsWith("/me")) return reply({ id: "123" });
    if (url.searchParams.get("metric") === "followers_count") {
      assert.equal(url.searchParams.has("since"), false);
      assert.equal(url.searchParams.has("until"), false);
      return reply({ data: [{ name: "followers_count", total_value: { value: 42 } }] });
    }
    assert.ok(url.searchParams.has("since"));
    return reply({ data: [
      { name: "views", values: [{ value: 17, end_time: new Date().toISOString() }] },
      { name: "likes", total_value: { value: 3 } },
      { name: "clicks", link_total_values: [{ value: 1, link_url: "https://ignored.example" }, { value: 2, link_url: "https://ignored-again.example" }] },
    ] });
  };
  const result = await readSocialAnalytics("threads", { ...secret, accountId: "123" });
  assert.deepEqual(result.metrics, { profileViews: 17, likes: 3, clicks: 3, followers: 42 });
  assert.ok(result.unavailableMetrics.includes("views"), "Profile views must not be presented as post views");
  assert.ok(calls.every(call => call.url.hostname === "graph.threads.com"));
});
test("unavailable provider reporting is explicit and never persisted as a zero snapshot", async () => {
  transport = async url => url.pathname === "/v5/user_account" ? reply({ username: "customer" }) : reply({ all: { summary_metrics: {} } });
  await assert.rejects(() => readSocialAnalytics("pinterest", { ...secret, accountId: "customer" }), /no available metrics/);
  assert.equal(list(socialEngagementSnapshots).length, 0);
});
async function startOAuth() {
  const { accessToken, ...credentials } = secret;
  void accessToken;
  const response = await start(new Request("https://customer-app.example.test/api/social/oauth/x/start", { method: "POST", body: JSON.stringify({ credentials }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ platform: "x" }) });
  assert.equal(response.status, 200);
  return new URL((await response.json()).url);
}
test("OAuth uses single-use random user/workspace-bound state, PKCE and a fixed callback", async () => {
  const authorization = await startOAuth();
  assert.equal(authorization.origin, "https://x.com");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.get("redirect_uri"), "https://customer-app.example.test/api/social/oauth/x/callback");
  const state = authorization.searchParams.get("state");
  assert.notEqual(list(socialOAuthAttempts)[0].stateHash, state);
  assert.doesNotMatch(list(socialOAuthAttempts)[0].encryptedPayload, /customer-secret/);
  transport = async url => url.pathname.includes("oauth2") ? reply({ access_token: "oauth-access-token", refresh_token: "oauth-refresh-token", expires_in: 7200 }) : reply({ data: { id: "x-account", name: "Customer", username: "customer" } });
  const request = () => new Request(`https://customer-app.example.test/api/social/oauth/x/callback?state=${state}&code=provider-code&next=https://evil.example/`);
  const context = { params: Promise.resolve({ platform: "x" }) };
  globalThis.postifLifecycleAuth.workspace.id = 2;
  assert.equal((await callback(request(), context)).status, 400);
  assert.equal(calls.length, 0);
  globalThis.postifLifecycleAuth.workspace.id = 1;
  const completed = await callback(request(), context);
  assert.equal(completed.status, 307);
  assert.equal(completed.headers.get("location"), "https://customer-app.example.test/app/social");
  assert.equal(list(socialOAuthAttempts)[0].encryptedPayload, "");
  const count = calls.length;
  assert.equal((await callback(request(), context)).status, 400);
  assert.equal(calls.length, count);
});
async function authorizeMeta(platform, settings) {
  const { accessToken, ...credentials } = { ...secret, ...settings };
  void accessToken;
  const context = { params: Promise.resolve({ platform }) };
  const started = await start(new Request(`https://customer-app.example.test/api/social/oauth/${platform}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentials }) }), context);
  assert.equal(started.status, 200);
  const authorization = new URL((await started.json()).url);
  const result = await callback(new Request(`https://customer-app.example.test/api/social/oauth/${platform}/callback?state=${authorization.searchParams.get("state")}&code=provider-code`), context);
  return { authorization, result };
}
test("Meta OAuth requires an intended Page/professional-account ID and requests only explicitly chosen approved scopes", () => {
  for (const platform of ["facebook", "instagram"]) assert.throws(() => validateSocialOAuthSettings(platform, { clientId: "client", clientSecret: "secret" }), /intended/);
  const instagram = new URL(oauthAuthorizationUrl("instagram", "client", "state", "challenge", { accountId: "1784", analyticsEnabled: true }));
  assert.equal(instagram.origin + instagram.pathname, "https://www.instagram.com/oauth/authorize");
  assert.ok(instagram.searchParams.get("scope").includes("instagram_business_manage_insights"));
  const withoutInsights = new URL(oauthAuthorizationUrl("instagram", "client", "state", "challenge", { analyticsEnabled: false }));
  assert.ok(!withoutInsights.searchParams.get("scope").includes("manage_insights"));
  const linkedin = new URL(oauthAuthorizationUrl("linkedin", "client", "state", "challenge", { accountId: "urn:li:organization:123" }));
  assert.ok(linkedin.searchParams.get("scope").includes("w_organization_social"));
  assert.ok(!linkedin.searchParams.get("scope").includes("r_member_postAnalytics"));
});
test("Facebook OAuth derives and stores only the exact intended long-lived Page token, never the first Page/user token", async () => {
  let pageReads = 0;
  transport = async url => {
    assert.ok(["graph.facebook.com"].includes(url.hostname));
    if (url.pathname.endsWith("/oauth/access_token")) return url.searchParams.get("grant_type") === "fb_exchange_token"
      ? reply({ access_token: "long-lived-user-token", expires_in: 5184000, token_type: "bearer" })
      : reply({ access_token: "short-lived-user-token" });
    if (url.pathname.endsWith("/me/accounts")) {
      pageReads++;
      if (pageReads === 1) return reply({ data: [{ id: "999", access_token: "wrong-first-page-token", tasks: ["CREATE_CONTENT"] }], paging: { next: "https://untrusted.example/steal-secrets", cursors: { after: "safe-cursor" } } });
      assert.equal(url.searchParams.get("after"), "safe-cursor");
      return reply({ data: [{ id: "123", access_token: "intended-page-access-token", tasks: ["CREATE_CONTENT"] }] });
    }
    if (url.pathname.endsWith("/me")) return reply({ id: "123", name: "Customer Page", category: "Business" });
    throw new Error("Unmocked Facebook request");
  };
  const { authorization, result } = await authorizeMeta("facebook", { accountId: "123" });
  assert.equal(authorization.origin + authorization.pathname, "https://www.facebook.com/v27.0/dialog/oauth");
  assert.equal(result.status, 307);
  const account = list(socialAccounts).find(row => row.platform === "facebook");
  const stored = JSON.parse(decryptSecret(list(socialCredentials).find(row => row.socialAccountId === account.id).encryptedCredentials));
  assert.equal(stored.accessToken, "intended-page-access-token");
  assert.equal(stored.accountId, "123");
  assert.equal(stored.expiresAt, undefined, "Long-lived Page token must not inherit user token expiry");
  assert.equal(stored.refreshToken, undefined);
  assert.equal(stored.tokenKind, "long_lived");
  assert.doesNotMatch(JSON.stringify(stored), /short-lived-user-token|long-lived-user-token|wrong-first-page-token/);
  assert.ok(calls.every(call => call.url.hostname === "graph.facebook.com"), "Pagination must rebuild official URL, not follow provider-supplied next");
});
test("Facebook OAuth refuses an absent intended Page instead of silently choosing another", async () => {
  transport = async url => {
    if (url.pathname.endsWith("/oauth/access_token")) return url.searchParams.get("grant_type") === "fb_exchange_token" ? reply({ access_token: "long-lived-user-token", expires_in: 5184000 }) : reply({ access_token: "short-lived-user-token" });
    return reply({ data: [{ id: "999", access_token: "wrong-page-access-token", tasks: ["CREATE_CONTENT"] }] });
  };
  const result = await exchangeSocialToken("facebook", { ...secret, accountId: "123" }, { code: "provider-code", verifier: "unused" }).then(() => null, error => error);
  assert.match(result.message, /intended Page was not found/);
  assert.equal(list(socialAccounts).length, 1);
});
test("Instagram OAuth exchanges its single-account response and saves a verified professional long-lived token", async () => {
  transport = async (url, init) => {
    if (url.hostname === "api.instagram.com") {
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get("redirect_uri"), "https://customer-app.example.test/api/social/oauth/instagram/callback");
      return reply({ data: [{ access_token: "short-instagram-token", user_id: "app-scoped-instagram" }] });
    }
    if (url.pathname === "/access_token") {
      assert.equal(url.searchParams.get("grant_type"), "ig_exchange_token");
      return reply({ access_token: "long-instagram-token", expires_in: 5184000, token_type: "bearer" });
    }
    return reply({ data: [{ user_id: "1784", username: "customer-instagram" }] });
  };
  const { result } = await authorizeMeta("instagram", { accountId: "1784" });
  assert.equal(result.status, 307);
  const account = list(socialAccounts).find(row => row.platform === "instagram");
  const stored = JSON.parse(decryptSecret(list(socialCredentials).find(row => row.socialAccountId === account.id).encryptedCredentials));
  assert.equal(stored.accessToken, "long-instagram-token");
  assert.equal(stored.tokenKind, "long_lived");
  assert.equal(stored.accountId, "1784");
  assert.equal(stored.madeForKids, secret.madeForKids, "Exchange must preserve existing customer declarations");
});
test("Instagram intended account mismatch cannot connect or store returned tokens", async () => {
  transport = async url => {
    if (url.hostname === "api.instagram.com") return reply({ access_token: "short-instagram-token", user_id: "app-scoped-id" });
    if (url.pathname === "/access_token") return reply({ access_token: "long-instagram-token", expires_in: 5184000 });
    return reply({ user_id: "999", username: "other-instagram" });
  };
  const { result } = await authorizeMeta("instagram", { accountId: "1784" });
  assert.equal(result.status, 403);
  assert.equal(list(socialAccounts).length, 1);
  assert.equal(list(socialCredentials).length, 1);
});
test("Threads OAuth obtains a long-lived token through the official exchange and preserves target identity", async () => {
  transport = async (url, init) => {
    assert.equal(url.hostname, "graph.threads.com");
    if (url.pathname === "/oauth/access_token") {
      assert.equal(init.body.get("client_id"), secret.clientId);
      return new Response('{"access_token":"short-threads-token","token_type":"bearer","user_id":17841405793187218}', { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/access_token") {
      assert.equal(url.searchParams.get("grant_type"), "th_exchange_token");
      return reply({ access_token: "long-threads-token", expires_in: 5184000, token_type: "bearer" });
    }
    return reply({ id: "17841405793187218", username: "customer-threads" });
  };
  const { authorization, result } = await authorizeMeta("threads", { accountId: "17841405793187218" });
  assert.equal(authorization.origin + authorization.pathname, "https://threads.com/oauth/authorize");
  assert.ok(authorization.searchParams.get("scope").includes("threads_manage_insights"));
  assert.equal(result.status, 307);
  const account = list(socialAccounts).find(row => row.platform === "threads");
  const stored = JSON.parse(decryptSecret(list(socialCredentials).find(row => row.socialAccountId === account.id).encryptedCredentials));
  assert.equal(stored.accessToken, "long-threads-token");
  assert.equal(stored.tokenKind, "long_lived");
  assert.equal(stored.accountId, "17841405793187218", "Unquoted provider numeric IDs must not be rounded");
});
test("expired state, provider refusal and unauthorized role cannot exchange codes", async () => {
  const authorization = await startOAuth();
  const state = authorization.searchParams.get("state");
  rows.get(socialOAuthAttempts.name)[0].expiresAt = new Date(0);
  const context = { params: Promise.resolve({ platform: "x" }) };
  assert.equal((await callback(new Request(`https://customer-app.example.test/api/social/oauth/x/callback?state=${state}&code=ignored`), context)).status, 400);
  const second = await startOAuth();
  const result = await callback(new Request(`https://customer-app.example.test/api/social/oauth/x/callback?state=${second.searchParams.get("state")}&error=access_denied&error_description=SECRET`), context);
  assert.equal(result.status, 422);
  assert.doesNotMatch(await result.text(), /SECRET/);
  globalThis.postifLifecycleAuth.memberRole = "viewer";
  assert.equal((await start(new Request("https://customer-app.example.test", { method: "POST" }), context)).status, 403);
  assert.equal(calls.length, 0);
});
test("callback configuration rejects non-public or non-HTTPS origins", () => {
  for (const value of ["http://example.test", "https://localhost", "https://127.0.0.1", "https://example.test/path", "https://user:pass@example.test"]) {
    process.env.APP_URL = value;
    assert.throws(() => oauthCallbackUrl("x"), /public HTTPS/);
  }
  process.env.APP_URL = "https://customer-app.example.test";
});
test("capacity permits re-verifying an existing connected account but rejects restoring another", async () => {
  globalThis.postifLifecycleEntitlement.plan.maxChannels = 1;
  await assertSocialConnectCapacity(1, 1, database);
  await assert.rejects(() => assertSocialConnectCapacity(1, 2, database), /limit/);
});
const socialRequest = body => social(new Request("https://customer-app.example.test/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
test("manual verify cannot restore a needs-review account beyond the atomic connected cap", async () => {
  globalThis.postifLifecycleEntitlement.plan.maxChannels = 1;
  rows.get(socialAccounts.name)[0].status = "needs_review";
  rows.get(socialAccounts.name).push({ ...list(socialAccounts)[0], id: 2, status: "connected" });
  transport = async () => reply({ data: { id: "x-account", name: "Customer", username: "customer" } });
  const result = await socialRequest({ action: "refresh", accountId: 1 });
  assert.equal(result.status, 403);
  assert.equal(list(socialAccounts)[0].status, "needs_review");
});
test("provider forbidden verification marks credentials as needing review, not connected", async () => {
  transport = async () => new Response("sensitive provider details", { status: 403 });
  const result = await socialRequest({ action: "refresh", accountId: 1 });
  assert.equal(result.status, 403);
  assert.equal(list(socialAccounts)[0].status, "needs_review");
  assert.doesNotMatch(await result.text(), /sensitive provider/);
});
test("disconnect deletes local credentials and pending authorizations, but does not claim remote revocation", async () => {
  await startOAuth();
  const result = await socialRequest({ action: "disconnect", accountId: 1 });
  assert.equal(result.status, 200);
  assert.equal(list(socialCredentials).length, 0);
  assert.equal(list(socialOAuthAttempts).length, 0);
  assert.equal(list(socialAccounts)[0].status, "disconnected");
  assert.match(list(socialLifecycleStatuses)[0].renewalMessage, /provider separately/);
  assert.equal(calls.length, 0);
});
test("brand entitlement blocks manual connect, verify and OAuth exchange before provider side effects", async () => {
  const authorization = await startOAuth();
  globalThis.postifLifecycleDenyBrand = true;
  assert.equal((await socialRequest({ action: "connect", platform: "x", credentials: secret })).status, 403);
  assert.equal((await socialRequest({ action: "refresh", accountId: 1 })).status, 403);
  const result = await callback(new Request(`https://customer-app.example.test/api/social/oauth/x/callback?state=${authorization.searchParams.get("state")}&code=ignored`), { params: Promise.resolve({ platform: "x" }) });
  assert.equal(result.status, 403);
  assert.equal(list(socialOAuthAttempts)[0].consumedAt, null);
  assert.equal(calls.length, 0);
});
