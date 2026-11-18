import type { SocialPlatform } from "./social-adapters";

export interface ManagedProviderAvailability {
  platform: SocialPlatform;
  status: "available" | "not_configured";
  analyticsAvailable: boolean;
  organizationsAvailable: boolean;
  publicPostingAvailable: boolean;
  facebookBusinessLogin?: boolean;
}

export interface ManagedSocialDestination {
  id: string;
  name: string;
  handle: string;
  accountType: string;
  permissions: string[];
  requestedPermissions?: string[];
  unknownPermissions?: string[];
  privacyLevels?: string[];
}

export interface ManagedSocialSelection {
  platform: SocialPlatform;
  ticket: string;
  destinations: ManagedSocialDestination[];
  analyticsEnabled: boolean;
  publicPostingAvailable: boolean;
}
