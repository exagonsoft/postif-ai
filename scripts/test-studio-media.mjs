import "./register-ts.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { JSDOM } from "jsdom";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/navigation") return { shortCircuit: true, url: "data:text/javascript,export function useRouter(){return globalThis.studioRouter;}" };
    if (specifier === "next/image") return { shortCircuit: true, url: "data:text/javascript,export default function Image({unoptimized,...props}){return globalThis.studioImage(props)}" };
    return next(specifier, context);
  },
});
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://studio.example.test/app/studio" });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
globalThis.studioRouter = { refresh() {} };
const { act, createElement } = await import("react");
globalThis.studioImage = props => createElement("img", props);
const { createRoot } = await import("react-dom/client");
const { AppLanguageProvider } = await import("../src/i18n/provider.tsx");
const { translations } = await import("../src/i18n/config.ts");
const { ContentStudioClient } = await import("../src/components/ContentStudioClient.tsx");
const { PostsManagerClient } = await import("../src/components/PostsManagerClient.tsx");
const { ToastProvider } = await import("../src/components/ToastProvider.tsx");
const originalFetch = globalThis.fetch;
const calls = [];
let currentKind = "image";
let preflightResponse = null;
const variant = { content: "Generated copy", hashtags: [], cta: "", formatLabel: "Text", characterCount: 14 };
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method || "GET", body: typeof init.body === "string" ? JSON.parse(init.body) : null, key: new Headers(init.headers).get("Idempotency-Key") });
  if (url === "/api/media") return Response.json({ assets: [{ id: 42, title: "Generated", assetType: currentKind, generationStatus: "ready", url: "/api/media/42/content" }] });
  if (url.startsWith("/api/media/generate?")) return preflightResponse ? await preflightResponse : Response.json({ ok: true });
  if (url === "/api/ai/generate") return Response.json({ ok: true, baseContent: "Generated copy", variants: { facebook: variant }, meta: { executionSource: "openai_live", model: "test", creditsCharged: 10 } });
  if (url === "/api/posts" && init.method === "POST" && JSON.parse(init.body).action === "create_media_draft") return Response.json({ ok: true, mediaAssetId: 42, post: { id: 12, status: "waiting_media", automaticMediaId: 42 } });
  if (url === "/api/posts" && init.method === "POST" && JSON.parse(init.body).action === "advance_media_draft") return Response.json({ ok: true, mediaAssetId: 42, post: { id: 12, status: "draft", mediaIds: [42] } });
  throw new Error(`Unexpected mock request ${url}`);
};
try {
  for (const kind of ["none", "image", "video", "gif"]) {
    currentKind = kind;
    calls.length = 0;
    const root = createRoot(document.getElementById("root"));
    try {
      await act(async () => root.render(createElement(AppLanguageProvider, { initialLocale: "en" }, createElement(ToastProvider, null, createElement(ContentStudioClient, {
        brands: [{ id: 3, name: "Brand", tone: "Professional", targetAudience: "", suggestedHashtags: [] }],
        defaultBrandId: 3, isTeamWorkspace: false, memberRole: "owner",
      })))));
      const topic = document.querySelector("input:not([type])");
      const timeSelector = document.querySelector(`select[aria-label="${translations.en["customer.schedule.time"]}"]`);
      assert.deepEqual([...timeSelector.options].map(option => option.value), ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]);
      assert.ok(document.querySelector(`input[type="date"][aria-label="${translations.en["customer.schedule.date"]}"]`));
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(topic, "A subject");
        topic.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Facebook Pages").click();
      });
      if (kind !== "none") {
        await act(async () => document.querySelector(`input[name="automatic-media-kind"][value="${kind}"]`).click());
        assert.ok(document.querySelector(`input[name="studio-generation-media"]:checked`).parentElement.textContent.includes(translations.en[`customer.text.${kind === "image" ? "286" : kind === "video" ? "287" : "288"}`]));
      }
      const generate = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === translations.en["customer.text.436"]);
      await act(async () => { generate.click(); await new Promise(resolve => setTimeout(resolve, 30)); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      assert.equal(calls.filter(call => call.url === "/api/ai/generate").length, 1, `${kind}: text request`);
      const mediaCall = calls.find(call => call.url === "/api/posts" && call.method === "POST");
      if (kind === "none") {
        assert.equal(mediaCall, undefined, "Text-only does not enqueue media");
      } else {
        assert.ok(calls.some(call => call.url.includes(`kind=${kind}`)), `${kind}: preflight`);
        assert.equal(mediaCall.body.automaticMedia.kind, kind);
        assert.equal(mediaCall.body.action, "create_media_draft");
        assert.ok(mediaCall.key, "Media draft request is idempotent");
        assert.equal(mediaCall.body.baseContent, "Generated copy");
        assert.ok(document.body.textContent.includes(translations.en["customer.mediaDraft.ready"]));
        assert.ok(document.querySelector(kind === "video" ? "video" : 'img[alt="Generated"]'), "Attached media is visible in the preview");
        if (kind === "image") {
          await act(async () => document.querySelector('img[alt="Generated"]').dispatchEvent(new dom.window.Event("error")));
          assert.ok(document.body.textContent.includes(translations.en["customer.mediaDraft.previewFailed"]), "Preview errors are visible");
        }
      }
    } finally { await act(async () => root.unmount()); }
  }
  calls.length = 0;
  let resolvePreflight;
  preflightResponse = new Promise(resolve => { resolvePreflight = resolve; });
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(AppLanguageProvider, { initialLocale: "en" }, createElement(ToastProvider, null, createElement(ContentStudioClient, {
      brands: [{ id: 3, name: "Brand", tone: "Professional", targetAudience: "", suggestedHashtags: [] }],
      defaultBrandId: 3, isTeamWorkspace: false, memberRole: "owner",
    })))));
    await act(async () => {
      const topic = document.querySelector("input:not([type])");
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(topic, "A subject");
      topic.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Facebook Pages").click();
      document.querySelector('input[name="automatic-media-kind"][value="image"]').click();
    });
    await act(async () => {
      [...document.querySelectorAll("button")].find(button => button.textContent.trim() === translations.en["customer.text.436"]).click();
    });
    assert.ok([...document.querySelectorAll("button")].find(button => button.textContent.trim() === translations.en["customer.text.473"]).disabled, "Draft saving is disabled during preflight");
    await act(async () => {
      resolvePreflight(Response.json({ error: "Provider unavailable" }, { status: 409 }));
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    assert.ok(document.body.textContent.includes("Provider unavailable"), "Preflight rejection is visible");
    assert.equal(calls.filter(call => call.url === "/api/ai/generate" || (call.url === "/api/posts" && call.method === "POST")).length, 0, "A rejected preflight makes no generation or draft request");
  } finally { await act(async () => root.unmount()); }
  preflightResponse = null;
  calls.length = 0;
  const postsRoot = createRoot(document.getElementById("root"));
  try {
    await act(async () => postsRoot.render(createElement(AppLanguageProvider, { initialLocale: "en" }, createElement(ToastProvider, null, createElement(PostsManagerClient, {
      isTeamWorkspace: false, memberRole: "owner", posts: [{
        id: 12, title: "Waiting draft", baseContent: "Generated copy", contentType: "Post", status: "waiting_media", platforms: ["facebook"],
        scheduledAt: null, createdByAgent: false, approvalNote: null, requiresApproval: false, media: [], variants: {}, timezone: "UTC",
        automaticMedia: { kind: "image" }, automaticMediaStatus: "queued", mediaDraft: true,
      }],
    })))));
    await act(async () => {
      [...document.querySelectorAll("button")].find(button => button.textContent.trim() === translations.en["customer.mediaDraft.resume"]).click();
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    assert.ok(calls.some(call => call.body?.action === "advance_media_draft" && call.body.postId === 12), "Posts resumes the existing draft");
    assert.ok(document.body.textContent.includes(translations.en["customer.mediaDraft.ready"]));
  } finally { await act(async () => postsRoot.unmount()); }
  console.log("Studio UI checks passed: text-only and image/video/GIF requests, shared selection, idempotency, draft attachment and preview. Providers were mocked.");
} finally {
  globalThis.fetch = originalFetch;
  dom.window.close();
}
