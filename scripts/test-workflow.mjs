import { readFile } from "node:fs/promises";
import ts from "typescript";
import assert from "node:assert/strict";
import { test } from "node:test";
import "./register-ts.mjs";

async function load(file) {
  const source = await readFile(new URL(`../src/lib/${file}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { resolvePostState, isPublishable } = await load("post-policy");
const { scheduleToISO, formatScheduleInput } = await load("schedule-time");
const { detectMedia } = await import("../src/lib/media-storage.ts");
const now = new Date("2026-11-15T12:00:00Z");
const base = { requested: "scheduled", requiresApproval: true, approved: false, contentChanged: false, role: "owner", scheduledAt: new Date("2026-11-16T12:00:00Z"), now };
test("scheduled review posts cannot bypass approval", () => assert.equal(resolvePostState(base).status, "pending_approval"));
test("Publish Now enqueues and does not claim delivery", () => {
  const state = resolvePostState({ ...base, requested: "published", requiresApproval: false });
  assert.equal(state.status, "scheduled"); assert.equal(state.scheduledAt, now);
});
test("Publish Now cannot bypass review", () => assert.equal(resolvePostState({ ...base, requested: "published" }).status, "pending_approval"));
test("approval schedules a pending post at its original time", () => {
  const state = resolvePostState({ ...base, previous: "pending_approval", requested: "approved" });
  assert.equal(state.status, "scheduled"); assert.equal(state.approved, true); assert.equal(state.scheduledAt, base.scheduledAt);
});
test("editors cannot approve", () => assert.throws(() => resolvePostState({ ...base, requested: "approved", previous: "pending_approval", role: "editor" }), /approver/));
test("editing approved content invalidates approval", () => {
  const state = resolvePostState({ ...base, previous: "scheduled", approved: true, contentChanged: true });
  assert.equal(state.status, "pending_approval"); assert.equal(state.approved, false);
});
test("automatic authorization bypasses manual review", () => assert.equal(resolvePostState({ ...base, requiresApproval: false }).status, "scheduled"));
test("late approval requires rescheduling", () => assert.throws(() => resolvePostState({ ...base, requested: "approved", previous: "pending_approval", scheduledAt: new Date(0) }), /passed/));
test("invalid and missing schedule times are rejected", () => {
  assert.throws(() => resolvePostState({ ...base, scheduledAt: new Date("bad") }), /Invalid/);
  assert.throws(() => resolvePostState({ ...base, scheduledAt: null }), /date and time/);
});
test("worker refuses pending, cancelled, and unapproved scheduled posts", () => {
  for (const status of ["draft", "pending_approval", "cancelled", "published"]) assert.equal(isPublishable({ status, requiresApproval: false, approvedAt: null }), false);
  assert.equal(isPublishable({ status: "scheduled", requiresApproval: true, approvedAt: null }), false);
  assert.equal(isPublishable({ status: "scheduled", requiresApproval: true, approvedAt: now }), true);
});
test("timezone scheduling uses the selected zone, not the server zone", () => {
  assert.equal(scheduleToISO("2026-11-16T10:00", "America/Montevideo"), "2026-11-16T13:00:00.000Z");
  assert.equal(scheduleToISO("2026-07-16T10:00", "America/New_York"), "2026-07-16T14:00:00.000Z");
  assert.equal(formatScheduleInput(now, "America/Montevideo"), "2026-11-15T09:00");
});
test("nonexistent daylight-saving time is rejected", () => assert.throws(() => scheduleToISO("2026-03-08T02:30", "America/New_York"), /does not exist/));
test("uploads inspect bytes instead of trusting extensions", () => {
  assert.equal(detectMedia(Buffer.from('<script>alert("not an image")</script>')), null);
  assert.equal(detectMedia(Buffer.from("89504e470d0a1a0a0000000000000000", "hex")).mimeType, "image/png");
  assert.equal(detectMedia(Buffer.from("000000186674797069736f6d00000000", "hex")).assetType, "video");
});
