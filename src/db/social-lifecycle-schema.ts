import { defineCollection } from "./model";

export interface SocialOAuthAttempt {
  id: number; stateHash: string; workspaceId: number; userId: number; brandId: number;
  platform: string; encryptedPayload: string; expiresAt: Date; consumedAt: Date | null;
}
export const socialOAuthAttempts = defineCollection<SocialOAuthAttempt>("social_oauth_attempts", {
  defaults: () => ({ consumedAt: null }), primaryKey: "id", autoId: true, unique: ["id", "stateHash"],
  indexes: [{ workspaceId: 1 }],
  references: [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }, { target: "users", field: "userId", onDelete: "cascade" }, { target: "brands", field: "brandId", onDelete: "cascade" }],
  validator: { bsonType: "object", required: ["stateHash", "workspaceId", "userId", "brandId", "platform", "encryptedPayload", "expiresAt", "consumedAt"], properties: { stateHash: { bsonType: "string" }, encryptedPayload: { bsonType: "string" }, expiresAt: { bsonType: "date" }, consumedAt: { bsonType: ["date", "null"] } } },
});
export interface SocialLifecycleStatus {
  id: number; socialAccountId: number; workspaceId: number; renewalStatus: string;
  renewalMessage: string | null; renewAfter: Date; analyticsStatus: string;
  analyticsMessage: string | null; syncAfter: Date; updatedAt: Date;
}
export const socialLifecycleStatuses = defineCollection<SocialLifecycleStatus>("social_lifecycle_statuses", {
  defaults: () => ({ renewalStatus: "not_checked", renewalMessage: null, analyticsStatus: "not_checked", analyticsMessage: null, renewAfter: new Date(0), syncAfter: new Date(0), updatedAt: new Date() }),
  primaryKey: "id", autoId: true, unique: ["id", "socialAccountId"], indexes: [{ workspaceId: 1 }, { renewAfter: 1 }, { syncAfter: 1 }],
  references: [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }, { target: "social_accounts", field: "socialAccountId", onDelete: "cascade" }],
  validator: { bsonType: "object", required: ["socialAccountId", "workspaceId", "renewalStatus", "analyticsStatus", "renewAfter", "syncAfter", "updatedAt"], properties: { renewAfter: { bsonType: "date" }, syncAfter: { bsonType: "date" }, updatedAt: { bsonType: "date" } } },
});
export interface SocialEngagementSnapshot {
  id: number; snapshotKey: string; workspaceId: number; socialAccountId: number; platform: string;
  day: string; capturedAt: Date; source: "provider"; isSampleData: false;
  metrics: Record<string, number>; unavailableMetrics: string[]; coverage: string;
}
export const socialEngagementSnapshots = defineCollection<SocialEngagementSnapshot>("social_engagement_snapshots", {
  defaults: () => ({ capturedAt: new Date(), source: "provider", isSampleData: false }),
  primaryKey: "id", autoId: true, unique: ["id", "snapshotKey"], indexes: [{ workspaceId: 1, day: -1 }, { socialAccountId: 1, day: -1 }],
  references: [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }, { target: "social_accounts", field: "socialAccountId", onDelete: "cascade" }],
  validator: { bsonType: "object", required: ["snapshotKey", "workspaceId", "socialAccountId", "platform", "day", "capturedAt", "source", "isSampleData", "metrics", "unavailableMetrics", "coverage"], properties: { source: { enum: ["provider"] }, isSampleData: { enum: [false] }, capturedAt: { bsonType: "date" }, metrics: { bsonType: "object" }, unavailableMetrics: { bsonType: "array" } } },
});
export const socialLifecycleCollections = [socialOAuthAttempts, socialLifecycleStatuses, socialEngagementSnapshots];
