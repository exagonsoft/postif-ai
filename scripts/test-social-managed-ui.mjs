import "./register-ts.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";

globalThis.__socialRouter = { refresh() {}, replace() {} };
globalThis.__socialToasts = [];
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/navigation") return { shortCircuit: true,
      url: "data:text/javascript,export function useRouter(){return globalThis.__socialRouter;}" };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/components/ToastProvider.tsx")) return { shortCircuit: true, format: "module",
      source: "export function useToast(){return {toast(...args){globalThis.__socialToasts.push(args);}};}" };
    return next(url, context);
  },
});
const { ManagedSocialConnect, managedSocialErrorKey } = await import("../src/components/ManagedSocialConnect.tsx");
const { SocialAccountsClient } = await import("../src/components/SocialAccountsClient.tsx");
const { AppLanguageProvider } = await import("../src/i18n/provider.tsx");
const { translate, translations } = await import("../src/i18n/config.ts");
const platforms = ["facebook", "instagram", "linkedin", "x", "tiktok", "pinterest", "youtube", "threads"];
const availability = platforms.map(platform => ({ platform, status: "available", analyticsAvailable: false, organizationsAvailable: false, publicPostingAvailable: false }));
const defaultProps = { availability, accounts: [], canManage: true };
const wrap = (Component, props, locale = "en") => createElement(AppLanguageProvider, { initialLocale: locale }, createElement(Component, props));
const text = key => translate("en", key);
const button = (container, key) => [...container.querySelectorAll("button")].find(item => item.textContent === text(key));
const change = async (dom, element, value) => act(async () => {
  const prototype = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
});
async function mount(props = {}, Component = ManagedSocialConnect) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://app.example.test/app/social" });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const oldFetch = globalThis.fetch;
  const requests = [];
  const navigation = [];
  globalThis.__socialToasts = [];
  globalThis.__socialRouter = { replace(url) { navigation.push(url); }, refresh() { navigation.push("refresh"); } };
  globalThis.fetch = async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return { ok: false, json: async () => ({ code: "AUTHORIZATION_DENIED", error: "DO NOT DISPLAY RAW PROVIDER ERRORS" }) }; };
  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);
  await act(async () => root.render(wrap(Component, { ...defaultProps, ...props })));
  return { dom, container, requests, navigation, async close() {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    dom.window.close();
  } };
}
const selection = (platform, extra = {}) => ({ platform, ticket: "one-use-opaque-ticket", analyticsEnabled: false, publicPostingAvailable: false,
  destinations: [{ id: "real-provider-destination", name: "Authorized destination", handle: "@actual", accountType: "creator", permissions: ["publish"], privacyLevels: ["SELF_ONLY"] }], ...extra });

test("managed strings have all four translations, matching placeholders, and render eight provider cards", () => {
  const keys = Object.keys(translations.en).filter(key => key.startsWith("social.managed."));
  for (const locale of ["en", "es", "de", "pt-BR"]) {
    for (const key of keys) {
      assert.ok(translations[locale][key]?.trim(), `${locale}/${key}`);
      assert.deepEqual([...translations[locale][key].matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(),
        [...translations.en[key].matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), `${locale}/${key}`);
    }
    const html = renderToString(wrap(ManagedSocialConnect, defaultProps, locale));
    const document = new JSDOM(html).window.document;
    assert.equal(document.querySelectorAll("[data-managed-provider]").length, 8);
    assert.equal(document.querySelectorAll("[data-managed-provider] svg").length, 8);
    assert.ok(document.body.textContent.includes(translate(locale, "social.managed.intro")));
    assert.ok(!document.body.textContent.includes("social.managed."));
  }
});

test("availability gates are truthful and unmanaged members cannot authorize", () => {
  const gated = availability.map(item => ({ ...item, status: item.platform === "facebook" ? "not_configured" : "approval_required" }));
  const html = renderToString(wrap(ManagedSocialConnect, { ...defaultProps, availability: gated }));
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll("[data-managed-provider] button:disabled").length, 8);
  assert.ok(document.body.textContent.includes(text("social.managed.gate.not_configured")));
  assert.ok(document.body.textContent.includes(text("social.managed.gate.approval_required")));
  const memberHtml = renderToString(wrap(ManagedSocialConnect, { ...defaultProps, canManage: false, selection: selection("facebook") }));
  assert.equal(new JSDOM(memberHtml).window.document.querySelectorAll("button,form").length, 0);
});

