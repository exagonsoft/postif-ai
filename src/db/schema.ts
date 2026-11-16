import { defineCollection } from "./model";

export interface PlatformVariant {
  content: string;
  hashtags: string[];
  cta: string;
  formatLabel: string;
  characterCount: number;
}

export interface WeeklyPlanSlot {
  day: string;
  platform: string;
  pillar: string;
  concept: string;
  status: "planned" | "drafted" | "approved" | "scheduled";
}

export interface UsersDocument {
  id: number;
  email: string;
  name: string;
  passwordHash: string;
  systemRole: string;
  emailVerified: boolean;
  createdAt: Date;
}
export const users = defineCollection<UsersDocument>("users", {
  defaults: () => ({ systemRole: "user", emailVerified: true, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","email"],
  indexes: [],
  references: [],
  validator: {"bsonType":"object","required":["id","email","name","passwordHash","systemRole","emailVerified","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"email":{"bsonType":"string"},"name":{"bsonType":"string"},"passwordHash":{"bsonType":"string"},"systemRole":{"bsonType":"string"},"emailVerified":{"bsonType":"bool"},"createdAt":{"bsonType":"date"}}},
});

export interface SessionsDocument {
  id: number;
  userId: number;
  tokenHash: string;
  activeWorkspaceId: number | null;
  expiresAt: Date;
  createdAt: Date;
}
export const sessions = defineCollection<SessionsDocument>("sessions", {
  defaults: () => ({ activeWorkspaceId: null, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","tokenHash"],
  indexes: [{"userId":1}],
  references: [{"target":"users","field":"userId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","userId","tokenHash","activeWorkspaceId","expiresAt","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"userId":{"bsonType":["int","long","double"]},"tokenHash":{"bsonType":"string"},"activeWorkspaceId":{"bsonType":["int","long","double","null"]},"expiresAt":{"bsonType":"date"},"createdAt":{"bsonType":"date"}}},
});

export interface WorkspacesDocument {
  id: number;
  name: string;
  slug: string;
  ownerId: number;
  planSlug: string;
  billingCycle: string;
  aiBillingMode: string;
  aiCreditsBalance: number;
  aiCreditsMonthlyAllowance: number;
  postsPublishedThisMonth: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  createdAt: Date;
}
export const workspaces = defineCollection<WorkspacesDocument>("workspaces", {
  defaults: () => ({ planSlug: "free", billingCycle: "monthly", aiBillingMode: "byok", aiCreditsBalance: 0, aiCreditsMonthlyAllowance: 0, postsPublishedThisMonth: 0, stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: "inactive", createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","slug"],
  indexes: [],
  references: [{"target":"users","field":"ownerId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","name","slug","ownerId","planSlug","billingCycle","aiBillingMode","aiCreditsBalance","aiCreditsMonthlyAllowance","postsPublishedThisMonth","stripeCustomerId","stripeSubscriptionId","subscriptionStatus","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"name":{"bsonType":"string"},"slug":{"bsonType":"string"},"ownerId":{"bsonType":["int","long","double"]},"planSlug":{"bsonType":"string"},"billingCycle":{"bsonType":"string"},"aiBillingMode":{"bsonType":"string"},"aiCreditsBalance":{"bsonType":["int","long","double"]},"aiCreditsMonthlyAllowance":{"bsonType":["int","long","double"]},"postsPublishedThisMonth":{"bsonType":["int","long","double"]},"stripeCustomerId":{"bsonType":["string","null"]},"stripeSubscriptionId":{"bsonType":["string","null"]},"subscriptionStatus":{"bsonType":"string"},"createdAt":{"bsonType":"date"}}},
});

export interface WorkspaceMembersDocument {
  id: number;
  workspaceId: number;
  userId: number | null;
  invitedEmail: string;
  memberName: string;
  role: string;
  status: string;
  createdAt: Date;
}
export const workspaceMembers = defineCollection<WorkspaceMembersDocument>("workspace_members", {
  defaults: () => ({ userId: null, role: "owner", status: "active", createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"},{"target":"users","field":"userId","onDelete":"set null"}],
  validator: {"bsonType":"object","required":["id","workspaceId","userId","invitedEmail","memberName","role","status","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"userId":{"bsonType":["int","long","double","null"]},"invitedEmail":{"bsonType":"string"},"memberName":{"bsonType":"string"},"role":{"bsonType":"string"},"status":{"bsonType":"string"},"createdAt":{"bsonType":"date"}}},
});

export interface BrandsDocument {
  id: number;
  workspaceId: number;
  name: string;
  websiteUrl: string;
  industry: string;
  description: string;
  productsServices: string;
  targetAudience: string;
  brandVoice: string;
  tone: string;
  marketingGoals: string[];
  contentPillars: string[];
  suggestedHashtags: string[];
  colorPrimary: string;
  colorAccent: string;
  isActive: boolean;
  createdAt: Date;
}
export const brands = defineCollection<BrandsDocument>("brands", {
  defaults: () => ({ websiteUrl: "", industry: "", description: "", productsServices: "", targetAudience: "", brandVoice: "", tone: "Professional", marketingGoals: [], contentPillars: [], suggestedHashtags: [], colorPrimary: "#7C3AED", colorAccent: "#06B6D4", isActive: true, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","name","websiteUrl","industry","description","productsServices","targetAudience","brandVoice","tone","marketingGoals","contentPillars","suggestedHashtags","colorPrimary","colorAccent","isActive","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"name":{"bsonType":"string"},"websiteUrl":{"bsonType":"string"},"industry":{"bsonType":"string"},"description":{"bsonType":"string"},"productsServices":{"bsonType":"string"},"targetAudience":{"bsonType":"string"},"brandVoice":{"bsonType":"string"},"tone":{"bsonType":"string"},"marketingGoals":{"bsonType":"array"},"contentPillars":{"bsonType":"array"},"suggestedHashtags":{"bsonType":"array"},"colorPrimary":{"bsonType":"string"},"colorAccent":{"bsonType":"string"},"isActive":{"bsonType":"bool"},"createdAt":{"bsonType":"date"}}},
});

export interface SocialAccountsDocument {
  id: number;
  workspaceId: number;
  brandId: number;
  platform: string;
  accountName: string;
  handle: string;
  accountType: string;
  status: string;
  integrationMode: string;
  permissions: string[];
  rateLimitRemaining: number;
  rateLimitMax: number;
  followersCount: number;
  lastSyncAt: Date;
  lastError: string | null;
  createdAt: Date;
}
export const socialAccounts = defineCollection<SocialAccountsDocument>("social_accounts", {
  defaults: () => ({ accountType: "Business", status: "disconnected", integrationMode: "customer_credentials", permissions: [], rateLimitRemaining: 0, rateLimitMax: 0, followersCount: 0, lastSyncAt: new Date(), lastError: null, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"},{"target":"brands","field":"brandId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","brandId","platform","accountName","handle","accountType","status","integrationMode","permissions","rateLimitRemaining","rateLimitMax","followersCount","lastSyncAt","lastError","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"brandId":{"bsonType":["int","long","double"]},"platform":{"bsonType":"string"},"accountName":{"bsonType":"string"},"handle":{"bsonType":"string"},"accountType":{"bsonType":"string"},"status":{"bsonType":"string"},"integrationMode":{"bsonType":"string"},"permissions":{"bsonType":"array"},"rateLimitRemaining":{"bsonType":["int","long","double"]},"rateLimitMax":{"bsonType":["int","long","double"]},"followersCount":{"bsonType":["int","long","double"]},"lastSyncAt":{"bsonType":"date"},"lastError":{"bsonType":["string","null"]},"createdAt":{"bsonType":"date"}}},
});

export interface AiConfigurationsDocument {
  id: number;
  workspaceId: number;
  provider: string;
  mode: string;
  encryptedApiKey: string | null;
  keyLast4: string | null;
  keyValidated: boolean;
  preferredModel: string;
  temperature: string;
  updatedAt: Date;
}
export const aiConfigurations = defineCollection<AiConfigurationsDocument>("ai_configurations", {
  defaults: () => ({ provider: "openai", mode: "managed", encryptedApiKey: null, keyLast4: null, keyValidated: false, preferredModel: "gpt-4o-mini", temperature: "0.7", updatedAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","workspaceId"],
  indexes: [],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","provider","mode","encryptedApiKey","keyLast4","keyValidated","preferredModel","temperature","updatedAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"provider":{"bsonType":"string"},"mode":{"bsonType":"string"},"encryptedApiKey":{"bsonType":["string","null"]},"keyLast4":{"bsonType":["string","null"]},"keyValidated":{"bsonType":"bool"},"preferredModel":{"bsonType":"string"},"temperature":{"bsonType":"string"},"updatedAt":{"bsonType":"date"}}},
});

export interface AiUsageRecordsDocument {
  id: number;
  workspaceId: number;
  userId: number | null;
  operation: string;
  model: string;
  billingMode: string;
  creditsUsed: number;
  tokensEstimate: number;
  executionSource: string;
  createdAt: Date;
}
export const aiUsageRecords = defineCollection<AiUsageRecordsDocument>("ai_usage_records", {
  defaults: () => ({ userId: null, model: "gpt-4o-mini", billingMode: "managed", creditsUsed: 0, tokensEstimate: 0, executionSource: "pending", createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","userId","operation","model","billingMode","creditsUsed","tokensEstimate","executionSource","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"userId":{"bsonType":["int","long","double","null"]},"operation":{"bsonType":"string"},"model":{"bsonType":"string"},"billingMode":{"bsonType":"string"},"creditsUsed":{"bsonType":["int","long","double"]},"tokensEstimate":{"bsonType":["int","long","double"]},"executionSource":{"bsonType":"string"},"createdAt":{"bsonType":"date"}}},
});

export interface PostsDocument {
  id: number;
  workspaceId: number;
  brandId: number;
  campaignId: number | null;
  title: string;
  topic: string;
  baseContent: string;
  contentType: string;
  tone: string;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  timezone: string;
  platforms: string[];
  variants: Record<string, PlatformVariant>;
  mediaIds: number[];
  createdByAgent: boolean;
  approvalNote: string | null;
  requiresApproval: boolean;
  approvedAt: Date | null;
  approvedBy: number | null;
  notifyOnPublish: boolean;
  automaticMedia: { kind: "image" | "video" | "gif" } | null;
  automaticMediaId: number | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const posts = defineCollection<PostsDocument>("posts", {
  defaults: () => ({ campaignId: null, topic: "", contentType: "Educational Post", tone: "Professional", status: "draft", scheduledAt: null, publishedAt: null, timezone: "America/New_York", platforms: [], variants: {}, mediaIds: [], createdByAgent: false, approvalNote: null, requiresApproval: true, approvedAt: null, approvedBy: null, notifyOnPublish: true, automaticMedia: null, automaticMediaId: null, idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1},{"status":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"},{"target":"brands","field":"brandId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","brandId","campaignId","title","topic","baseContent","contentType","tone","status","scheduledAt","publishedAt","timezone","platforms","variants","mediaIds","createdByAgent","approvalNote","requiresApproval","approvedAt","approvedBy","notifyOnPublish","automaticMedia","automaticMediaId","idempotencyKey","createdAt","updatedAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"brandId":{"bsonType":["int","long","double"]},"campaignId":{"bsonType":["int","long","double","null"]},"title":{"bsonType":"string"},"topic":{"bsonType":"string"},"baseContent":{"bsonType":"string"},"contentType":{"bsonType":"string"},"tone":{"bsonType":"string"},"status":{"bsonType":"string"},"scheduledAt":{"bsonType":["date","null"]},"publishedAt":{"bsonType":["date","null"]},"timezone":{"bsonType":"string"},"platforms":{"bsonType":"array"},"variants":{"bsonType":"object"},"mediaIds":{"bsonType":"array"},"createdByAgent":{"bsonType":"bool"},"approvalNote":{"bsonType":["string","null"]},"requiresApproval":{"bsonType":"bool"},"approvedAt":{"bsonType":["date","null"]},"approvedBy":{"bsonType":["int","long","double","null"]},"notifyOnPublish":{"bsonType":"bool"},"automaticMedia":{"bsonType":["object","null"]},"automaticMediaId":{"bsonType":["int","long","double","null"]},"idempotencyKey":{"bsonType":["string","null"]},"createdAt":{"bsonType":"date"},"updatedAt":{"bsonType":"date"}}},
});

export interface PublishingJobsDocument {
  id: number;
  workspaceId: number;
  postId: number;
  platform: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  scheduledFor: Date;
  executedAt: Date | null;
  errorMessage: string | null;
  externalPostId: string | null;
  idempotencyKey: string;
  createdAt: Date;
  encryptedProviderState?: string | null;
  socialAccountId?: number | null;
  startedAt?: Date | null;
  nextCheckAt?: Date | null;
}
export const publishingJobs = defineCollection<PublishingJobsDocument>("publishing_jobs", {
  defaults: () => ({ status: "queued", attempts: 0, maxAttempts: 3, executedAt: null, errorMessage: null, externalPostId: null, encryptedProviderState: null, socialAccountId: null, startedAt: null, nextCheckAt: null, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","idempotencyKey"],
  indexes: [{"workspaceId":1},{"status":1,"scheduledFor":1},{"status":1,"nextCheckAt":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"},{"target":"posts","field":"postId","onDelete":"cascade"},{"target":"social_accounts","field":"socialAccountId","onDelete":"set null"}],
  validator: {
    bsonType: "object",
    required: ["id", "workspaceId", "postId", "platform", "status", "attempts", "maxAttempts", "scheduledFor", "executedAt", "errorMessage", "externalPostId", "idempotencyKey", "createdAt"],
    properties: {
      id: { bsonType: ["int", "long", "double"] }, workspaceId: { bsonType: ["int", "long", "double"] },
      postId: { bsonType: ["int", "long", "double"] }, platform: { bsonType: "string" }, status: { bsonType: "string" },
      attempts: { bsonType: ["int", "long", "double"] }, maxAttempts: { bsonType: ["int", "long", "double"] },
      scheduledFor: { bsonType: "date" }, executedAt: { bsonType: ["date", "null"] },
      errorMessage: { bsonType: ["string", "null"] }, externalPostId: { bsonType: ["string", "null"] },
      idempotencyKey: { bsonType: "string" }, createdAt: { bsonType: "date" },
      encryptedProviderState: { bsonType: ["string", "null"] }, socialAccountId: { bsonType: ["int", "long", "double", "null"] },
      startedAt: { bsonType: ["date", "null"] }, nextCheckAt: { bsonType: ["date", "null"] },
    },
  },
});

export interface CampaignsDocument {
  id: number;
  workspaceId: number;
  brandId: number;
  name: string;
  description: string;
  objective: string;
  audience: string;
  platforms: string[];
  status: string;
  startDate: string;
  endDate: string;
  strategySummary: string;
  contentThemes: string[];
  weeklyCadence: number;
  isSampleData: boolean;
  createdAt: Date;
}
export const campaigns = defineCollection<CampaignsDocument>("campaigns", {
  defaults: () => ({ description: "", objective: "Brand Awareness & Lead Generation", audience: "", platforms: [], status: "active", strategySummary: "", contentThemes: [], weeklyCadence: 4, isSampleData: false, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"},{"target":"brands","field":"brandId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","brandId","name","description","objective","audience","platforms","status","startDate","endDate","strategySummary","contentThemes","weeklyCadence","isSampleData","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"brandId":{"bsonType":["int","long","double"]},"name":{"bsonType":"string"},"description":{"bsonType":"string"},"objective":{"bsonType":"string"},"audience":{"bsonType":"string"},"platforms":{"bsonType":"array"},"status":{"bsonType":"string"},"startDate":{"bsonType":"string"},"endDate":{"bsonType":"string"},"strategySummary":{"bsonType":"string"},"contentThemes":{"bsonType":"array"},"weeklyCadence":{"bsonType":["int","long","double"]},"isSampleData":{"bsonType":"bool"},"createdAt":{"bsonType":"date"}}},
});

export interface MediaAssetsDocument {
  id: number;
  workspaceId: number;
  brandId: number | null;
  title: string;
  prompt: string;
  assetType: string;
  aspectRatio: string;
  url: string;
  storageKey: string | null;
  storageProvider?: "local" | "s3";
  storageBucket?: string | null;
  storageRegion?: string | null;
  byteSize?: number;
  mimeType: string | null;
  generationStatus: string;
  providerJobId: string | null;
  generationError: string | null;
  generationCredits: number;
  generationStartedAt: Date | null;
  tags: string[];
  altText: string;
  brandPreset: string;
  isSampleData: boolean;
  createdAt: Date;
}
export const mediaAssets = defineCollection<MediaAssetsDocument>("media_assets", {
  defaults: () => ({ brandId: null, prompt: "", assetType: "image", aspectRatio: "16:9", storageKey: null, mimeType: null, generationStatus: "ready", providerJobId: null, generationError: null, generationCredits: 0, generationStartedAt: null, tags: [], altText: "", brandPreset: "", isSampleData: false, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","brandId","title","prompt","assetType","aspectRatio","url","storageKey","mimeType","generationStatus","providerJobId","generationError","generationCredits","generationStartedAt","tags","altText","brandPreset","isSampleData","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"brandId":{"bsonType":["int","long","double","null"]},"title":{"bsonType":"string"},"prompt":{"bsonType":"string"},"assetType":{"bsonType":"string"},"aspectRatio":{"bsonType":"string"},"url":{"bsonType":"string"},"storageKey":{"bsonType":["string","null"]},"mimeType":{"bsonType":["string","null"]},"generationStatus":{"bsonType":"string"},"providerJobId":{"bsonType":["string","null"]},"generationError":{"bsonType":["string","null"]},"generationCredits":{"bsonType":["int","long","double"]},"generationStartedAt":{"bsonType":["date","null"]},"tags":{"bsonType":"array"},"altText":{"bsonType":"string"},"brandPreset":{"bsonType":"string"},"isSampleData":{"bsonType":"bool"},"createdAt":{"bsonType":"date"}}},
});

export interface AgentConfigurationsDocument {
  id: number;
  workspaceId: number;
  brandId: number;
  mode: string;
  isPaused: boolean;
  maxPostsPerWeek: number;
  allowedPlatforms: string[];
  requireApprovalForPromotions: boolean;
  objectives: string[];
  currentStrategy: string;
  weeklyPlan: WeeklyPlanSlot[];
  updatedAt: Date;
}
export const agentConfigurations = defineCollection<AgentConfigurationsDocument>("agent_configurations", {
  defaults: () => ({ mode: "assisted", isPaused: false, maxPostsPerWeek: 7, allowedPlatforms: ["linkedin", "x", "instagram"], requireApprovalForPromotions: true, objectives: [], currentStrategy: "", weeklyPlan: [], updatedAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","workspaceId"],
  indexes: [],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","brandId","mode","isPaused","maxPostsPerWeek","allowedPlatforms","requireApprovalForPromotions","objectives","currentStrategy","weeklyPlan","updatedAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"brandId":{"bsonType":["int","long","double"]},"mode":{"bsonType":"string"},"isPaused":{"bsonType":"bool"},"maxPostsPerWeek":{"bsonType":["int","long","double"]},"allowedPlatforms":{"bsonType":"array"},"requireApprovalForPromotions":{"bsonType":"bool"},"objectives":{"bsonType":"array"},"currentStrategy":{"bsonType":"string"},"weeklyPlan":{"bsonType":"array"},"updatedAt":{"bsonType":"date"}}},
});

export interface AgentActionsDocument {
  id: number;
  workspaceId: number;
  brandId: number;
  actionType: string;
  title: string;
  description: string;
  reasoning: string;
  status: string;
  targetPostId: number | null;
  createdAt: Date;
}
export const agentActions = defineCollection<AgentActionsDocument>("agent_actions", {
  defaults: () => ({ reasoning: "", status: "proposed", targetPostId: null, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","brandId","actionType","title","description","reasoning","status","targetPostId","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"brandId":{"bsonType":["int","long","double"]},"actionType":{"bsonType":"string"},"title":{"bsonType":"string"},"description":{"bsonType":"string"},"reasoning":{"bsonType":"string"},"status":{"bsonType":"string"},"targetPostId":{"bsonType":["int","long","double","null"]},"createdAt":{"bsonType":"date"}}},
});

export interface AnalyticsSnapshotsDocument {
  id: number;
  workspaceId: number;
  brandId: number;
  platform: string;
  dateLabel: string;
  impressions: number;
  reach: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  followers: number;
  postType: string;
  isSampleData: boolean;
  createdAt: Date;
}
export const analyticsSnapshots = defineCollection<AnalyticsSnapshotsDocument>("analytics_snapshots", {
  defaults: () => ({ impressions: 0, reach: 0, engagements: 0, likes: 0, comments: 0, shares: 0, clicks: 0, followers: 0, postType: "Educational Post", isSampleData: false, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","brandId","platform","dateLabel","impressions","reach","engagements","likes","comments","shares","clicks","followers","postType","isSampleData","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"brandId":{"bsonType":["int","long","double"]},"platform":{"bsonType":"string"},"dateLabel":{"bsonType":"string"},"impressions":{"bsonType":["int","long","double"]},"reach":{"bsonType":["int","long","double"]},"engagements":{"bsonType":["int","long","double"]},"likes":{"bsonType":["int","long","double"]},"comments":{"bsonType":["int","long","double"]},"shares":{"bsonType":["int","long","double"]},"clicks":{"bsonType":["int","long","double"]},"followers":{"bsonType":["int","long","double"]},"postType":{"bsonType":"string"},"isSampleData":{"bsonType":"bool"},"createdAt":{"bsonType":"date"}}},
});

export interface NotificationsDocument {
  id: number;
  workspaceId: number;
  userId: number | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  actionHref: string;
  createdAt: Date;
}
export const notifications = defineCollection<NotificationsDocument>("notifications", {
  defaults: () => ({ userId: null, isRead: false, actionHref: "/app", createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [{"target":"workspaces","field":"workspaceId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","workspaceId","userId","type","title","message","isRead","actionHref","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double"]},"userId":{"bsonType":["int","long","double","null"]},"type":{"bsonType":"string"},"title":{"bsonType":"string"},"message":{"bsonType":"string"},"isRead":{"bsonType":"bool"},"actionHref":{"bsonType":"string"},"createdAt":{"bsonType":"date"}}},
});

export interface AuditLogsDocument {
  id: number;
  workspaceId: number | null;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
export const auditLogs = defineCollection<AuditLogsDocument>("audit_logs", {
  defaults: () => ({ workspaceId: null, resourceId: "", metadata: {}, createdAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [{"workspaceId":1}],
  references: [],
  validator: {"bsonType":"object","required":["id","workspaceId","actorEmail","action","resourceType","resourceId","metadata","createdAt"],"properties":{"id":{"bsonType":["int","long","double"]},"workspaceId":{"bsonType":["int","long","double","null"]},"actorEmail":{"bsonType":"string"},"action":{"bsonType":"string"},"resourceType":{"bsonType":"string"},"resourceId":{"bsonType":"string"},"metadata":{"bsonType":"object"},"createdAt":{"bsonType":"date"}}},
});

export interface FeatureFlagsDocument {
  id: number;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  updatedAt: Date;
}
export const featureFlags = defineCollection<FeatureFlagsDocument>("feature_flags", {
  defaults: () => ({ enabled: true, updatedAt: new Date() }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","key"],
  indexes: [],
  references: [],
  validator: {"bsonType":"object","required":["id","key","name","description","enabled","updatedAt"],"properties":{"id":{"bsonType":["int","long","double"]},"key":{"bsonType":"string"},"name":{"bsonType":"string"},"description":{"bsonType":"string"},"enabled":{"bsonType":"bool"},"updatedAt":{"bsonType":"date"}}},
});

export interface NotificationPreferencesDocument {
  userId: number;
  onsite: boolean;
  email: boolean;
  push: boolean;
}
export const notificationPreferences = defineCollection<NotificationPreferencesDocument>("notification_preferences", {
  defaults: () => ({ onsite: true, email: false, push: false }),
  primaryKey: "userId",
  autoId: false,
  unique: ["userId"],
  indexes: [],
  references: [{"target":"users","field":"userId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["userId","onsite","email","push"],"properties":{"userId":{"bsonType":["int","long","double"]},"onsite":{"bsonType":"bool"},"email":{"bsonType":"bool"},"push":{"bsonType":"bool"}}},
});

export interface PushSubscriptionsDocument {
  id: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}
export const pushSubscriptions = defineCollection<PushSubscriptionsDocument>("push_subscriptions", {
  defaults: () => ({  }),
  primaryKey: "id",
  autoId: true,
  unique: ["id","endpoint"],
  indexes: [],
  references: [{"target":"users","field":"userId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","userId","endpoint","p256dh","auth"],"properties":{"id":{"bsonType":["int","long","double"]},"userId":{"bsonType":["int","long","double"]},"endpoint":{"bsonType":"string"},"p256dh":{"bsonType":"string"},"auth":{"bsonType":"string"}}},
});

export interface NotificationDeliveriesDocument {
  id: number;
  userId: number;
  channel: string;
  title: string;
  message: string;
  actionHref: string;
  status: string;
  attempts: number;
  availableAt: Date;
  lastError: string | null;
}
export const notificationDeliveries = defineCollection<NotificationDeliveriesDocument>("notification_deliveries", {
  defaults: () => ({ status: "queued", attempts: 0, availableAt: new Date(), lastError: null }),
  primaryKey: "id",
  autoId: true,
  unique: ["id"],
  indexes: [],
  references: [{"target":"users","field":"userId","onDelete":"cascade"}],
  validator: {"bsonType":"object","required":["id","userId","channel","title","message","actionHref","status","attempts","availableAt","lastError"],"properties":{"id":{"bsonType":["int","long","double"]},"userId":{"bsonType":["int","long","double"]},"channel":{"bsonType":"string"},"title":{"bsonType":"string"},"message":{"bsonType":"string"},"actionHref":{"bsonType":"string"},"status":{"bsonType":"string"},"attempts":{"bsonType":["int","long","double"]},"availableAt":{"bsonType":"date"},"lastError":{"bsonType":["string","null"]}}},
});

export interface SocialCredentialsDocument {
  socialAccountId: number;
  workspaceId: number;
  encryptedCredentials: string;
  verifiedAt: Date;
  expiresAt: Date | null;
}
export const socialCredentials = defineCollection<SocialCredentialsDocument>("social_credentials", {
  defaults: () => ({ verifiedAt: new Date(), expiresAt: null }),
  primaryKey: "socialAccountId",
  autoId: false,
  unique: ["socialAccountId"],
  indexes: [{ workspaceId: 1 }],
  references: [{ target: "social_accounts", field: "socialAccountId", onDelete: "cascade" }, { target: "workspaces", field: "workspaceId", onDelete: "cascade" }],
  validator: { bsonType: "object", required: ["socialAccountId", "workspaceId", "encryptedCredentials", "verifiedAt", "expiresAt"], properties: { socialAccountId: { bsonType: ["int", "long", "double"] }, workspaceId: { bsonType: ["int", "long", "double"] }, encryptedCredentials: { bsonType: "string" }, verifiedAt: { bsonType: "date" }, expiresAt: { bsonType: ["date", "null"] } } },
});

export const collections = [users, sessions, workspaces, workspaceMembers, brands, socialAccounts, aiConfigurations, aiUsageRecords, posts, publishingJobs, campaigns, mediaAssets, agentConfigurations, agentActions, analyticsSnapshots, notifications, auditLogs, featureFlags, notificationPreferences, pushSubscriptions, notificationDeliveries, socialCredentials];
