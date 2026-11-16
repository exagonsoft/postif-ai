import assert from "node:assert/strict";
import "./register-ts.mjs";

if (process.env.MONGO_TEST_DATABASE !== "true") throw new Error("Run through the isolated MongoDB test runner.");
const { db, closeDatabase } = await import("../src/db/index.ts");
const { users, workspaces, brands, posts, publishingJobs, sessions } = await import("../src/db/schema.ts");
const { publishingReservations } = await import("../src/db/entitlement-schema.ts");
const { getPlanDefinition } = await import("../src/lib/plans.ts");
const { getWorkspaceEntitlements, getPublishingUsage, assertPublishingEntitlement, consumePublishingReservation, releasePublishingReservation, retainPublishedUsage } = await import("../src/lib/entitlements.ts");
const { accountTokens } = await import("../src/db/account-schema.ts");
const { completeAccountAction, requestAccountEmail } = await import("../src/lib/account-email.ts");
const { default: nodemailer } = await import("nodemailer");
const { generateSessionToken, hashToken, verifyPassword } = await import("../src/lib/crypto.ts");
const { setTestSubscription } = await import("./fixtures/subscription.mjs");
const { savePost } = await import("../src/lib/post-workflow.ts");

let owner;
const originalTransport = nodemailer.createTransport;
const originalMailEnvironment = Object.fromEntries(["SMTP_URL", "MAIL_FROM", "APP_URL"].map(key => [key, process.env[key]]));
try {
  [owner] = await db.insert(users, { email: `entitlement-${crypto.randomUUID()}@example.test`, name: "Entitlement test", passwordHash: "fixture", emailVerified: false });
  const [workspace] = await db.insert(workspaces, { name: "Quota", slug: `quota-${crypto.randomUUID()}`, ownerId: owner.id, planSlug: "agency", aiCreditsBalance: 5000 });
  const [brand] = await db.insert(brands, { workspaceId: workspace.id, name: "Quota brand" });
  assert.equal(getPlanDefinition("__proto__").slug, "free");
  assert.equal(getPlanDefinition("nonexistent").slug, "free");
  assert.equal((await getWorkspaceEntitlements(workspace.id)).plan.slug, "free", "Cached plan/balance cannot self-assign premium access");
  await setTestSubscription(workspace.id, "agency");
  assert.equal((await getWorkspaceEntitlements(workspace.id)).features.team, true);
  await setTestSubscription(workspace.id, "agency", new Date(0));
  assert.equal((await getWorkspaceEntitlements(workspace.id)).plan.slug, "free", "Paid access expires at paid-through without a grace period");
  const candidates = [];
  for (let index = 0; index < 8; index++) {
    const [post] = await db.insert(posts, { workspaceId: workspace.id, brandId: brand.id, title: `Quota ${index}`, topic: "Quota", baseContent: "Quota content", platforms: ["linkedin"], status: "scheduled", scheduledAt: new Date() });
    candidates.push(post);
  }
  const results = await Promise.allSettled(candidates.map(post => db.transaction(tx => assertPublishingEntitlement(post, tx))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 5, "Concurrent dispatches cannot exceed the Free monthly allowance");
  assert.equal((await getPublishingUsage(workspace.id)).used, 5);
  const postContext = { workspaceId: workspace.id, brandId: brand.id, userId: owner.id, email: owner.email, role: "owner" };
  await assert.rejects(savePost(postContext, { title: "Over quota now", baseContent: "Do not publish", platforms: ["linkedin"], status: "published", requiresApproval: false }), error => error.status === 403);
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
  const future = await savePost(postContext, { title: "Next month", baseContent: "A future allowance", platforms: ["linkedin"], status: "scheduled", scheduledAt: nextMonth.toISOString(), requiresApproval: false });
  assert.equal(future.status, "scheduled", "Exhausted current-month quota must not prevent next-month scheduling");
  await db.remove(posts, { id: future.id });
  const [first] = await db.find(publishingReservations, { workspaceId: workspace.id }, { sort: { postId: 1 } });
  const post = candidates.find(candidate => candidate.id === first.postId);
  await db.transaction(tx => assertPublishingEntitlement(post, tx));
  assert.equal((await getPublishingUsage(workspace.id)).used, 5, "Retrying a reservation must not consume another quota slot");
  await db.transaction(tx => consumePublishingReservation(workspace.id, post.id, tx));
  await db.remove(posts, { id: post.id });
  assert.equal((await getPublishingUsage(workspace.id)).used, 5, "Deleting a published post cannot recover consumed allowance");
  const [releasable] = await db.find(publishingReservations, { workspaceId: workspace.id, status: "reserved" });
  const [job] = await db.insert(publishingJobs, { workspaceId: workspace.id, postId: releasable.postId, platform: "linkedin", status: "uncertain", scheduledFor: new Date(), idempotencyKey: `quota-${crypto.randomUUID()}` });
  await db.transaction(tx => releasePublishingReservation(workspace.id, releasable.postId, tx));
  assert.equal((await getPublishingUsage(workspace.id)).used, 5, "An ambiguous public result must retain its quota slot");
  await db.update(publishingJobs, { id: job.id }, { status: "failed" });
  await db.transaction(tx => releasePublishingReservation(workspace.id, releasable.postId, tx));
  assert.equal((await getPublishingUsage(workspace.id)).used, 4, "A definitely unused reservation can be released");
  const [legacy] = await db.insert(posts, { workspaceId: workspace.id, brandId: brand.id, title: "Legacy", topic: "Quota", baseContent: "Published before quota reservations", status: "published", publishedAt: new Date() });
  assert.equal((await getPublishingUsage(workspace.id)).used, 5, "Existing published posts count toward the current month");
  await db.transaction(async tx => {
    await retainPublishedUsage(legacy, tx);
    await tx.remove(posts, { id: legacy.id });
  });
  assert.equal((await getPublishingUsage(workspace.id)).used, 5, "Deleting a legacy published post must also retain its usage");

  const verificationToken = generateSessionToken();
  await db.insert(accountTokens, { tokenHash: hashToken(verificationToken), userId: owner.id, purpose: "verify_email", expiresAt: new Date(Date.now() + 60000) });
  const verified = await Promise.allSettled([completeAccountAction(verificationToken, "verify_email"), completeAccountAction(verificationToken, "verify_email")]);
  assert.equal(verified.filter(result => result.status === "fulfilled").length, 1, "Email verification tokens are single use under concurrency");
  assert.equal((await db.find(users, { id: owner.id }))[0].emailVerified, true);
  const expiredToken = generateSessionToken();
  await db.insert(accountTokens, { tokenHash: hashToken(expiredToken), userId: owner.id, purpose: "reset_password", expiresAt: new Date(0) });
  await assert.rejects(completeAccountAction(expiredToken, "reset_password", "A-valid-password-928!"), /expired/);
  const resetToken = generateSessionToken();
  await db.insert(accountTokens, { tokenHash: hashToken(resetToken), userId: owner.id, purpose: "reset_password", expiresAt: new Date(Date.now() + 60000) });
  await db.insert(sessions, { userId: owner.id, tokenHash: hashToken(generateSessionToken()), expiresAt: new Date(Date.now() + 60000) });
  await completeAccountAction(resetToken, "reset_password", "A-valid-password-928!");
  assert.ok(verifyPassword("A-valid-password-928!", (await db.find(users, { id: owner.id }))[0].passwordHash));
  assert.equal((await db.find(sessions, { userId: owner.id })).length, 0, "Resetting a password invalidates all existing sessions");
  await assert.rejects(completeAccountAction(resetToken, "reset_password", "Another-password-928!"), /expired/);
  const messages = [];
  process.env.SMTP_URL = "smtps://mailer:unit-test-password@smtp.example.test:465";
  process.env.MAIL_FROM = "support@example.test";
  process.env.APP_URL = "https://app.example.test";
  nodemailer.createTransport = () => ({
    sendMail: async message => { messages.push(message); return { accepted: [message.to] }; },
    close() {},
  });
  await requestAccountEmail(owner.email, "reset_password");
  assert.equal(messages.length, 1);
  const link = messages[0].text.match(/https:\/\/app\.example\.test\/reset-password#token=([a-f0-9]{64})/);
  assert.ok(link, "Account links keep the token in a fragment, outside the server URL/query");
  await assert.rejects(requestAccountEmail(owner.email, "reset_password"), error => error.status === 429);
  assert.equal(messages.length, 1, "The email cooldown prevents repeated delivery");
  await requestAccountEmail("unknown@example.test", "reset_password");
  assert.equal(messages.length, 1, "Unknown users cannot cause outbound mail");
  await completeAccountAction(link[1], "reset_password", "Mail-delivered-password-928!");
  console.log("Entitlement/account checks passed: fail-closed plans, concurrent quotas, retry reuse, deletion retention, ambiguous delivery, legacy usage, single-use/expired tokens, password reset and session revocation.");
} finally {
  nodemailer.createTransport = originalTransport;
  for (const [key, value] of Object.entries(originalMailEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (owner) await db.remove(users, { id: owner.id });
  await closeDatabase();
}
