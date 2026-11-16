import { defineCollection } from "./model";

interface AccountToken {
  tokenHash: string;
  userId: number;
  purpose: "verify_email" | "reset_password";
  expiresAt: Date;
}

export const accountTokens = defineCollection<AccountToken>("account_tokens", {
  defaults: () => ({}),
  primaryKey: "tokenHash", autoId: false, unique: ["tokenHash"],
  indexes: [{ userId: 1 }],
  references: [{ target: "users", field: "userId", onDelete: "cascade" }],
  validator: { bsonType: "object", required: ["tokenHash", "userId", "purpose", "expiresAt"], properties: { tokenHash: { bsonType: "string" }, userId: { bsonType: ["int", "long", "double"] }, purpose: { enum: ["verify_email", "reset_password"] }, expiresAt: { bsonType: "date" } } },
});

interface AccountEmailLimit {
  key: string;
  userId: number;
  requestedAt: Date;
}

export const accountEmailLimits = defineCollection<AccountEmailLimit>("account_email_limits", {
  defaults: () => ({}),
  primaryKey: "key", autoId: false, unique: ["key"], indexes: [],
  references: [{ target: "users", field: "userId", onDelete: "cascade" }],
  validator: { bsonType: "object", required: ["key", "userId", "requestedAt"], properties: { key: { bsonType: "string" }, userId: { bsonType: ["int", "long", "double"] }, requestedAt: { bsonType: "date" } } },
});

export const accountCollections = [accountTokens, accountEmailLimits];
