import { db } from "@/db";
import { posts, publishingJobs, socialAccounts, socialCredentials, mediaAssets, workspaces } from "@/db/schema";
import { increment } from "@/db/filters";
import { isPublishable } from "./post-policy";
import { notifyWorkspace } from "./notification-service";
import { encryptSecret, decryptSecret } from "./crypto";
import { customerCredentials, providerState, publishToCustomerAccount, SocialProviderError } from "./social-provider";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "./social-adapters";

async function updatePostResult(postId: number) {
  await db.transaction(async tx => {
    const [post] = await tx.find(posts, { id: postId }, { lock: true });
    if (!post || !isPublishable(post)) return;
    const jobs = await tx.find(publishingJobs, { postId, status: { $ne: "cancelled" } });
    if (jobs.length && jobs.every(job => job.status === "completed")) {
      await tx.update(posts, { id: postId }, { status: "published", publishedAt: new Date(), updatedAt: new Date() });
      await tx.update(workspaces, { id: post.workspaceId }, { postsPublishedThisMonth: increment(1) });
      if (post.notifyOnPublish) await notifyWorkspace(tx, post.workspaceId, "publish_success", "Post published", `"${post.title}" was confirmed by every selected platform.`, "/app/calendar");
    } else if (jobs.some(job => ["processing", "queued", "retrying", "completed", "uncertain"].includes(job.status))) {
      await tx.update(posts, { id: postId }, { status: "publishing", updatedAt: new Date() });
    } else {
      await tx.update(posts, { id: postId }, { status: "scheduled", updatedAt: new Date() });
    }
  });
}