test("opening Connect does not fetch; consent is explicit and optional analytics defaults off", async () => {
  const view = await mount({ availability: availability.map(item => ({ ...item, analyticsAvailable: true })) });
  try {
    await act(async () => view.container.querySelector('[data-managed-provider="facebook"] button').click());
    assert.equal(view.requests.length, 0);
    assert.equal(button(view.container, "social.managed.continue").disabled, true);
    const checkboxes = [...view.container.querySelectorAll('input[type="checkbox"]')];
    assert.deepEqual(checkboxes.map(item => item.checked), [false, false]);
    await act(async () => checkboxes[1].click());
    await act(async () => button(view.container, "social.managed.continue").click());
    assert.deepEqual(view.requests, [{ url: "/api/social/oauth/facebook/start", body: { mode: "managed", analyticsEnabled: false, organizations: false } }]);
    assert.ok(view.container.querySelector('[role="alert"]').textContent.includes(text("social.managed.error.AUTHORIZATION_DENIED")));
    assert.ok(!view.container.textContent.includes("DO NOT DISPLAY"));
    assert.equal(view.navigation.length, 0);
  } finally { await view.close(); }
});

test("only approved analytics and LinkedIn organization choices are offered and sent", async () => {
  const view = await mount({ availability: availability.map(item => ({ ...item, analyticsAvailable: item.platform === "linkedin", organizationsAvailable: item.platform === "linkedin" })) });
  try {
    await act(async () => view.container.querySelector('[data-managed-provider="linkedin"] button').click());
    const choices = [...view.container.querySelectorAll('input[type="checkbox"]')];
    assert.deepEqual(choices.map(item => item.checked), [false, false, false]);
    for (const checkbox of choices) await act(async () => checkbox.click());
    await act(async () => button(view.container, "social.managed.continue").click());
    assert.deepEqual(view.requests[0].body, { mode: "managed", analyticsEnabled: true, organizations: true });
    await act(async () => view.container.querySelector('[data-managed-provider="threads"] button').click());
    assert.equal(view.container.querySelectorAll('input[type="checkbox"]').length, 1);
    assert.equal(button(view.container, "social.managed.continue").disabled, true);
  } finally { await view.close(); }
});

