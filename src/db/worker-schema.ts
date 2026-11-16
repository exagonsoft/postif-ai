import { defineCollection } from "./model";

const integer = { bsonType: ["int", "long", "double"], minimum: 0 };
const text = { bsonType: "string" };
const date = { bsonType: "date" };
const nullableText = { bsonType: ["string", "null"] };
function model<T extends { id: number }>(name: string, unique: string[], defaults: () => Partial<T>, fields: Record<string, object>, tenant = true) {
  return defineCollection<T>(name, {
    primaryKey: "id", autoId: true, unique: ["id", ...unique],
    defaults, indexes: tenant && !unique.includes("workspaceId") ? [{ workspaceId: 1 }] : [],
    references: tenant ? [{ target: "workspaces", field: "workspaceId", onDelete: "cascade" }] : [],
    validator: { bsonType: "object", required: ["id", ...(tenant ? ["workspaceId"] : []), ...Object.keys(fields)], properties: { id: integer, ...(tenant ? { workspaceId: integer } : {}), ...fields } },
  });
}

export interface AIRequest {
  id: number; key: string; workspaceId: number; userId: number | null;
  fingerprint: string; operation: string; billingMode: "managed" | "byok";
  model: string; credentialVersion: string; creditEpoch: string; credits: number; balance: number;
  status: "reserved" | "sending" | "succeeded" | "refunded" | "uncertain";
  token: string; encryptedResult: string | null; tokens: number; usageRecordId: number;
  refundedAt: Date | null; refundedCredits: number;
  createdAt: Date; updatedAt: Date; error: string | null;
}
export const aiRequests = model<AIRequest>("ai_requests", ["key"], () => ({
  status: "reserved", encryptedResult: null, tokens: 0, error: null, refundedAt: null, refundedCredits: 0, createdAt: new Date(), updatedAt: new Date(),
}), {
  key: text, userId: { bsonType: ["int", "long", "double", "null"] }, fingerprint: text,
  operation: text, billingMode: { enum: ["managed", "byok"] }, model: text, credentialVersion: text,
  creditEpoch: text, credits: integer, balance: integer, status: { enum: ["reserved", "sending", "succeeded", "refunded", "uncertain"] },
  token: text, encryptedResult: nullableText, tokens: integer, usageRecordId: integer,
  refundedAt: { bsonType: ["date", "null"] }, refundedCredits: integer, createdAt: date, updatedAt: date, error: nullableText,
});
aiRequests.indexes.push({ status: 1, updatedAt: 1 });

export interface MediaReservation {
  id: number; assetId: number; workspaceId: number;
  billingMode: "managed" | "byok"; model: string; credentialVersion: string; creditEpoch: string;
  transport: "legacy" | "openai_responses" | "openai_images" | "runway"; responseModel: string | null;
  usageRecordId: number | null;
  status: "reserved" | "succeeded" | "refunded"; credits: number; refundedCredits: number;
  lastCheckedAt: Date; nextCheckAt: Date; createdAt: Date;
}
export const mediaReservations = model<MediaReservation>("media_reservations", ["assetId"], () => ({
  status: "reserved", transport: "legacy", responseModel: null, usageRecordId: null, refundedCredits: 0, lastCheckedAt: new Date(0), nextCheckAt: new Date(0), createdAt: new Date(),
}), {
  assetId: integer, billingMode: { enum: ["managed", "byok"] }, model: text, credentialVersion: text,
  transport: { enum: ["legacy", "openai_responses", "openai_images", "runway"] }, responseModel: nullableText,
  usageRecordId: { bsonType: ["int", "long", "double", "null"] },
  status: { enum: ["reserved", "succeeded", "refunded"] }, credits: integer, creditEpoch: text, refundedCredits: integer,
  lastCheckedAt: date, nextCheckAt: date, createdAt: date,
});
mediaReservations.indexes.push({ status: 1, nextCheckAt: 1, lastCheckedAt: 1 });

export interface WorkerState {
  id: number; key: string; phase: string; token: string; status: string;
  startedAt: Date; heartbeatAt: Date; completedAt: Date | null; error: string | null;
  result: unknown;
}
export const workerStates = model<WorkerState>("worker_states", ["key"], () => ({
  startedAt: new Date(), heartbeatAt: new Date(), completedAt: null, error: null, result: null,
}), { key: text, phase: text, token: text, status: text, startedAt: date, heartbeatAt: date,
  completedAt: { bsonType: ["date", "null"] }, error: nullableText, result: {},
}, false);

export interface PlanningSchedule {
  id: number; workspaceId: number; enabled: boolean; enabledBy: number;
  nextRunAt: Date; intervalDays: number; lastError: string | null; updatedAt: Date;
}
export const planningSchedules = model<PlanningSchedule>("planning_schedules", ["workspaceId"], () => ({
  enabled: false, nextRunAt: new Date(), intervalDays: 7, lastError: null, updatedAt: new Date(),
}), { enabled: { bsonType: "bool" }, enabledBy: integer, nextRunAt: date, intervalDays: { ...integer, minimum: 1, maximum: 28 }, lastError: nullableText, updatedAt: date });
planningSchedules.indexes.push({ enabled: 1, nextRunAt: 1, updatedAt: 1 });
export interface PlanningRun {
  id: number; key: string; workspaceId: number; brandId: number;
  periodStart: Date; status: string; cursor: number; total: number;
  createdAt: Date; updatedAt: Date; error: string | null;
}
export const planningRuns = model<PlanningRun>("planning_runs", ["key"], () => ({
  status: "planning", cursor: 0, total: 0, createdAt: new Date(), updatedAt: new Date(), error: null,
}), { key: text, brandId: integer, periodStart: date, status: text, cursor: integer, total: integer,
  createdAt: date, updatedAt: date, error: nullableText,
});
planningRuns.indexes.push({ workspaceId: 1, createdAt: -1 });

export interface WorkerNotice {
  id: number; key: string; workspaceId: number; type: string; title: string; message: string;
  actionHref: string; approversOnly: boolean; status: string; attempts: number; availableAt: Date;
}
export const workerNotices = model<WorkerNotice>("worker_notices", ["key"], () => ({
  approversOnly: false, status: "queued", attempts: 0, availableAt: new Date(),
}), { key: text, type: text, title: text, message: text, actionHref: text, approversOnly: { bsonType: "bool" },
  status: text, attempts: integer, availableAt: date,
});
workerNotices.indexes.push({ status: 1, availableAt: 1 });

export const workerCollections = [aiRequests, mediaReservations, workerStates, planningSchedules, planningRuns, workerNotices];
