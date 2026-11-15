import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  systemRole: text("system_role").notNull().default("user"), // 'user' | 'operator'
  emailVerified: boolean("email_verified").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    activeWorkspaceId: integer("active_workspace_id"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)]
);

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planSlug: text("plan_slug").notNull().default("pro_ai"), // free | starter_byok | starter_ai | pro_byok | pro_ai | agency
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly | annual
  aiBillingMode: text("ai_billing_mode").notNull().default("managed"), // managed | byok
  aiCreditsBalance: integer("ai_credits_balance").notNull().default(840),
  aiCreditsMonthlyAllowance: integer("ai_credits_monthly_allowance").notNull().default(1000),
  postsPublishedThisMonth: integer("posts_published_this_month").notNull().default(18),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    invitedEmail: text("invited_email").notNull(),
    memberName: text("member_name").notNull(),
    role: text("role").notNull().default("owner"), // owner | admin | editor | approver | viewer
    status: text("status").notNull().default("active"), // active | invited
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("workspace_members_ws_idx").on(table.workspaceId)]
);

export const brands = pgTable(
  "brands",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    websiteUrl: text("website_url").notNull().default(""),
    industry: text("industry").notNull().default("SaaS & Technology"),
    description: text("description").notNull().default(""),
    productsServices: text("products_services").notNull().default(""),
    targetAudience: text("target_audience").notNull().default(""),
    brandVoice: text("brand_voice").notNull().default("Authoritative, insightful, modern"),
    tone: text("tone").notNull().default("Professional & Visionary"),
    marketingGoals: jsonb("marketing_goals").$type<string[]>().notNull().default([]),
    contentPillars: jsonb("content_pillars").$type<string[]>().notNull().default([]),
    suggestedHashtags: jsonb("suggested_hashtags").$type<string[]>().notNull().default([]),
    colorPrimary: text("color_primary").notNull().default("#7C3AED"),
    colorAccent: text("color_accent").notNull().default("#06B6D4"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("brands_ws_idx").on(table.workspaceId)]
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // linkedin | x | instagram | facebook | tiktok | pinterest | youtube | threads
    accountName: text("account_name").notNull(),
    handle: text("handle").notNull(),
    accountType: text("account_type").notNull().default("Business"),
    status: text("status").notNull().default("connected"), // connected | disconnected | expired | needs_review
    integrationMode: text("integration_mode").notNull().default("simulated_sandbox"), // simulated_sandbox | oauth_live
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    rateLimitRemaining: integer("rate_limit_remaining").notNull().default(95),
    rateLimitMax: integer("rate_limit_max").notNull().default(100),
    followersCount: integer("followers_count").notNull().default(0),
    lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("social_accounts_ws_idx").on(table.workspaceId)]
);

