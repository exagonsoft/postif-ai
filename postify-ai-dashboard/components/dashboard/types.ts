export type Platform = "Instagram" | "LinkedIn" | "Facebook" | "Pinterest"  | "X" | "YouTube" | "TikTok" | "Snapchat" | "Reddit" | "Tumblr" | "WhatsApp" | "Telegram" | "Discord" | "Medium" | "Vimeo" | "Twitch" | "Spotify" | "Apple Podcasts" | "Google Podcasts";
export type PostStatus = "Published" | "Scheduled" | "Draft" | "Failed";

export type DashboardPost = {
  id: number | string;
  title: string;
  platforms: Platform[];
  scheduledFor: string;
  status: PostStatus;
  metrics?: {
    likes: number;
    reach: number;
  };
};

export type MediaAttachment = {
  originalName: string;
  path: string;
  mimeType: string;
  size: number;
};

export type ApiProfile = {
  _id: string;
  name: string;
};

export type ApiAccount = {
  _id: string;
  platform: string;
};

export type ApiPost = {
  _id: string;
  title?: string;
  contentText: string;
  scheduledFor?: string;
  status: string;
  destinations: {
    platform: string;
    metrics?: {
      likes?: number;
      reach?: number;
    };
  }[];
};
