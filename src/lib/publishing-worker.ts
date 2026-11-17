import { db } from "@/db";
import { posts, publishingJobs, socialAccounts, socialCredentials, mediaAssets, workspaces } from "@/db/schema";
import { increment } from "@/db/filters";
import { isPublishable, WorkflowError } from "./post-policy";
import { queueWorkspaceNotification } from "./notification-service";
import { encryptSecret, decryptSecret } from "./crypto";
import { customerCredentials, providerState, publishToCustomerAccount, SocialProviderError, type ProviderState } from "./social-provider";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "./social-adapters";
import { assertPublishingEntitlement, consumePublishingReservation, releasePublishingReservation } from "./entitlements";
import { hasTime, type WorkerOptions } from "./worker-budget";
import { withWorkerDeadline } from "./worker-network";

async function updatePostResult(postId: number) {
  await db.transaction(async tx => {
    const [post] = await tx.find(posts, { id: postId }, { lock: true });
    if (!post || !isPublishable(post)) return;
    const jobs = await tx.find(publishingJobs, { postId, status: { $ne: "cancelled" } });
    if (jobs.length && jobs.every(job => job.status === "completed")) {
      await tx.update(posts, { id: postId }, { status: "published", publishedAt: new Date(), updatedAt: new Date() });
      await consumePublishingReservation(post.workspaceId, post.id, tx);
      await tx.update(workspaces, { id: post.workspaceId }, { postsPublishedThisMonth: increment(1) });
      if (post.notifyOnPublish) await queueWorkspaceNotification(tx, `published:${post.id}`, post.workspaceId, "publish_success", "Post published", `"${post.title}" was confirmed by every selected platform.`, "/app/calendar");
    } else if (jobs.some(job => ["processing", "queued", "retrying", "completed", "uncertain"].includes(job.status))) {
      await tx.update(posts, { id: postId }, { status: "publishing", updatedAt: new Date() });
    } else {
      await tx.update(posts, { id: postId }, { status: post.deliveryMode === "immediate" ? "failed" : "scheduled", updatedAt: new Date() });
      await releasePublishingReservation(post.workspaceId, post.id, tx);
    }
  });
}

export async function processDuePosts(workspaceId?: number, { deadline = Date.now() + 20000, limit = 5 }: WorkerOptions = {}) {
  return db.withLease("social-publishing", async () => {
    const scope = workspaceId ? { workspaceId } : {};
    const finalizing = await db.find(posts, { ...scope, status: "publishing", deliveryMode: { $ne: "immediate" } }, { projection: { id: 1 }, limit: 10, sort: { updatedAt: 1 } });
    for (const post of finalizing) {
      if (!hasTime(deadline)) break;
      await updatePostResult(post.id);
    }
    const interrupted = await db.find(publishingJobs, { ...scope, deliveryMode: { $ne: "immediate" }, status: "processing", encryptedProviderState: null, startedAt: { $lte: new Date(Date.now() - 120000) } }, { limit: 20 });
    for (const job of interrupted) {
      await db.update(publishingJobs, { id: job.id, status: "processing" }, { status: "uncertain", errorMessage: "Worker stopped during a provider request. Check the platform before rescheduling." });
      await updatePostResult(job.postId);
    }
    return processPublishingJobs({ ...scope, deliveryMode: { $ne: "immediate" } }, deadline, limit, false);
  }, 0);
}

export async function processImmediatePost(workspaceId: number, postId: number, jobId?: number) {
  const scope = { workspaceId, postId, deliveryMode: "immediate", ...(jobId ? { id: jobId } : {}) };
  const interrupted = await db.find(publishingJobs, { ...scope, status: "processing", encryptedProviderState: null, startedAt: { $lte: new Date(Date.now() - 120000) } });
  for (const job of interrupted) {
    await db.update(publishingJobs, { id: job.id, status: "processing", encryptedProviderState: null, startedAt: job.startedAt }, { status: "uncertain", errorMessage: "Publishing was interrupted. Check the platform before creating a new post." });
  }
  const processed = await processPublishingJobs(scope, Date.now() + 25000, jobId ? 1 : 8, true);
  await updatePostResult(postId);
  return processed;
}

