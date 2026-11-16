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
    officialScopes: ["instagram_business_basic", "instagram_business_content_publish"],
    apiNotes: "Requires an Instagram Professional account and an Instagram Login user access token. JPEG images or MP4 reels.",
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
    officialScopes: ["pages_manage_posts", "pages_read_engagement"],
    apiNotes: "Requires a Page access token with publishing permissions for the selected Page.",
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
    officialScopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
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
    officialScopes: ["threads_basic", "threads_content_publish"],
    apiNotes: "Uses Meta Threads Publishing API with two-step container creation.",
    rateLimitPerHour: 50,
  },
};

export type SocialPlatform = SocialPlatformSpec["id"];
