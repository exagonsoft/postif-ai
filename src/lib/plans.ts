export interface PlanDefinition {
  slug: "free" | "starter_byok" | "starter_ai" | "pro_byok" | "pro_ai" | "agency";
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  defaultAiMode: "managed" | "byok";
  allowsConfigurableAiMode: boolean;
  maxBrands: number;
  maxChannels: number;
  maxPostsPerMonth: number;
  includedMonthlyCredits: number;
  autopilotEnabled: boolean;
  teamCollaboration: boolean;
  campaignsEnabled: boolean;
  advancedAnalytics: boolean;
  popular?: boolean;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<PlanDefinition["slug"], PlanDefinition> = {
  free: {
    slug: "free",
    name: "Free",
    tagline: "Plan and publish with your own OpenAI key.",
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    defaultAiMode: "byok",
    allowsConfigurableAiMode: false,
    maxBrands: 1,
    maxChannels: 2,
    maxPostsPerMonth: 5,
    includedMonthlyCredits: 0,
    autopilotEnabled: false,
    teamCollaboration: false,
    campaignsEnabled: false,
    advancedAnalytics: false,
    features: [
      "1 Brand Profile",
      "2 Connected Social Channels",
      "5 Published Posts / month",
      "Manual Publishing Approval",
      "Bring Your Own OpenAI API Key",
    ],
  },
  starter_byok: {
    slug: "starter_byok",
    name: "Starter BYOK",
    tagline: "Bring your own OpenAI key and pay direct token rates.",
    monthlyPrice: 9,
    annualMonthlyPrice: 7,
    defaultAiMode: "byok",
    allowsConfigurableAiMode: false,
    maxBrands: 1,
    maxChannels: 3,
    maxPostsPerMonth: 30,
    includedMonthlyCredits: 0,
    autopilotEnabled: false,
    teamCollaboration: false,
    campaignsEnabled: true,
    advancedAnalytics: false,
    features: [
      "1 Brand Profile",
      "3 Connected Social Channels",
      "30 Published Posts / month",
      "Bring Your Own OpenAI API Key",
      "Multi-Platform Content Studio & Calendar",
    ],
  },
  starter_ai: {
    slug: "starter_ai",
    name: "Starter AI",
    tagline: "Zero API setup with managed OpenAI credits included.",
    monthlyPrice: 19,
    annualMonthlyPrice: 15,
    defaultAiMode: "managed",
    allowsConfigurableAiMode: false,
    maxBrands: 1,
    maxChannels: 3,
    maxPostsPerMonth: 30,
    includedMonthlyCredits: 300,
    autopilotEnabled: false,
    teamCollaboration: false,
    campaignsEnabled: true,
    advancedAnalytics: false,
    features: [
      "1 Brand Profile",
      "3 Connected Social Channels",
      "30 Published Posts / month",
      "300 Managed AI Credits / month",
      "Smart Repurposing & Brand Discovery",
    ],
  },
  pro_byok: {
    slug: "pro_byok",
    name: "Pro BYOK",
    tagline: "Multi-brand growth engine powered by your own OpenAI key.",
    monthlyPrice: 24,
    annualMonthlyPrice: 19,
    defaultAiMode: "byok",
    allowsConfigurableAiMode: true,
    maxBrands: 3,
    maxChannels: 8,
    maxPostsPerMonth: 150,
    includedMonthlyCredits: 0,
    autopilotEnabled: true,
    teamCollaboration: true,
    campaignsEnabled: true,
    advancedAnalytics: true,
    features: [
      "3 Brand Profiles",
      "8 Connected Social Channels",
      "150 Published Posts / month",
      "Bring Your Own OpenAI API Key",
      "Assisted AI Marketing Agent & Analytics",
    ],
  },
  pro_ai: {
    slug: "pro_ai",
    name: "Pro AI",
    tagline: "Recurring AI planning with managed credits and review controls.",
    monthlyPrice: 49,
    annualMonthlyPrice: 39,
    defaultAiMode: "managed",
    allowsConfigurableAiMode: true,
    maxBrands: 3,
    maxChannels: 8,
    maxPostsPerMonth: 150,
    includedMonthlyCredits: 1000,
    autopilotEnabled: true,
    teamCollaboration: true,
    campaignsEnabled: true,
    advancedAnalytics: true,
    popular: true,
    features: [
      "3 Brand Profiles",
      "8 Connected Social Channels",
      "150 Published Posts / month",
      "1,000 Managed AI Credits / month",
      "Recurring AI Planning & Advanced Analytics",
    ],
  },
  agency: {
    slug: "agency",
    name: "Agency",
    tagline: "Multi-client command center with RBAC and client approvals.",
    monthlyPrice: 99,
    annualMonthlyPrice: 79,
    defaultAiMode: "managed",
    allowsConfigurableAiMode: true,
    maxBrands: 15,
    maxChannels: 40,
    maxPostsPerMonth: 1000,
    includedMonthlyCredits: 3500,
    autopilotEnabled: true,
    teamCollaboration: true,
    campaignsEnabled: true,
    advancedAnalytics: true,
    features: [
      "Up to 15 Client Brands",
      "40 Connected Social Channels",
      "1,000 Published Posts / month",
      "3,500 Managed AI Credits or BYOK Toggle",
      "Role-Based Team & Client Approval Portals",
    ],
  },
};

export const BILLING_CURRENCY = "usd";

export const AI_OPERATION_COSTS: Record<string, { label: string; credits: number }> = {
  generate_posts: { label: "Multi-Platform Post Generation", credits: 10 },
  transform_post: { label: "Rewrite / Tone / Translate Action", credits: 4 },
  repurpose_content: { label: "Smart Content Repurposing", credits: 12 },
  campaign_blueprint: { label: "AI Campaign Plan Generator", credits: 18 },
  agent_strategy: { label: "AI Agent Weekly Plan & Strategy", credits: 15 },
  brand_discovery: { label: "AI Website Brand Discovery", credits: 12 },
  media_blueprint: { label: "AI Visual Prompt & Alt-Text", credits: 6 },
};

export function getPlanDefinition(planSlug: string): PlanDefinition {
  return (
    Object.hasOwn(SUBSCRIPTION_PLANS, planSlug)
      ? SUBSCRIPTION_PLANS[planSlug as PlanDefinition["slug"]]
      : SUBSCRIPTION_PLANS.free
  );
}