async function processPublishingJobs(scope: object, deadline: number, limit: number, immediate: boolean) {
    let processed = 0;
    for (let i = 0; i < limit && hasTime(deadline, 2000); i++) {
      const claim = await db.transaction(async tx => {
        const [job] = await tx.find(publishingJobs, { ...scope, $or: [{ status: { $in: ["queued", "retrying"] }, scheduledFor: { $lte: new Date() }, $or: [{ nextCheckAt: null }, { nextCheckAt: { $lte: new Date() } }] }, { status: "processing", encryptedProviderState: { $type: "string" }, nextCheckAt: { $lte: new Date() } }] }, { sort: { scheduledFor: 1 }, limit: 1, lock: true });
        if (!job) return null;
        const [post] = await tx.find(posts, { id: job.postId }, { lock: true });
        if (!post || !isPublishable(post) || !post.platforms.includes(job.platform) || post.scheduledAt?.getTime() !== job.scheduledFor.getTime()) {
          await tx.update(publishingJobs, { id: job.id }, { status: "cancelled", errorMessage: "Post is no longer eligible for publishing." });
          if (post) await releasePublishingReservation(post.workspaceId, post.id, tx);
          return { job, post: null, account: null };
        }
        const accounts = await tx.find(socialAccounts, { workspaceId: post.workspaceId, brandId: post.brandId, platform: job.platform, status: "connected" });
        const account = job.socialAccountId ? accounts.find(account => account.id === job.socialAccountId) : accounts.length === 1 ? accounts[0] : undefined;
        if (!account) {
          await tx.update(publishingJobs, { id: job.id }, { status: job.encryptedProviderState ? "uncertain" : "blocked", errorMessage: job.encryptedProviderState ? "The connection for an in-progress operation is unavailable. Check the platform before creating a new post." : accounts.length > 1 ? "Multiple accounts match this brand/platform. Keep exactly one connected account before retrying." : "Connect your own platform credentials for this brand before retrying." });
          return { job, post: null, account: null };
        }
        try {
          await assertPublishingEntitlement(post, tx);
        } catch (error) {
          if (!(error instanceof WorkflowError)) throw error;
          await tx.update(publishingJobs, { id: job.id }, { status: job.encryptedProviderState ? "uncertain" : "blocked", errorMessage: error.message });
          await releasePublishingReservation(post.workspaceId, post.id, tx);
          return { job, post: null, account: null };
        }
        const startedAt = new Date();
        await tx.update(publishingJobs, { id: job.id, status: job.status }, { status: "processing", attempts: job.encryptedProviderState ? job.attempts : job.attempts + 1, socialAccountId: account.id, startedAt, nextCheckAt: new Date(Date.now() + 60000), errorMessage: null });
        await tx.update(posts, { id: post.id }, { status: "publishing" });
        return { job: { ...job, startedAt }, post, account };
      });
      if (!claim) break;
      processed++;
      const { job, post, account } = claim;
      if (!post || !account) { await updatePostResult(job.postId); continue; }
      let checkpointed = !!job.encryptedProviderState;
      let attempted = false;
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
        attempted = true;
        const checkpoint = async (state: ProviderState) => {
          const [checkpoint] = await db.update(publishingJobs, { id: job.id, status: "processing", startedAt: job.startedAt }, { encryptedProviderState: encryptSecret(JSON.stringify(state)), nextCheckAt: new Date(Date.now() + 60000) });
          if (!checkpoint) throw new SocialProviderError("Publishing claim was lost. Verify the platform before retrying.", 409, true);
          checkpointed = true;
          checkpointStage = state.stage;
        };
        let result = await withWorkerDeadline(deadline - 500, () => publishToCustomerAccount(account.platform as SocialPlatform, credentials, post, orderedMedia, checkpoint, state));
        if (immediate && account.platform === "instagram" && !state && result.status === "processing" && result.state.stage === "container" && hasTime(deadline, 2000)) {
          const createdState = result.state;
          result = await withWorkerDeadline(deadline - 500, () => publishToCustomerAccount("instagram", credentials, post, orderedMedia, checkpoint, createdState));
        }
        await db.update(publishingJobs, { id: job.id, status: "processing", startedAt: job.startedAt }, result.status === "completed"
          ? { status: "completed", externalPostId: result.id, executedAt: new Date(), encryptedProviderState: null, errorMessage: null }
          : { encryptedProviderState: encryptSecret(JSON.stringify(result.state)), nextCheckAt: new Date(Date.now() + 60000) });
        await updatePostResult(post.id);
      } catch (error) {
        const providerError = error instanceof SocialProviderError ? error : null;
        const publiclyProcessing = ["tiktok-upload", "youtube-upload", "youtube-processing"].includes(checkpointStage || "");
        const uncertain = providerError?.uncertain || (!providerError && (checkpointed || attempted)) || (publiclyProcessing && ![429, 502, 503, 504].includes(providerError?.status || 0));
        const retryable = !immediate && !uncertain && providerError && [429, 502, 503, 504].includes(providerError.status) && job.attempts + 1 < job.maxAttempts;
        const manualPending = immediate && checkpointed && !uncertain && providerError && [429, 502, 503, 504].includes(providerError.status);
        const message = providerError?.message || "Publishing failed. Check credentials, media, and server logs.";
        console.error("Social publishing failed", { jobId: job.id, platform: job.platform, status: providerError?.status || 500, uncertain });
        await db.transaction(async tx => {
          const [changed] = await tx.update(publishingJobs, { id: job.id, status: "processing", startedAt: job.startedAt }, { status: uncertain ? "uncertain" : manualPending ? "processing" : retryable ? "retrying" : "failed", errorMessage: message, nextCheckAt: new Date(Date.now() + 60000 * 2 ** Math.min(job.attempts, 5)), ...(!uncertain && !retryable && !manualPending ? { encryptedProviderState: null } : {}) });
          if (!changed) return;
          if (!uncertain && !retryable && !manualPending) await releasePublishingReservation(post.workspaceId, post.id, tx);
          if (providerError && [401, 403].includes(providerError.status)) await tx.update(socialAccounts, { id: account.id }, { status: "needs_review", lastError: message });
          if (!retryable && !manualPending && post.notifyOnPublish) await queueWorkspaceNotification(tx, `publish-failed:${job.id}:${job.attempts}`, post.workspaceId, "publish_failed", uncertain ? "Publishing needs verification" : "Publishing failed", `"${post.title}": ${message}`, "/app/calendar");
        });
        await updatePostResult(post.id);
      }
    }
    return processed;
}
