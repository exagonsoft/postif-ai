import "./register-ts.mjs";
import assert from "node:assert/strict";
if (process.env.MONGO_TEST_DATABASE !== "true") throw new Error("Run through the isolated MongoDB test runner.");
process.env.APP_URL = "https://managed-social.example.test";
process.env.SOCIAL_MANAGED_PROVIDERS = "facebook";
process.env.SOCIAL_OAUTH_APPROVED_PROVIDERS = "facebook";
process.env.FACEBOOK_OAUTH_CLIENT_ID = "isolated-managed-app";
process.env.FACEBOOK_OAUTH_CLIENT_SECRET = "isolated-server-secret";
const { db, closeDatabase } = await import("../src/db/index.ts");
const { users, workspaces, brands, socialAccounts, socialCredentials } = await import("../src/db/schema.ts");
const { socialOAuthAttempts } = await import("../src/db/social-lifecycle-schema.ts");
const { createManagedSelection, selectManagedDestination } = await import("../src/lib/social-managed-oauth.ts");
const { getWorkspaceEntitlements } = await import("../src/lib/entitlements.ts");
const { decryptSecret } = await import("../src/lib/crypto.ts");
let user;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, "graph.facebook.com");
  assert.ok(url.pathname.endsWith("/me"));
  const id = options.headers.Authorization.includes("token-123") ? "123" : "456";
  return Response.json({ id, name: `Authorized Page ${id}`, category: "Business" });
};
try {
  [user] = await db.insert(users, { email: "managed-social-concurrency@example.test", name: "Managed Social Test", passwordHash: "isolated-test-only" });
  const [workspace] = await db.insert(workspaces, { ownerId: user.id, name: "Managed OAuth Quota", slug: crypto.randomUUID(), planSlug: "free" });
  const [brand] = await db.insert(brands, { workspaceId: workspace.id, name: "Quota Test" });
  const { plan } = await getWorkspaceEntitlements(workspace.id);
  assert.ok(plan.maxChannels >= 1);
  for (let i = 0; i < plan.maxChannels - 1; i++) await db.insert(socialAccounts, { workspaceId: workspace.id, brandId: brand.id, platform: "x", accountName: "Isolated quota fixture", handle: `isolated-${i}`, status: "connected" });
  const tickets = await Promise.all(["123", "456"].map(id => createManagedSelection({
    workspaceId: workspace.id, userId: user.id, brandId: brand.id, platform: "facebook", analyticsEnabled: false, organizations: false,
    destinations: [{ id, name: `Authorized Page ${id}`, handle: id, accountType: "page", permissions: ["pages_manage_posts"],
      credentials: { accessToken: `isolated-page-token-${id}`, accountId: id, oauthMode: "managed", clientId: process.env.FACEBOOK_OAUTH_CLIENT_ID, tokenKind: "long_lived", analyticsEnabled: false } }],
  })));
  const input = index => ({ workspaceId: workspace.id, userId: user.id, actorEmail: user.email,
    platform: "facebook", ticket: tickets[index], destinationId: ["123", "456"][index] });
  const results = await Promise.allSettled([selectManagedDestination(input(0)), selectManagedDestination(input(1))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1, "Concurrent selections cannot exceed the real MongoDB channel limit");
  const failure = results.find(result => result.status === "rejected");
  assert.match(failure.reason.message, /channel.*limit/i);
  assert.equal((await db.find(socialAccounts, { workspaceId: workspace.id, status: "connected" })).length, plan.maxChannels);
  assert.equal((await db.find(socialOAuthAttempts, { workspaceId: workspace.id, consumedAt: null })).length, 1, "Losing selection must roll back ticket consumption");
  const winner = results.findIndex(result => result.status === "fulfilled");
  await assert.rejects(() => selectManagedDestination(input(winner)), /STATE_INVALID/);
  const stored = await db.find(socialCredentials, { workspaceId: workspace.id });
  assert.equal(stored.length, 1);
  assert.doesNotMatch(decryptSecret(stored[0].encryptedCredentials), /isolated-server-secret|clientSecret/);
  console.log("Managed OAuth MongoDB checks passed: concurrent quota enforcement, atomic ticket rollback, replay prevention and secret exclusion.");
} finally {
  globalThis.fetch = originalFetch;
  if (user) await db.remove(users, { id: user.id });
  await closeDatabase();
}