export const aiConfigurations = pgTable("ai_configurations", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("openai"),
  mode: text("mode").notNull().default("managed"), // managed | byok
  encryptedApiKey: text("encrypted_api_key"),
  keyLast4: text("key_last4"),
  keyValidated: boolean("key_validated").notNull().default(false),
  preferredModel: text("preferred_model").notNull().default("gpt-4o-mini"),
  temperature: text("temperature").notNull().default("0.7"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiUsageRecords = pgTable(
  "ai_usage_records",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    operation: text("operation").notNull(),
    model: text("model").notNull().default("gpt-4o-mini"),
    billingMode: text("billing_mode").notNull().default("managed"), // managed | byok
    creditsUsed: integer("credits_used").notNull().default(0),
    tokensEstimate: integer("tokens_estimate").notNull().default(0),
    executionSource: text("execution_source").notNull().default("simulated"), // openai_live | byok_live | simulated
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_usage_ws_idx").on(table.workspaceId)]
);

export interface PlatformVariant {
  content: string;
  hashtags: string[];
  cta: string;
  formatLabel: string;
  characterCount: number;
}

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id"),
    title: text("title").notNull(),
    topic: text("topic").notNull().default(""),
    baseContent: text("base_content").notNull(),
    contentType: text("content_type").notNull().default("Educational Post"),
    tone: text("tone").notNull().default("Professional"),
    status: text("status").notNull().default("draft"), // draft | pending_approval | approved | scheduled | publishing | published | failed | cancelled
    scheduledAt: timestamp("scheduled_at"),
    publishedAt: timestamp("published_at"),
    timezone: text("timezone").notNull().default("America/New_York"),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    variants: jsonb("variants").$type<Record<string, PlatformVariant>>().notNull().default({}),
    mediaIds: jsonb("media_ids").$type<number[]>().notNull().default([]),
    createdByAgent: boolean("created_by_agent").notNull().default(false),
    approvalNote: text("approval_note"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("posts_ws_idx").on(table.workspaceId),
    index("posts_status_idx").on(table.status),
  ]
);

export const publishingJobs = pgTable(
  "publishing_jobs",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    status: text("status").notNull().default("queued"), // queued | processing | completed | failed | retrying
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    scheduledFor: timestamp("scheduled_for").notNull(),
    executedAt: timestamp("executed_at"),
    errorMessage: text("error_message"),
    externalPostId: text("external_post_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("pub_jobs_ws_idx").on(table.workspaceId)]
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    objective: text("objective").notNull().default("Brand Awareness & Lead Generation"),
    audience: text("audience").notNull().default(""),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"), // draft | active | paused | completed
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    strategySummary: text("strategy_summary").notNull().default(""),
    contentThemes: jsonb("content_themes").$type<string[]>().notNull().default([]),
    weeklyCadence: integer("weekly_cadence").notNull().default(4),
    isSampleData: boolean("is_sample_data").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("campaigns_ws_idx").on(table.workspaceId)]
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: integer("brand_id"),
    title: text("title").notNull(),
    prompt: text("prompt").notNull().default(""),
    assetType: text("asset_type").notNull().default("image"), // image | template | video_blueprint
    aspectRatio: text("aspect_ratio").notNull().default("16:9"), // 1:1 | 4:5 | 16:9 | 9:16
    url: text("url").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    altText: text("alt_text").notNull().default(""),
    brandPreset: text("brand_preset").notNull().default("Nebula Violet"),
    isSampleData: boolean("is_sample_data").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("media_assets_ws_idx").on(table.workspaceId)]
);

export interface WeeklyPlanSlot {
  day: string;
  platform: string;
  pillar: string;
  concept: string;
  status: "planned" | "drafted" | "approved" | "scheduled";
}

export const agentConfigurations = pgTable("agent_configurations", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  brandId: integer("brand_id").notNull(),
  mode: text("mode").notNull().default("assisted"), // manual | assisted | autopilot
  isPaused: boolean("is_paused").notNull().default(false),
  maxPostsPerWeek: integer("max_posts_per_week").notNull().default(7),
  allowedPlatforms: jsonb("allowed_platforms")
    .$type<string[]>()
    .notNull()
    .default(["linkedin", "x", "instagram"]),
  requireApprovalForPromotions: boolean("require_approval_for_promotions").notNull().default(true),
  objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
  currentStrategy: text("current_strategy").notNull().default(""),
  weeklyPlan: jsonb("weekly_plan").$type<WeeklyPlanSlot[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agentActions = pgTable(
  "agent_actions",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: integer("brand_id").notNull(),
    actionType: text("action_type").notNull(), // strategy_update | draft_created | schedule_proposed | optimization_alert
    title: text("title").notNull(),
    description: text("description").notNull(),
    reasoning: text("reasoning").notNull().default(""),
    status: text("status").notNull().default("proposed"), // proposed | approved | executed | rejected
    targetPostId: integer("target_post_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("agent_actions_ws_idx").on(table.workspaceId)]
);

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: integer("brand_id").notNull(),
    platform: text("platform").notNull(),
    dateLabel: text("date_label").notNull(),
    impressions: integer("impressions").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    engagements: integer("engagements").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    followers: integer("followers").notNull().default(0),
    postType: text("post_type").notNull().default("Educational Post"),
    isSampleData: boolean("is_sample_data").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("analytics_ws_idx").on(table.workspaceId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    type: text("type").notNull(), // publish_success | publish_failed | approval_requested | agent_action | credits_low | account_warning
    title: text("title").notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    actionHref: text("action_href").notNull().default("/app"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("notifications_ws_idx").on(table.workspaceId)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id"),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("audit_logs_ws_idx").on(table.workspaceId)]
);

export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
