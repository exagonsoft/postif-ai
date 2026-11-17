import "./register-ts.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";

globalThis.__immediateRouter = { refresh() {} };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/navigation") return { shortCircuit: true, url: "data:text/javascript,export function useRouter(){return globalThis.__immediateRouter;}" };
    if (specifier === "@/i18n/provider") return { shortCircuit: true, url: "data:text/javascript,const t=key=>key; export function useAppLanguage(){return {t,formatDate:()=> 'date',formatNumber:String};}" };
    return next(specifier, context);
  },
});
const { ImmediatePublishingProgress } = await import("../src/components/ImmediatePublishingProgress.tsx");
const { CalendarClient } = await import("../src/components/CalendarClient.tsx");

test("calendar distinguishes immediate publication from scheduled jobs", () => {
  const job = { postId: 1, platform: "instagram", status: "processing", attempts: 1, maxAttempts: 3,
    scheduledFor: "2026-11-17T19:44:00.000Z", errorMessage: null, idempotencyKey: "test" };
  const html = renderToString(createElement(CalendarClient, { posts: [], jobs: [
    { ...job, id: 1, deliveryMode: "immediate" },
    { ...job, id: 2, deliveryMode: "scheduled" },
  ] }));
  assert.match(html, /customer\.publish\.immediateStarted/);
  assert.equal((html.match(/customer\.text\.322/g) || []).length, 1);
});

async function setup(responses) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://app.example.test" });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const timers = new Map();
  let nextTimer = 1;
  globalThis.setTimeout = callback => { const id = nextTimer++; timers.set(id, callback); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const requests = [];
  let refreshes = 0;
  globalThis.__immediateRouter = { refresh() { refreshes++; } };
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const response = responses.shift();
    assert.ok(response, "Unexpected polling request");
    return { ok: response.ok, json: async () => response.body };
  };
  const root = createRoot(dom.window.document.getElementById("root"));
  const job = { id: 12, platform: "instagram", status: "processing", errorMessage: null };
  await act(async () => root.render(createElement(ImmediatePublishingProgress, { job })));
  return {
    dom, requests, timers,
    get refreshes() { return refreshes; },
    async tick() { const [id, callback] = timers.entries().next().value; timers.delete(id); await act(async () => callback()); },
    async close() {
      await act(async () => root.unmount());
      globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear;
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
      dom.window.close();
    },
  };
}

test("immediate Instagram processing continues the existing job and stops once confirmed", async () => {
  const view = await setup([
    { ok: true, body: { status: "processing", errorMessage: null } },
    { ok: true, body: { status: "completed", errorMessage: null } },
  ]);
  try {
    assert.deepEqual(view.requests, [{ url: "/api/jobs", body: { action: "check_immediate", jobId: 12 } }]);
    assert.match(view.dom.window.document.body.textContent, /customer.publish.pending/);
    await view.tick();
    assert.equal(view.requests.length, 2);
    assert.equal(view.timers.size, 0);
    assert.equal(view.refreshes, 1);
    assert.match(view.dom.window.document.body.textContent, /customer.status.completed/);
  } finally { await view.close(); }
});

test("provider failures and failed status checks stop polling and are visible", async () => {
  for (const response of [
    { ok: true, body: { status: "failed", errorMessage: "Provider rejected media" } },
    { ok: false, body: { error: "Publishing permission required" } },
  ]) {
    const view = await setup([response]);
    try {
      assert.equal(view.requests.length, 1);
      assert.equal(view.timers.size, 0);
      assert.ok(view.dom.window.document.querySelector('[role="alert"]'));
      assert.match(view.dom.window.document.body.textContent, /Provider rejected media|Publishing permission required/);
    } finally { await view.close(); }
  }
});