export async function processDuePosts(workspaceId?: number) {
  return db.withLease("social-publishing", async () => {
    const scope = workspaceId ? { workspaceId } : {};
    const interrupted = await db.find(publishingJobs, { ...scope, status: "processing", encryptedProviderState: null, startedAt: { $lte: new Date(Date.now() - 600000) } });
    for (const job of interrupted) {
      await db.update(publishingJobs, { id: job.id, status: "processing" }, { status: "uncertain", errorMessage: "Worker stopped during a provider request. Check the platform before rescheduling." });
      await updatePostResult(job.postId);
    }
    let processed = 0;
    for (let i = 0; i < 50; i++) {
      const claim = await db.transaction(async tx => {
        const [job] = await tx.find(publishingJobs, { ...scope, $or: [{ status: { $in: ["queued", "retrying"] }, scheduledFor: { $lte: new Date() }, $or: [{ nextCheckAt: null }, { nextCheckAt: { $lte: new Date() } }] }, { status: "processing", encryptedProviderState: { $type: "string" }, nextCheckAt: { $lte: new Date() } }] }, { sort: { scheduledFor: 1 }, limit: 1, lock: true });
        if (!job) return null;
        const [post] = await tx.find(posts, { id: job.postId }, { lock: true });
        if (!post || !isPublishable(post) || !post.platforms.includes(job.platform) || post.scheduledAt?.getTime() !== job.scheduledFor.getTime()) {
          await tx.update(publishingJobs, { id: job.id }, { status: "cancelled", errorMessage: "Post is no longer eligible for publishing." });
          return { job, post: null, account: null };
        }
        const accounts = await tx.find(socialAccounts, { workspaceId: post.workspaceId, brandId: post.brandId, platform: job.platform, status: "connected" });
        const account = job.socialAccountId ? accounts.find(account => account.id === job.socialAccountId) : accounts.length === 1 ? accounts[0] : undefined;
        if (!account) {
          await tx.update(publishingJobs, { id: job.id }, { status: job.encryptedProviderState ? "uncertain" : "blocked", errorMessage: job.encryptedProviderState ? "The connection for an in-progress operation is unavailable. Check the platform before creating a new post." : accounts.length > 1 ? "Multiple accounts match this brand/platform. Keep exactly one connected account before retrying." : "Connect your own platform credentials for this brand before retrying." });
          return { job, post: null, account: null };
        }
        await tx.update(publishingJobs, { id: job.id }, { status: "processing", attempts: job.encryptedProviderState ? job.attempts : job.attempts + 1, socialAccountId: account.id, startedAt: job.startedAt || new Date(), nextCheckAt: new Date(Date.now() + 60000), errorMessage: null });
        await tx.update(posts, { id: post.id }, { status: "publishing" });
        return { job, post, account };
      });
      if (!claim) break;
      processed++;
      const { job, post, account } = claim;
      if (!post || !account) { await updatePostResult(job.postId); continue; }
      let checkpointed = !!job.encryptedProviderState;
      let checkpointStage: string | undefined;
      try {
        if (!Object.hasOwn(SOCIAL_PLATFORM_SPECS, account.platform)) throw new SocialProviderError("Unsupported platform.");
        const [stored] = await db.find(socialCredentials, { socialAccountId: account.id, workspaceId: post.workspaceId });
        const decrypted = stored && decryptSecret(stored.encryptedCredentials);
        if (!decrypted) throw new SocialProviderError("Reconnect this account with valid customer-owned credentials.", 401);
        const credentials = customerCredentials.parse(JSON.parse(decrypted));
        const saved = job.encryptedProviderState ? decryptSecret(job.encryptedProviderState) : null;
        if (job.encryptedProviderState && !saved) throw new SocialProviderError("The saved publishing state cannot be decrypted. Check the platform before retrying.", 409, true);
        const state = saved ? providerState.parse(JSON.parse(saved)) : undefined;
        checkpointStage = state?.stage;
        const media = post.mediaIds.length ? await db.find(mediaAssets, { workspaceId: post.workspaceId, id: { $in: post.mediaIds } }) : [];
        if (media.length !== post.mediaIds.length) throw new SocialProviderError("An attached media asset is missing.");
        const orderedMedia = post.mediaIds.map(id => media.find(asset => asset.id === id)!);
        const result = await publishToCustomerAccount(account.platform as SocialPlatform, credentials, post, orderedMedia, async state => {
          await db.update(publishingJobs, { id: job.id, status: "processing" }, { encryptedProviderState: encryptSecret(JSON.stringify(state)), nextCheckAt: new Date(Date.now() + 60000) });
          checkpointed = true;
          checkpointStage = state.stage;
        }, state);
        await db.update(publishingJobs, { id: job.id, status: "processing" }, result.status === "completed"
          ? { status: "completed", externalPostId: result.id, executedAt: new Date(), encryptedProviderState: null, errorMessage: null }
          : { encryptedProviderState: encryptSecret(JSON.stringify(result.state)), nextCheckAt: new Date(Date.now() + 60000) });
        await updatePostResult(post.id);
      } catch (error) {
        const providerError = error instanceof SocialProviderError ? error : null;
        const publiclyProcessing = ["tiktok-upload", "youtube-upload", "youtube-processing"].includes(checkpointStage || "");
        const uncertain = providerError?.uncertain || (!providerError && checkpointed) || (publiclyProcessing && ![429, 502, 503, 504].includes(providerError?.status || 0));
        const retryable = !uncertain && providerError && [429, 502, 503, 504].includes(providerError.status) && job.attempts + 1 < job.maxAttempts;
        const message = providerError?.message || "Publishing failed. Check credentials, media, and server logs.";
        console.error("Social publishing failed", { jobId: job.id, platform: job.platform, status: providerError?.status || 500, uncertain });
        await db.transaction(async tx => {
          await tx.update(publishingJobs, { id: job.id }, { status: uncertain ? "uncertain" : retryable ? "retrying" : "failed", errorMessage: message, nextCheckAt: new Date(Date.now() + 60000 * 2 ** Math.min(job.attempts, 5)), ...(!uncertain && !retryable ? { encryptedProviderState: null } : {}) });
          if (providerError && [401, 403].includes(providerError.status)) await tx.update(socialAccounts, { id: account.id }, { status: "needs_review", lastError: message });
          if (!retryable && post.notifyOnPublish) await notifyWorkspace(tx, post.workspaceId, "publish_failed", uncertain ? "Publishing needs verification" : "Publishing failed", `"${post.title}": ${message}`, "/app/calendar");
        });
        await updatePostResult(post.id);
      }
    }
    return processed;
  }, 0);
}
