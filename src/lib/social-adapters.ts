export interface SocialPlatformSpec {
  id:
    | "linkedin"
    | "x"
    | "instagram"
    | "facebook"
    | "tiktok"
    | "pinterest"
    | "youtube"
    | "threads";
  name: string;
  shortLabel: string;
  accentColor: string;
  maxChars: number;
  supportedFormats: string[];
  aspectRatios: string[];
  oauthEnvVars: string[];
  officialScopes: string[];
  apiNotes: string;
  rateLimitPerHour: number;
}

export const SOCIAL_PLATFORM_SPECS: Record<SocialPlatformSpec["id"], SocialPlatformSpec> = {
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    shortLabel: "LI",
    accentColor: "#0A66C2",
    maxChars: 3000,
    supportedFormats: ["Thought Leadership Post", "Document Carousel", "Company Update"],
    aspectRatios: ["1:1", "4:5", "16:9"],
    oauthEnvVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    officialScopes: ["openid", "profile", "w_member_social", "w_organization_social"],
    apiNotes: "Requires LinkedIn Community Management API approval for Company Pages.",
    rateLimitPerHour: 100,
  },
  x: {
    id: "x",
    name: "X (Twitter)",
    shortLabel: "X",
    accentColor: "#E2E8F0",
    maxChars: 280,
    supportedFormats: ["Single Post", "Multi-Post Thread", "Poll"],
    aspectRatios: ["16:9", "1:1"],
    oauthEnvVars: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    officialScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    apiNotes: "X API v2 Basic/Pro tier required for automated post creation.",
    rateLimitPerHour: 50,
  },
  instagram: {
    id: "instagram",
    name: "Instagram Business",
    shortLabel: "IG",
    accentColor: "#E1306C",
    maxChars: 2200,
    supportedFormats: ["Feed Post", "Carousel", "Reels Caption"],
    aspectRatios: ["4:5", "1:1", "9:16"],
    oauthEnvVars: ["META_APP_ID", "META_APP_SECRET"],
    officialScopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    apiNotes: "Requires Instagram Professional account linked to a Facebook Page.",
    rateLimitPerHour: 25,
  },
  facebook: {
    id: "facebook",
    name: "Facebook Pages",
    shortLabel: "FB",
    accentColor: "#1877F2",
    maxChars: 5000,
    supportedFormats: ["Page Post", "Link Preview", "Album"],
    aspectRatios: ["16:9", "1:1", "4:5"],
    oauthEnvVars: ["META_APP_ID", "META_APP_SECRET"],
    officialScopes: ["pages_manage_posts", "pages_read_engagement"],
    apiNotes: "Publishes to managed Facebook Business Pages via Graph API v21.",
    rateLimitPerHour: 200,
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    shortLabel: "TT",
    accentColor: "#25F4EE",
    maxChars: 2200,
    supportedFormats: ["Short Video Script", "Photo Carousel"],
    aspectRatios: ["9:16"],
    oauthEnvVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    officialScopes: ["video.publish", "user.info.basic"],
    apiNotes: "Direct publishing requires TikTok Content Posting API audit approval.",
    rateLimitPerHour: 30,
  },
  pinterest: {
    id: "pinterest",
    name: "Pinterest",
    shortLabel: "PI",
    accentColor: "#E60023",
    maxChars: 500,
    supportedFormats: ["Standard Pin", "Idea Pin"],
    aspectRatios: ["2:3", "4:5"],
    oauthEnvVars: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
    officialScopes: ["boards:read", "pins:write"],
    apiNotes: "Requires destination board ID and vertical media asset.",
    rateLimitPerHour: 60,
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    shortLabel: "YT",
    accentColor: "#FF0000",
    maxChars: 5000,
    supportedFormats: ["YouTube Shorts Script", "Video Description & Tags"],
    aspectRatios: ["16:9", "9:16"],
    oauthEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    officialScopes: ["https://www.googleapis.com/auth/youtube.upload"],
    apiNotes: "YouTube Data API v3 quota units apply per upload operation.",
    rateLimitPerHour: 40,
  },
  threads: {
    id: "threads",
    name: "Threads",
    shortLabel: "TH",
    accentColor: "#A855F7",
    maxChars: 500,
    supportedFormats: ["Text Thread", "Image Post"],
    aspectRatios: ["4:5", "1:1"],
    oauthEnvVars: ["META_APP_ID", "META_APP_SECRET"],
    officialScopes: ["threads_basic", "threads_content_publish"],
    apiNotes: "Uses Meta Threads Publishing API with two-step container creation.",
    rateLimitPerHour: 50,
  },
};

export function checkPlatformLiveReadiness(platformId: string): {
  isLiveConfigured: boolean;
  missingVars: string[];
  modeLabel: string;
} {
  const spec = SOCIAL_PLATFORM_SPECS[platformId as SocialPlatformSpec["id"]];
  if (!spec) {
    return {
      isLiveConfigured: false,
      missingVars: [],
      modeLabel: "Simulated Sandbox Adapter",
    };
  }
  const missingVars = spec.oauthEnvVars.filter((envKey) => !process.env[envKey]);
  const isLiveConfigured = missingVars.length === 0;
  return {
    isLiveConfigured,
    missingVars,
    modeLabel: isLiveConfigured ? "OAuth 2.0 Credentials Configured" : "Simulated Sandbox Adapter",
  };
}
