import { z } from "zod";
import type { MediaAssetsDocument, PostsDocument } from "@/db/schema";
import { readMedia } from "./media-storage";
import { publishingMediaUrl } from "./publishing-media";
import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "./social-adapters";
import { workerFetch as fetch } from "./worker-network";
import { managedSocialConfiguration } from "./social-managed-config";

const identifier = z.string().regex(/^[A-Za-z0-9:_-]{1,250}$/);
export const customerCredentials = z.object({
  accessToken: z.string().trim().min(10).max(10000).regex(/^[^\s]+$/),
  accountId: identifier.optional(),
  boardId: identifier.optional(),
  apiVersion: z.string().regex(/^(20\d{4}|v\d{1,3}\.0)$/).optional(),
  privacyLevel: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY", "public", "unlisted", "private"]).optional(),
  madeForKids: z.boolean().optional(),
  aiGenerated: z.boolean().optional(),
  expiresAt: z.iso.datetime().optional(),
  clientId: z.string().trim().min(1).max(1000).optional(),
  clientSecret: z.string().min(1).max(10000).optional(),
  refreshToken: z.string().min(1).max(10000).optional(),
  refreshExpiresAt: z.iso.datetime().optional(),
  tokenKind: z.enum(["oauth", "manual", "long_lived"]).optional(),
  analyticsEnabled: z.boolean().optional(),
  oauthMode: z.enum(["managed", "advanced"]).optional(),
  grantedScopes: z.array(z.string().min(1).max(200)).max(100).optional(),
}).strict();
export type CustomerCredentials = z.infer<typeof customerCredentials>;
export const providerState = z.object({
  stage: z.enum(["sending", "container", "x-media", "linkedin-video", "tiktok-upload", "youtube-upload", "youtube-processing"]),
  id: z.string().optional(),
  uploadUrl: z.string().url().optional(),
  size: z.number().int().positive().optional(),
  createdAt: z.number(),
});
export type ProviderState = z.infer<typeof providerState>;
export type ProviderResult = { status: "completed"; id: string } | { status: "processing"; state: ProviderState };
type Checkpoint = (state: ProviderState) => Promise<void>;
const idResponse = z.object({ id: z.string().min(1) });
const graphVersion = (credentials: CustomerCredentials) => {
  const version = credentials.apiVersion || "v27.0";
  if (!/^v\d{1,3}\.0$/.test(version)) throw new SocialProviderError("Enter a valid Graph API version.");
  return version;
};
const linkedInHeaders = (credentials: CustomerCredentials) => {
  const version = credentials.apiVersion;
  if (!version || !/^20\d{4}$/.test(version)) throw new SocialProviderError("Set the LinkedIn API version supported by your app (YYYYMM).");
  return { "Linkedin-Version": version, "X-Restli-Protocol-Version": "2.0.0" };
};
export class SocialProviderError extends Error {
  constructor(message: string, public status = 400, public uncertain = false) { super(message); }
}

