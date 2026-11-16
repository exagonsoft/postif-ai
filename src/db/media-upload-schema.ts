import { defineCollection } from "./model";

export interface MediaUploadIntent {
  id: string;
  workspaceId: number;
  brandId: number;
  title: string;
  mimeType: string;
  byteSize: number;
  storageProvider: "s3";
  storageBucket: string;
  storageRegion: string;
  storageKey: string;
  quarantineKey: string;
  sourceVersion: string | null;
  sourceETag: string | null;
  status: "pending" | "completed" | "cancelled" | "rejected" | "expired";
  assetId: number | null;
  createdAt: Date;
  expiresAt: Date;
  nextCleanupAt: Date;
}

// No TTL: versioned S3 objects must be removed before any durable state can be discarded.
// Keep tombstones to catch presigned POSTs that finish after expiration or cancellation.
export const mediaUploadIntents = defineCollection<MediaUploadIntent>("media_upload_intents", {
  primaryKey: "id", autoId: false, unique: ["id"],
  references: [],
  indexes: [{ workspaceId: 1, createdAt: 1 }, { workspaceId: 1, status: 1 }, { expiresAt: 1, nextCleanupAt: 1 }],
  defaults: () => ({ status: "pending", sourceVersion: null, sourceETag: null, assetId: null, createdAt: new Date() }),
  validator: {
    bsonType: "object",
    required: ["id", "workspaceId", "brandId", "storageKey", "quarantineKey", "status", "expiresAt", "nextCleanupAt"],
    properties: {
      id: { bsonType: "string" }, workspaceId: { bsonType: ["int", "long", "double"] },
      brandId: { bsonType: ["int", "long", "double"] },
      status: { enum: ["pending", "completed", "cancelled", "rejected", "expired"] },
      expiresAt: { bsonType: "date" }, nextCleanupAt: { bsonType: "date" },
    },
  },
});
export const mediaUploadCollections = [mediaUploadIntents];
