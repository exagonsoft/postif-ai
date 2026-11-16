import { defineCollection } from "./model";

export interface PublishingReservation {
  key: string;
  workspaceId: number;
  postId: number;
  period: string;
  status: "reserved" | "consumed" | "released";
  createdAt: Date;
}

export const publishingReservations = defineCollection<PublishingReservation>("publishing_reservations", {
  defaults: () => ({ status: "reserved", createdAt: new Date() }),
  primaryKey: "key",
  autoId: false,
  unique: ["key"],
  indexes: [{ workspaceId: 1, period: 1 }, { workspaceId: 1, postId: 1 }],
  references: [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }],
  validator: {
    bsonType: "object",
    required: ["key", "workspaceId", "postId", "period", "status", "createdAt"],
    properties: {
      key: { bsonType: "string" }, workspaceId: { bsonType: ["int", "long", "double"] },
      postId: { bsonType: ["int", "long", "double"] }, period: { bsonType: "string" },
      status: { enum: ["reserved", "consumed", "released"] }, createdAt: { bsonType: "date" },
    },
  },
});

interface CampaignRequest {
  key: string;
  workspaceId: number;
  campaignId: number;
  inputHash: string;
  createdAt: Date;
}

export const campaignRequests = defineCollection<CampaignRequest>("campaign_requests", {
  defaults: () => ({ createdAt: new Date() }),
  primaryKey: "key", autoId: false, unique: ["key"], indexes: [],
  references: [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }],
  validator: { bsonType: "object", required: ["key", "workspaceId", "campaignId", "inputHash", "createdAt"], properties: { key: { bsonType: "string" }, workspaceId: { bsonType: ["int", "long", "double"] }, campaignId: { bsonType: ["int", "long", "double"] }, inputHash: { bsonType: "string" }, createdAt: { bsonType: "date" } } },
});

export const entitlementCollections = [publishingReservations, campaignRequests];