async function request(url: string, credentials: CustomerCredentials, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${credentials.accessToken}`, ...init.headers }, redirect: "error", signal: AbortSignal.timeout(120000) });
  } catch {
    throw new SocialProviderError("Provider request was interrupted. Verify the account before retrying.", 503, !!init.method && init.method !== "GET");
  }
  if (!response.ok) throw new SocialProviderError(`Provider returned HTTP ${response.status}. Check account permissions, token expiry, API access, and media requirements.`, response.status, response.status >= 500 && !!init.method && init.method !== "GET");
  return response;
}
async function json<T>(url: string, credentials: CustomerCredentials, schema: z.ZodType<T>, body?: object, headers?: Record<string, string>) {
  const response = await request(url, credentials, { ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), headers: { "Content-Type": "application/json", ...headers } });
  try { return schema.parse(await response.json()); }
  catch { throw new SocialProviderError("Provider returned an unexpected response. Check the provider before retrying.", 502, !!body); }
}
async function tiktok<T>(path: string, credentials: CustomerCredentials, schema: z.ZodType<T>, body: object = {}) {
  const result = await json(`https://open.tiktokapis.com/v2/${path}/`, credentials, z.object({ error: z.object({ code: z.string() }), data: z.unknown().optional() }), body);
  if (result.error.code !== "ok") throw new SocialProviderError(`TikTok rejected the request (${/^[a-z_]+$/.test(result.error.code) ? result.error.code : "provider_error"}).`);
  try { return schema.parse(result.data); }
  catch { throw new SocialProviderError("TikTok returned an unexpected response.", 502, true); }
}
function target(credentials: CustomerCredentials) {
  if (!credentials.accountId) throw new SocialProviderError("A verified provider account is required.");
  return encodeURIComponent(credentials.accountId);
}
function uploadTarget(url: string, hosts: string[]) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !hosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) throw new SocialProviderError("Provider returned an untrusted upload destination.", 502);
  return parsed.toString();
}
async function upload(url: string, bytes: Uint8Array, mime: string, hosts: string[], headers: Record<string, string> = {}) {
  try {
    const response = await fetch(uploadTarget(url, hosts), { method: "PUT", headers: { "Content-Type": mime, ...headers }, body: new Uint8Array(bytes), redirect: "error", signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new SocialProviderError(`Provider upload returned HTTP ${response.status}.`, response.status);
    return response;
  } catch (error) {
    if (error instanceof SocialProviderError) throw error;
    throw new SocialProviderError("Provider media upload was interrupted.", 503, true);
  }
}

export async function verifyCustomerConnection(platform: SocialPlatform, input: CustomerCredentials) {
  const credentials = customerCredentials.parse(input);
  if (credentials.expiresAt && new Date(credentials.expiresAt).getTime() <= Date.now()) throw new SocialProviderError("The access token has expired.");
  let identity: { id: string; name: string; handle: string };
  switch (platform) {
    case "linkedin": {
      linkedInHeaders(credentials);
      const me = await json("https://api.linkedin.com/v2/userinfo", credentials, z.object({ sub: z.string(), name: z.string() }));
      const member = `urn:li:person:${me.sub}`;
      if (credentials.accountId && credentials.accountId !== member) {
        if (!/^urn:li:organization:\d+$/.test(credentials.accountId)) throw new SocialProviderError("The LinkedIn author does not match your token.");
        let allowed = false;
        const managed = credentials.oauthMode === "managed";
        for (let page = 0; page < (managed ? 5 : 1); page++) {
          const roleUrl = `https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED${managed ? `&count=100&start=${page * 100}` : ""}`;
          const roles = await json(roleUrl, credentials, z.object({ elements: z.array(z.object({
            organization: z.string().optional(), organizationTarget: z.string().optional(), roleAssignee: z.string().optional(),
            role: z.string(), state: z.string().optional(),
          })), paging: z.object({ links: z.array(z.object({ rel: z.string() })).optional() }).optional() }), undefined, linkedInHeaders(credentials));
          allowed = roles.elements.some(role => (role.organizationTarget || role.organization) === credentials.accountId &&
            (managed ? role.state === "APPROVED" && role.roleAssignee === member : !role.state || role.state === "APPROVED") &&
            (managed ? ["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"] : ["ADMINISTRATOR", "CONTENT_ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER"]).includes(role.role));
          if (allowed || roles.elements.length < 100 && !roles.paging?.links?.some(link => link.rel === "next")) break;
        }
        if (!allowed) throw new SocialProviderError("Your token cannot publish for that LinkedIn organization.", 403);
      }
      identity = { id: credentials.accountId || member, name: me.name, handle: credentials.accountId || member };
      break;
    }
    case "x": {
      const { data } = await json("https://api.x.com/2/users/me", credentials, z.object({ data: z.object({ id: z.string(), name: z.string(), username: z.string() }) }));
      identity = { id: data.id, name: data.name, handle: `@${data.username}` };
      break;
    }
    case "facebook": {
      const me = await json(`https://graph.facebook.com/${graphVersion(credentials)}/me?fields=id,name,category`, credentials, z.object({ id: z.string(), name: z.string(), category: z.string() }));
      identity = { id: me.id, name: me.name, handle: me.id };
      break;
    }
    case "instagram": {
      const identityResponse = z.object({ user_id: z.union([z.string(), z.number().int().safe()]).transform(String), username: z.string() });
      const me = await json(`https://graph.instagram.com/${graphVersion(credentials)}/me?fields=user_id,username`, credentials, z.union([identityResponse, z.object({ data: z.array(identityResponse).length(1) }).transform(result => result.data[0])]));
      identity = { id: me.user_id, name: me.username, handle: `@${me.username}` };
      break;
    }
    case "threads": {
      const me = await json("https://graph.threads.com/v1.0/me?fields=id,username", credentials, z.object({ id: z.string(), username: z.string() }));
      identity = { id: me.id, name: me.username, handle: `@${me.username}` };
      break;
    }
    case "pinterest": {
      if (!credentials.boardId) throw new SocialProviderError("Enter the destination Pinterest board ID.");
      const me = await json("https://api.pinterest.com/v5/user_account", credentials, z.object({ username: z.string() }));
      const board = await json(`https://api.pinterest.com/v5/boards/${encodeURIComponent(credentials.boardId)}`, credentials, idResponse);
      if (board.id !== credentials.boardId) throw new SocialProviderError("The Pinterest board does not match the authorized destination.", 403);
      identity = { id: me.username, name: me.username, handle: credentials.oauthMode === "managed" ? `${me.username}:${credentials.boardId}` : me.username };
      break;
    }
    case "youtube": {
      if (!["public", "unlisted", "private"].includes(credentials.privacyLevel || "")) throw new SocialProviderError("Choose the YouTube upload visibility.");
      if (typeof credentials.madeForKids !== "boolean") throw new SocialProviderError("Declare whether videos for this connection are made for kids.");
      const me = await json("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", credentials, z.object({ items: z.array(z.object({ id: z.string(), snippet: z.object({ title: z.string() }) })).min(1) }));
      const channel = credentials.accountId ? me.items.find(channel => channel.id === credentials.accountId) : me.items[0];
      if (!channel) throw new SocialProviderError("The YouTube channel does not match your token.", 403);
      identity = { id: channel.id, name: channel.snippet.title, handle: channel.id };
      break;
    }
    case "tiktok": {
      if (typeof credentials.aiGenerated !== "boolean") throw new SocialProviderError("Declare whether your uploaded TikTok videos contain AI-generated media.");
      const me = await json("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", credentials, z.object({ data: z.object({ user: z.object({ open_id: z.string(), display_name: z.string() }) }), error: z.object({ code: z.literal("ok") }) }));
      const creator = await tiktok("post/publish/creator_info/query", credentials, z.object({ privacy_level_options: z.array(z.string()), creator_username: z.string() }));
      if (!credentials.privacyLevel || !creator.privacy_level_options.includes(credentials.privacyLevel)) throw new SocialProviderError(`Choose an allowed TikTok privacy setting: ${creator.privacy_level_options.join(", ")}.`);
      identity = { id: me.data.user.open_id, name: me.data.user.display_name, handle: creator.creator_username };
      break;
    }
  }
  if (credentials.accountId && credentials.accountId !== identity.id) throw new SocialProviderError("The provider account does not match the supplied token.", 403);
  return { ...identity, credentials: { ...credentials, accountId: identity.id } };
}

function textFor(post: PostsDocument, platform: SocialPlatform) {
  const variant = post.variants[platform];
  const text = variant ? [variant.content, ...variant.hashtags.filter(tag => !variant.content.includes(tag))].join("\n") : post.baseContent;
  if (!text.trim() || Array.from(text).length > SOCIAL_PLATFORM_SPECS[platform].maxChars) throw new SocialProviderError(`The ${SOCIAL_PLATFORM_SPECS[platform].name} text is empty or exceeds its character limit.`);
  return text;
}
async function mediaBytes(asset: MediaAssetsDocument) {
  if (asset.generationStatus !== "ready" || !asset.storageKey || !asset.mimeType) throw new SocialProviderError("Only completed, stored media may be published.");
  return readMedia(asset);
}
const processing = (state: ProviderState): ProviderResult => ({ status: "processing", state });
const completed = (id: string): ProviderResult => ({ status: "completed", id });

async function sendX(text: string, mediaIds: string[], credentials: CustomerCredentials, checkpoint: Checkpoint) {
  await checkpoint({ stage: "sending", createdAt: Date.now() });
  const result = await json("https://api.x.com/2/tweets", credentials, z.object({ data: idResponse }), { text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) });
  return completed(result.data.id);
}
async function sendLinkedIn(post: PostsDocument, text: string, credentials: CustomerCredentials, checkpoint: Checkpoint, mediaId?: string) {
  await checkpoint({ stage: "sending", createdAt: Date.now() });
  const response = await request("https://api.linkedin.com/rest/posts", credentials, { method: "POST", headers: { ...linkedInHeaders(credentials), "Content-Type": "application/json" }, body: JSON.stringify({ author: credentials.accountId, commentary: text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...(mediaId ? { content: { media: { id: mediaId, title: post.title } } } : {}) }) });
  const id = response.headers.get("x-restli-id");
  if (!id) throw new SocialProviderError("LinkedIn accepted the request without a post reference. Verify the account before retrying.", 502, true);
  return completed(id);
}

export async function publishToCustomerAccount(platform: SocialPlatform, credentials: CustomerCredentials, post: PostsDocument, media: MediaAssetsDocument[], checkpoint: Checkpoint, savedState?: ProviderState): Promise<ProviderResult> {
  if (credentials.expiresAt && new Date(credentials.expiresAt).getTime() <= Date.now()) throw new SocialProviderError("Reconnect this account: its access token has expired.", 401);
  if (credentials.oauthMode === "managed" && !savedState) {
    const config = managedSocialConfiguration();
    if (platform === "tiktok" && credentials.privacyLevel !== "SELF_ONLY" && !config.publicPosting.includes("tiktok")) throw new SocialProviderError("TikTok public posting requires provider audit approval.", 403);
    if (platform === "youtube" && credentials.privacyLevel !== "private" && !config.publicPosting.includes("youtube")) throw new SocialProviderError("YouTube non-private posting requires provider audit approval.", 403);
    if (platform === "linkedin" && credentials.accountId?.startsWith("urn:li:organization:") && !config.linkedinOrganizations) throw new SocialProviderError("LinkedIn organization publishing requires Community Management approval.", 403);
  }
  const text = textFor(post, platform);
  if (savedState) return resume(platform, credentials, post, text, checkpoint, savedState);
  if (media.some(asset => asset.workspaceId !== post.workspaceId)) throw new SocialProviderError("Media does not belong to this workspace.", 403);
  const asset = media[0];
  if (platform !== "x" && media.length > 1) throw new SocialProviderError("This adapter currently accepts one attachment per post. Create separate posts for additional media.");
  if (platform === "x") {
    if (media.length > 4 || (media.length > 1 && media.some(asset => asset.assetType !== "image"))) throw new SocialProviderError("X supports up to four images or one video/GIF.");
    const ids: string[] = [];
    for (const item of media) {
      const bytes = await mediaBytes(item);
      if (item.assetType === "video") {
        const session = await json("https://api.x.com/2/media/upload/initialize", credentials, z.object({ data: idResponse }), { media_type: item.mimeType, total_bytes: bytes.length, media_category: "tweet_video" });
        for (let offset = 0, index = 0; offset < bytes.length; offset += 4 * 1024 * 1024, index++) {
          const form = new FormData();
          form.set("segment_index", String(index));
          form.set("media", new Blob([new Uint8Array(bytes.subarray(offset, offset + 4 * 1024 * 1024))], { type: item.mimeType! }), "video.mp4");
          await request(`https://api.x.com/2/media/upload/${session.data.id}/append`, credentials, { method: "POST", body: form });
        }
        await json(`https://api.x.com/2/media/upload/${session.data.id}/finalize`, credentials, z.object({ data: z.unknown() }), {});
        const state: ProviderState = { stage: "x-media", id: session.data.id, createdAt: Date.now() };
        await checkpoint(state);
        return processing(state);
      }
      if (bytes.length > 5 * 1024 * 1024) throw new SocialProviderError("X images/GIFs must be no larger than 5 MB.");
      const result = await json("https://api.x.com/2/media/upload", credentials, z.object({ data: idResponse }), { media: bytes.toString("base64"), media_type: item.mimeType, media_category: item.assetType === "gif" ? "tweet_gif" : "tweet_image" });
      ids.push(result.data.id);
    }
    return sendX(text, ids, credentials, checkpoint);
  }
  if (platform === "linkedin") {
    if (!asset) return sendLinkedIn(post, text, credentials, checkpoint);
    const bytes = await mediaBytes(asset);
    if (asset.assetType === "video") {
      if (asset.mimeType !== "video/mp4") throw new SocialProviderError("LinkedIn videos must be MP4.");
      const initialized = await json("https://api.linkedin.com/rest/videos?action=initializeUpload", credentials, z.object({ value: z.object({ video: z.string(), uploadToken: z.string(), uploadInstructions: z.array(z.object({ firstByte: z.number(), lastByte: z.number(), uploadUrl: z.string() })) }) }), { initializeUploadRequest: { owner: credentials.accountId, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } }, linkedInHeaders(credentials));
      const partIds: string[] = [];
      for (const part of initialized.value.uploadInstructions) {
        const response = await upload(part.uploadUrl, bytes.subarray(part.firstByte, part.lastByte + 1), asset.mimeType, ["linkedin.com", "licdn.com"], { Authorization: `Bearer ${credentials.accessToken}` });
        const etag = response.headers.get("etag");
        if (!etag) throw new SocialProviderError("LinkedIn did not confirm the uploaded video part.");
        partIds.push(etag);
      }
      await request("https://api.linkedin.com/rest/videos?action=finalizeUpload", credentials, { method: "POST", headers: { ...linkedInHeaders(credentials), "Content-Type": "application/json" }, body: JSON.stringify({ finalizeUploadRequest: { video: initialized.value.video, uploadToken: initialized.value.uploadToken, uploadedPartIds: partIds } }) });
      const state: ProviderState = { stage: "linkedin-video", id: initialized.value.video, createdAt: Date.now() };
      await checkpoint(state);
      return processing(state);
    }
    const initialized = await json("https://api.linkedin.com/rest/images?action=initializeUpload", credentials, z.object({ value: z.object({ image: z.string(), uploadUrl: z.string() }) }), { initializeUploadRequest: { owner: credentials.accountId } }, linkedInHeaders(credentials));
    await upload(initialized.value.uploadUrl, bytes, asset.mimeType!, ["linkedin.com", "licdn.com"], { Authorization: `Bearer ${credentials.accessToken}` });
    return sendLinkedIn(post, text, credentials, checkpoint, initialized.value.image);
  }
  if (platform === "facebook") {
    if (asset && asset.assetType !== "image") throw new SocialProviderError("Facebook publishing currently supports text and a single image. Use an image or publish this video directly on Facebook.");
    const body = asset ? { url: publishingMediaUrl(asset.id), caption: text, published: true } : { message: text, published: true };
    await checkpoint({ stage: "sending", createdAt: Date.now() });
    const result = await json(`https://graph.facebook.com/${graphVersion(credentials)}/${target(credentials)}/${asset ? "photos" : "feed"}`, credentials, z.object({ id: z.string(), post_id: z.string().optional() }), body);
    return completed(result.post_id || result.id);
  }
  if (platform === "instagram" || platform === "threads") {
    if (platform === "instagram" && !asset) throw new SocialProviderError("Instagram requires an image or video.");
    if (asset?.assetType === "gif") throw new SocialProviderError("Convert the GIF to MP4 before publishing to Instagram or Threads.");
    const base = platform === "instagram" ? `https://graph.instagram.com/${graphVersion(credentials)}` : "https://graph.threads.com/v1.0";
    const content = asset ? { [asset.assetType === "video" ? "video_url" : "image_url"]: publishingMediaUrl(asset.id, platform === "instagram" && asset.assetType === "image" ? "jpeg" : "original") } : {};
    const result = await json(`${base}/${target(credentials)}/${platform === "instagram" ? "media" : "threads"}`, credentials, idResponse, platform === "instagram" ? { ...content, caption: text, ...(asset.assetType === "video" ? { media_type: "REELS" } : {}) } : { ...content, text, media_type: asset ? asset.assetType === "video" ? "VIDEO" : "IMAGE" : "TEXT" });
    const state: ProviderState = { stage: "container", id: result.id, createdAt: Date.now() };
    await checkpoint(state);
    return processing(state);
  }
  if (platform === "pinterest") {
    if (!asset || asset.assetType !== "image" || !credentials.boardId) throw new SocialProviderError("Pinterest requires an image and a destination board.");
    await checkpoint({ stage: "sending", createdAt: Date.now() });
    const result = await json("https://api.pinterest.com/v5/pins", credentials, idResponse, { board_id: credentials.boardId, title: post.title.slice(0, 100), description: text, alt_text: asset.altText, media_source: { source_type: "image_url", url: publishingMediaUrl(asset.id) } });
    return completed(result.id);
  }
  if (!asset || asset.assetType !== "video" || asset.mimeType !== "video/mp4") throw new SocialProviderError(`${SOCIAL_PLATFORM_SPECS[platform].name} requires an MP4 video.`);
  const bytes = await mediaBytes(asset);
  if (platform === "youtube") {
    if (!["public", "unlisted", "private"].includes(credentials.privacyLevel || "")) throw new SocialProviderError("Choose your YouTube upload visibility.");
    if (typeof credentials.madeForKids !== "boolean") throw new SocialProviderError("Reconnect YouTube with an explicit made-for-kids declaration.");
    const initialized = await request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", credentials, { method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Length": String(bytes.length), "X-Upload-Content-Type": asset.mimeType }, body: JSON.stringify({ snippet: { title: post.title.slice(0, 100), description: text }, status: { privacyStatus: credentials.privacyLevel, selfDeclaredMadeForKids: credentials.madeForKids } }) });
    const url = initialized.headers.get("location");
    if (!url) throw new SocialProviderError("YouTube did not return an upload session.", 502, true);
    const state: ProviderState = { stage: "youtube-upload", uploadUrl: uploadTarget(url, ["googleapis.com"]), size: bytes.length, createdAt: Date.now() };
    await checkpoint(state);
    const uploaded = await upload(url, bytes, asset.mimeType, ["googleapis.com"], { Authorization: `Bearer ${credentials.accessToken}` });
    const result = idResponse.parse(await uploaded.json());
    const next: ProviderState = { stage: "youtube-processing", id: result.id, createdAt: state.createdAt };
    await checkpoint(next);
    return processing(next);
  }
  if (typeof credentials.aiGenerated !== "boolean") throw new SocialProviderError("Reconnect TikTok with an explicit AI-generated-media declaration.");
  const creator = await tiktok("post/publish/creator_info/query", credentials, z.object({ privacy_level_options: z.array(z.string()), comment_disabled: z.boolean(), duet_disabled: z.boolean(), stitch_disabled: z.boolean() }));
  if (!creator.privacy_level_options.includes(credentials.privacyLevel || "")) throw new SocialProviderError("Reconnect TikTok and choose an allowed privacy level.");
  const initialized = await tiktok("post/publish/video/init", credentials, z.object({ publish_id: z.string(), upload_url: z.string() }), { post_info: { title: text, privacy_level: credentials.privacyLevel, disable_comment: creator.comment_disabled, disable_duet: creator.duet_disabled, disable_stitch: creator.stitch_disabled, is_aigc: !!asset.generationStartedAt || credentials.aiGenerated }, source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 } });
  const state: ProviderState = { stage: "tiktok-upload", id: initialized.publish_id, createdAt: Date.now() };
  await checkpoint(state);
  await upload(initialized.upload_url, bytes, asset.mimeType, ["tiktokapis.com"], { "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}` });
  return processing(state);
}

async function resume(platform: SocialPlatform, credentials: CustomerCredentials, post: PostsDocument, text: string, checkpoint: Checkpoint, state: ProviderState): Promise<ProviderResult> {
  if (state.stage === "sending") throw new SocialProviderError("A previous publishing request may have been accepted. Check the platform before creating a new post.", 409, true);
  if (Date.now() - state.createdAt > 24 * 3600000) throw new SocialProviderError("Provider processing exceeded 24 hours. Verify the account before retrying.", 409, true);
  if (platform === "x" && state.stage === "x-media" && state.id) {
    const result = await json(`https://api.x.com/2/media/upload?command=STATUS&media_id=${encodeURIComponent(state.id)}`, credentials, z.object({ data: z.object({ processing_info: z.object({ state: z.string() }).optional() }) }));
    if (result.data.processing_info?.state === "failed") throw new SocialProviderError("X rejected the uploaded media.");
    if (result.data.processing_info && result.data.processing_info.state !== "succeeded") return processing(state);
    return sendX(text, [state.id], credentials, checkpoint);
  }
  if (platform === "linkedin" && state.stage === "linkedin-video" && state.id) {
    const result = await json(`https://api.linkedin.com/rest/videos/${encodeURIComponent(state.id)}`, credentials, z.object({ status: z.string() }), undefined, linkedInHeaders(credentials));
    if (result.status === "PROCESSING_FAILED") throw new SocialProviderError("LinkedIn could not process the uploaded video.");
    return result.status === "AVAILABLE" ? sendLinkedIn(post, text, credentials, checkpoint, state.id) : processing(state);
  }
  if ((platform === "instagram" || platform === "threads") && state.stage === "container" && state.id) {
    const base = platform === "instagram" ? `https://graph.instagram.com/${graphVersion(credentials)}` : "https://graph.threads.com/v1.0";
    const result = await json(`${base}/${encodeURIComponent(state.id)}?fields=${platform === "instagram" ? "status_code" : "status"}`, credentials, z.object({ status_code: z.string().optional(), status: z.string().optional() }));
    const status = result.status_code || result.status;
    if (status === "ERROR" || status === "EXPIRED") throw new SocialProviderError("The platform rejected or expired the media container.");
    if (status === "PUBLISHED") throw new SocialProviderError("The container is already published. Check the platform for its final post reference.", 409, true);
    if (status !== "FINISHED") return processing(state);
    await checkpoint({ stage: "sending", id: state.id, createdAt: state.createdAt });
    const published = await json(`${base}/${target(credentials)}/${platform === "instagram" ? "media_publish" : "threads_publish"}`, credentials, idResponse, { creation_id: state.id });
    return completed(published.id);
  }
  if (platform === "tiktok" && state.stage === "tiktok-upload" && state.id) {
    const result = await tiktok("post/publish/status/fetch", credentials, z.object({ status: z.string(), publicaly_available_post_id: z.array(z.string()).optional() }), { publish_id: state.id });
    if (result.status === "FAILED") throw new SocialProviderError("TikTok rejected the uploaded post.");
    return result.status === "PUBLISH_COMPLETE" ? completed(result.publicaly_available_post_id?.[0] || state.id) : processing(state);
  }
  if (platform === "youtube" && state.stage === "youtube-upload" && state.uploadUrl && state.size) {
    let response: Response;
    try { response = await fetch(uploadTarget(state.uploadUrl, ["googleapis.com"]), { method: "PUT", headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Range": `bytes */${state.size}`, "Content-Length": "0" }, redirect: "error", signal: AbortSignal.timeout(30000) }); }
    catch { throw new SocialProviderError("YouTube upload status is temporarily unavailable.", 503); }
    if (response.status === 308) throw new SocialProviderError("YouTube upload was interrupted before completion. Check the channel before rescheduling.", 409, true);
    if (!response.ok) throw new SocialProviderError(`YouTube upload status returned HTTP ${response.status}.`, response.status, true);
    const result = idResponse.parse(await response.json());
    const next: ProviderState = { stage: "youtube-processing", id: result.id, createdAt: state.createdAt };
    await checkpoint(next);
    return processing(next);
  }
  if (platform === "youtube" && state.stage === "youtube-processing" && state.id) {
    const result = await json(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(state.id)}`, credentials, z.object({ items: z.array(z.object({ id: z.string(), status: z.object({ uploadStatus: z.string(), privacyStatus: z.string() }), processingDetails: z.object({ processingStatus: z.string() }).optional() })).min(1) }));
    const video = result.items[0];
    if (["failed", "rejected", "deleted"].includes(video.status.uploadStatus)) throw new SocialProviderError("YouTube rejected the uploaded video.");
    if (video.status.uploadStatus === "processed") {
      if (video.status.privacyStatus !== credentials.privacyLevel) throw new SocialProviderError("YouTube visibility differs from your selection. The app may require a provider audit; check the channel.", 409, true);
      return completed(video.id);
    }
    return processing(state);
  }
  throw new SocialProviderError("The stored publishing operation cannot be resumed automatically.", 409, true);
}
