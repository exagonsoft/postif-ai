import { SOCIAL_PLATFORM_SPECS, type SocialPlatform } from "./social-adapters";
import type { ManagedProviderAvailability } from "./social-managed-types";

function providerList(value: string | undefined, name: string): SocialPlatform[] {
  const entries = value?.trim() ? value.split(",").map(item => item.trim()) : [];
  if (new Set(entries).size !== entries.length || entries.some(item => !Object.hasOwn(SOCIAL_PLATFORM_SPECS, item))) {
    throw new Error(`${name} must contain unique supported provider identifiers.`);
  }
  return entries as SocialPlatform[];
}

export function managedSocialConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const enabled = providerList(env.SOCIAL_MANAGED_PROVIDERS, "SOCIAL_MANAGED_PROVIDERS");
  const approved = providerList(env.SOCIAL_OAUTH_APPROVED_PROVIDERS, "SOCIAL_OAUTH_APPROVED_PROVIDERS");
  const analytics = providerList(env.SOCIAL_OAUTH_ANALYTICS_PROVIDERS, "SOCIAL_OAUTH_ANALYTICS_PROVIDERS");
  const publicPosting = providerList(env.SOCIAL_OAUTH_PUBLIC_POSTING_PROVIDERS, "SOCIAL_OAUTH_PUBLIC_POSTING_PROVIDERS");
  const clients = {
    facebook: { clientId: env.FACEBOOK_OAUTH_CLIENT_ID, clientSecret: env.FACEBOOK_OAUTH_CLIENT_SECRET },
    instagram: { clientId: env.INSTAGRAM_OAUTH_CLIENT_ID, clientSecret: env.INSTAGRAM_OAUTH_CLIENT_SECRET },
    linkedin: { clientId: env.LINKEDIN_OAUTH_CLIENT_ID, clientSecret: env.LINKEDIN_OAUTH_CLIENT_SECRET },
    x: { clientId: env.X_OAUTH_CLIENT_ID, clientSecret: env.X_OAUTH_CLIENT_SECRET },
    tiktok: { clientId: env.TIKTOK_OAUTH_CLIENT_ID, clientSecret: env.TIKTOK_OAUTH_CLIENT_SECRET },
    pinterest: { clientId: env.PINTEREST_OAUTH_CLIENT_ID, clientSecret: env.PINTEREST_OAUTH_CLIENT_SECRET },
    youtube: { clientId: env.YOUTUBE_OAUTH_CLIENT_ID, clientSecret: env.YOUTUBE_OAUTH_CLIENT_SECRET },
    threads: { clientId: env.THREADS_OAUTH_CLIENT_ID, clientSecret: env.THREADS_OAUTH_CLIENT_SECRET },
  };
  return { enabled, approved, analytics, publicPosting, clients,
    facebookConfigId: env.FACEBOOK_OAUTH_CONFIG_ID?.trim() || undefined,
    instagramConfigId: env.INSTAGRAM_OAUTH_CONFIG_ID?.trim() || undefined,
    graphVersion: env.META_GRAPH_API_VERSION?.trim() || "v27.0",
    linkedinVersion: env.LINKEDIN_API_VERSION?.trim(),
    linkedinOrganizations: env.LINKEDIN_ORGANIZATIONS_ENABLED === "true",
  };
}

export function validateManagedSocialConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const config = managedSocialConfiguration(env);
  if (config.enabled.includes("facebook") && config.facebookConfigId && !/^\d{1,32}$/.test(config.facebookConfigId)) {
    throw new Error("FACEBOOK_OAUTH_CONFIG_ID must be a numeric Meta configuration ID.");
  }
  if (config.enabled.includes("instagram") && !/^\d{1,32}$/.test(config.instagramConfigId || "")) {
    throw new Error("INSTAGRAM_OAUTH_CONFIG_ID must be a numeric Meta Unified Login configuration ID.");
  }
  if (env.LINKEDIN_ORGANIZATIONS_ENABLED && !["true", "false"].includes(env.LINKEDIN_ORGANIZATIONS_ENABLED)) {
    throw new Error("LINKEDIN_ORGANIZATIONS_ENABLED must be true or false.");
  }
  if (config.publicPosting.some(platform => !["tiktok", "youtube"].includes(platform))) {
    throw new Error("SOCIAL_OAUTH_PUBLIC_POSTING_PROVIDERS supports only tiktok and youtube.");
  }
  for (const platform of config.enabled) {
    const client = config.clients[platform];
    if (!client.clientId?.trim() || !client.clientSecret?.trim()) throw new Error(`Configure the managed ${platform} OAuth client ID and secret before enabling it.`);
    if (/[\r\n\0]/.test(client.clientId + client.clientSecret) || client.clientId.length > 1000 || client.clientSecret.length > 10000) {
      throw new Error(`Invalid managed ${platform} OAuth credentials.`);
    }
    if (platform === "linkedin" && !/^20\d{4}$/.test(config.linkedinVersion || "")) throw new Error("LINKEDIN_API_VERSION must be YYYYMM when managed LinkedIn is enabled.");
    if (["facebook", "instagram"].includes(platform) && !/^v\d{1,3}\.0$/.test(config.graphVersion)) throw new Error("META_GRAPH_API_VERSION must be a Graph API version.");
    let url: URL;
    try { url = new URL(env.APP_URL || ""); } catch { throw new Error("Managed social OAuth requires a public HTTPS APP_URL."); }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !url.hostname.includes(".") || /(^localhost$|\.localhost$|\.local$|^\[|^\d+\.\d+\.\d+\.\d+$)/i.test(url.hostname)) {
      throw new Error("Managed social OAuth requires a public HTTPS APP_URL.");
    }
  }
}

export function managedSocialAvailability(env: NodeJS.ProcessEnv = process.env): ManagedProviderAvailability[] {
  const config = managedSocialConfiguration(env);
  return (Object.keys(SOCIAL_PLATFORM_SPECS) as SocialPlatform[]).map(platform => ({
    platform,
    status: !config.enabled.includes(platform) || !config.clients[platform].clientId?.trim() || !config.clients[platform].clientSecret?.trim() ||
      platform === "facebook" && !!config.facebookConfigId && !/^\d{1,32}$/.test(config.facebookConfigId)
      || platform === "instagram" && !/^\d{1,32}$/.test(config.instagramConfigId || "")
      ? "not_configured" : config.approved.includes(platform) ? "available"
        : ["facebook", "instagram"].includes(platform) && env.NODE_ENV === "development" ? "testing" : "approval_required",
    analyticsAvailable: config.analytics.includes(platform),
    organizationsAvailable: platform === "linkedin" && config.linkedinOrganizations,
    publicPostingAvailable: config.publicPosting.includes(platform),
    facebookBusinessLogin: platform === "facebook" && !!config.facebookConfigId,
  }));
}