test("YouTube requires explicit private visibility and made-for-kids declaration before persistence", async () => {
  const view = await mount({ selection: selection("youtube") });
  try {
    const confirm = button(view.container, "social.managed.confirm");
    assert.equal(confirm.disabled, true);
    assert.equal(view.requests.length, 0);
    assert.equal(view.container.querySelectorAll('input[type="text"]').length, 0);
    await act(async () => view.container.querySelector('input[type="radio"]').click());
    const [privacy, declaration] = view.container.querySelectorAll("select");
    assert.deepEqual([...privacy.options].map(item => item.value), ["", "private"]);
    assert.equal(privacy.value, "");
    assert.equal(declaration.value, "");
    await change(view.dom, privacy, "private");
    assert.equal(confirm.disabled, true);
    await change(view.dom, declaration, "no");
    assert.equal(confirm.disabled, false);
    globalThis.fetch = async (url, init) => {
      view.requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    };
    await act(async () => view.container.querySelector("form").dispatchEvent(new view.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.deepEqual(view.requests[0], { url: "/api/social/oauth/youtube/select", body: {
      ticket: "one-use-opaque-ticket", destinationId: "real-provider-destination", privacyLevel: "private", madeForKids: false,
    } });
    assert.deepEqual(view.navigation, ["/app/social", "refresh"]);
    assert.ok(view.container.querySelector('[role="status"]').textContent.includes(text("social.managed.success")));
    assert.ok(globalThis.__socialToasts[0].includes(text("social.managed.success")));
    assert.equal(view.container.querySelectorAll("form").length, 0);
  } finally { await view.close(); }
});

test("TikTok uses only creator-returned privacy levels and requires an explicit AI declaration", async () => {
  const view = await mount({ selection: selection("tiktok") });
  try {
    await act(async () => view.container.querySelector('input[type="radio"]').click());
    const [privacy, declaration] = view.container.querySelectorAll("select");
    assert.deepEqual([...privacy.options].map(item => item.value), ["", "SELF_ONLY"]);
    await change(view.dom, privacy, "SELF_ONLY");
    assert.equal(button(view.container, "social.managed.confirm").disabled, true);
    await change(view.dom, declaration, "yes");
    await act(async () => view.container.querySelector("form").dispatchEvent(new view.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(view.requests[0].body.aiGenerated, true);
    assert.equal(view.requests[0].body.privacyLevel, "SELF_ONLY");
    assert.ok(!Object.hasOwn(view.requests[0].body, "madeForKids"));
    assert.equal(view.navigation.length, 0, "Failed selections must keep the ticket and must not report success.");
    assert.equal(globalThis.__socialToasts.length, 0);
  } finally { await view.close(); }
});

test("approved YouTube visibility is offered; choosing another destination clears declarations", async () => {
  const initial = selection("youtube", { publicPostingAvailable: true });
  initial.destinations.push({ ...initial.destinations[0], id: "another-authorized-channel", name: "Second channel" });
  const view = await mount({ selection: initial });
  try {
    const radios = view.container.querySelectorAll('input[type="radio"]');
    await act(async () => radios[0].click());
    const [privacy, declaration] = view.container.querySelectorAll("select");
    assert.deepEqual([...privacy.options].map(item => item.value), ["", "private", "unlisted", "public"]);
    await change(view.dom, privacy, "public");
    await change(view.dom, declaration, "no");
    await act(async () => radios[1].click());
    assert.equal(privacy.value, "");
    assert.equal(declaration.value, "");
    assert.equal(button(view.container, "social.managed.confirm").disabled, true);
  } finally { await view.close(); }
});

test("unknown errors never expose raw query input or provider messages", () => {
  assert.equal(managedSocialErrorKey("<script>secret</script>"), "social.managed.error.AUTHORIZATION_FAILED");
  const html = renderToString(wrap(ManagedSocialConnect, { ...defaultProps, errorCode: "raw-error-access_token=secret" }));
  assert.ok(!html.includes("raw-error-access_token"));
  assert.ok(html.includes(text("social.managed.error.AUTHORIZATION_FAILED")));
});

test("legacy credential forms stay collapsed; existing account actions and local-only disconnect note remain available", async () => {
  const account = { id: 42, platform: "youtube", accountName: "Existing channel", handle: "@channel", accountType: "channel",
    status: "expired", integrationMode: "managed_oauth", lastError: null };
  const view = await mount({ accounts: [account], managedAvailability: availability, maxChannels: 3, planName: "Starter", callbackOrigin: "https://app.example.test" }, SocialAccountsClient);
  try {
    const advanced = view.container.querySelector("details");
    assert.ok(advanced);
    assert.equal(advanced.open, false);
    assert.equal(advanced.querySelector("summary").textContent, text("social.managed.advanced"));
    assert.ok(advanced.querySelector('input[type="password"]'));
    assert.ok(view.container.querySelector('[data-managed-provider="youtube"] button').textContent.includes(text("social.managed.reconnect")));
    assert.equal(view.container.querySelector('[data-managed-provider="youtube"] a').getAttribute("href"), "#social-account-42");
    const accountCard = view.container.querySelector("#social-account-42");
    assert.equal(accountCard.querySelectorAll("button").length, 3);
    assert.equal(accountCard.querySelector('input[type="checkbox"]').checked, false);
    globalThis.fetch = async (url, init) => {
      view.requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ok: true, revocation: "local_only" }) };
    };
    await act(async () => [...accountCard.querySelectorAll("button")].find(item => item.textContent.includes(text("customer.text.669"))).click());
    assert.deepEqual(view.requests[0], { url: "/api/social", body: { action: "disconnect", accountId: 42 } });
    assert.ok(globalThis.__socialToasts[0].includes(text("social.managed.localDisconnect")));
  } finally { await view.close(); }
});

test("provider revocation is explicit, warned, and offered only for documented managed providers", async () => {
  const accounts = ["youtube", "tiktok", "x", "facebook"].map((platform, index) => ({ id: index + 1, platform, accountName: platform,
    handle: `@${platform}`, accountType: "creator", status: "connected", integrationMode: "managed_oauth", lastError: null }));
  accounts.push({ ...accounts[0], id: 5, integrationMode: "customer_credentials" });
  const view = await mount({ accounts, managedAvailability: availability, maxChannels: 8, planName: "Starter", callbackOrigin: "https://app.example.test" }, SocialAccountsClient);
  try {
    for (const id of [1, 2]) {
      const card = view.container.querySelector(`#social-account-${id}`);
      assert.equal(card.querySelector('input[type="checkbox"]').checked, false);
      assert.ok(card.textContent.includes(text("social.managed.revocationWarning")));
    }
    for (const id of [3, 4, 5]) assert.equal(view.container.querySelector(`#social-account-${id} input[type="checkbox"]`), null);
    const card = view.container.querySelector("#social-account-1");
    await act(async () => card.querySelector('input[type="checkbox"]').click());
    globalThis.fetch = async (url, init) => {
      view.requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ok: true, revocation: "revoked" }) };
    };
    await act(async () => [...card.querySelectorAll("button")].find(item => item.textContent.includes(text("customer.text.669"))).click());
    assert.deepEqual(view.requests[0], { url: "/api/social", body: { action: "disconnect", accountId: 1, revokeProvider: true } });
    assert.ok(globalThis.__socialToasts[0].includes(text("social.managed.providerDisconnected")));
  } finally { await view.close(); }
});

test("an HTTP success without persisted ok:true never confirms a connection", async () => {
  const view = await mount({ selection: selection("facebook") });
  try {
    await act(async () => view.container.querySelector('input[type="radio"]').click());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ url: "/not-persisted" }) });
    await act(async () => view.container.querySelector("form").dispatchEvent(new view.dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(view.navigation.length, 0);
    assert.equal(globalThis.__socialToasts.length, 0);
    assert.ok(view.container.querySelector('[role="alert"]').textContent.includes(text("social.managed.error.AUTHORIZATION_FAILED")));
    assert.ok(view.container.querySelector("form"));
  } finally { await view.close(); }
});
