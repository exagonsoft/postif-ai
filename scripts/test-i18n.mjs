import "./register-ts.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

globalThis.__i18nCookie = undefined;
globalThis.__i18nRefreshes = 0;
const router = { refresh() { globalThis.__i18nRefreshes++; } };
globalThis.__i18nRouter = router;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/image") return next("next/image.js", context);
    if (specifier === "next/navigation") return { shortCircuit: true,
      url: "data:text/javascript,export function useRouter(){return globalThis.__i18nRouter;}" };
    if (specifier === "next/headers") return { shortCircuit: true,
      url: "data:text/javascript,export async function cookies(){return {get(){const value=globalThis.__i18nCookie;return value?{value}:undefined;}};}" };
    return next(specifier, context);
  },
});
const { LOCALES, LOCALE_COOKIE, localeCookie, resolveLocale } = await import("../src/i18n/locale.ts");
const { translate, translations, interpolate } = await import("../src/i18n/config.ts");
const { getServerI18n } = await import("../src/i18n/server.ts");
const { AppLanguageProvider, useAppLanguage } = await import("../src/i18n/provider.tsx");
const { LanguageSelector } = await import("../src/components/LanguageSelector.tsx");
const { BillingClient } = await import("../src/components/BillingClient.tsx");
const { PostMediaPicker } = await import("../src/components/PostMediaPicker.tsx");
const { getPlanDefinition } = await import("../src/lib/plans.ts");

const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
test("all four dictionaries have identical flat keys, nonempty strings and matching placeholders", () => {
  const keys = Object.keys(translations.en).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(translations[locale]).sort(), keys, locale);
    for (const key of keys) {
      assert.equal(typeof translations[locale][key], "string", `${locale}/${key}`);
      assert.ok(translations[locale][key].trim(), `${locale}/${key} is empty`);
      assert.deepEqual(placeholders(translations[locale][key]), placeholders(translations.en[key]), `${locale}/${key}`);
    }
  }
});

test("UI translation references exist instead of exposing untranslated keys to users", () => {
  const missing = [];
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.tsx?$/.test(file)) {
        const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
          file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        function visit(node) {
          if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) && node.expression.text === "t" ||
            ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "t")) {
            const key = node.arguments[0];
            if (key && ts.isStringLiteral(key) && !Object.hasOwn(translations.en, key.text)) missing.push(`${file}: ${key.text}`);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  inspect(path.resolve("src"));
  assert.deepEqual(missing, []);
});

test("locale persistence rejects unsupported values and interpolation keeps supplied values literal", async () => {
  assert.equal(resolveLocale("pt-BR"), "pt-BR");
  assert.equal(resolveLocale("../es"), "en");
  assert.equal(resolveLocale(undefined), "en");
  assert.throws(() => localeCookie("fr"), /Unsupported/);
  assert.match(localeCookie("de", true), /SameSite=Lax; Secure$/);
  assert.equal(interpolate("{name}: {count}", { name: "$& <script>", count: 0 }), "$& <script>: 0");
  for (const value of ["es", "de", "pt-BR", "invalid"]) {
    globalThis.__i18nCookie = value;
    const request = await getServerI18n();
    assert.equal(request.locale, value === "invalid" ? "en" : value);
    assert.equal(request.t("billing.withdraw"), translate(request.locale, "billing.withdraw"));
  }
  globalThis.__i18nCookie = undefined;
});

test("billing renders the real withdrawal action in every language without translating MongoDB plan data", () => {
  const props = {
    plans: [{ ...getPlanDefinition("free"), catalogVersionId: 1, name: "Saved MongoDB plan name", tagline: "Saved MongoDB description" }],
    currentPlanSlug: "free", currentPlanVersionId: 1, billingCycle: "monthly",
    aiBillingMode: "byok", creditsBalance: 0, creditsAllowance: 0,
    keyLast4: null, keyValidated: false, preferredModel: "gpt-4o-mini", usageRecords: [],
    subscription: { status: "APPROVAL_PENDING", paidThrough: null, cancelAtPeriodEnd: false,
      hasCustomer: true, canChange: false, pendingPlanSlug: "starter_ai", pendingInterval: "month", pendingEffectiveAt: null },
    billingReady: false, billingMissing: [], isOwner: true, allowsConfigurableAiMode: false, defaultAiMode: "byok",
  };
  for (const locale of LOCALES) {
    const html = renderToString(createElement(AppLanguageProvider, { initialLocale: locale }, createElement(BillingClient, props)));
    assert.ok(html.includes(translations[locale]["billing.withdraw"]), locale);
    assert.ok(html.includes(translations[locale]["billing.byokTitle"]), locale);
    assert.ok(html.includes("Saved MongoDB plan name"), locale);
    assert.ok(html.includes("Saved MongoDB description"), locale);
    assert.ok(html.includes("APPROVAL_PENDING"), "Actual provider status must remain inspectable.");
    assert.ok(!html.includes("billing.withdraw"), "No unresolved key may leak into the rendered button.");
  }
});

function installDom(html = "") {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, {
    url: "https://app.example.test/app/billing?view=plans#subscription",
  });
  if (!dom.window.HTMLDialogElement.prototype.showModal) dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  if (!dom.window.HTMLDialogElement.prototype.close) dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return { dom, container: dom.window.document.getElementById("root"), restore() {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  } };
}
test("cancelled paid plan checkout requires confirmation and submits a replacement", async () => {
  const { container, dom, restore } = installDom();
  const root = createRoot(container);
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json({ error: "Offline test" }, { status: 409 });
  };
  const props = {
    plans: [{ ...getPlanDefinition("pro_ai"), catalogVersionId: 8, purchasable: true }],
    currentPlanSlug: "starter_ai", currentPlanVersionId: 7, billingCycle: "monthly",
    aiBillingMode: "managed", creditsBalance: 137, creditsAllowance: 300,
    keyLast4: null, keyValidated: false, preferredModel: "gpt-4o-mini", usageRecords: [],
    subscription: { status: "CANCELLED", paidThrough: new Date(Date.now() + 86400000).toISOString(), cancelAtPeriodEnd: true,
      hasCustomer: true, canChange: false, pendingPlanSlug: null, pendingInterval: null, pendingEffectiveAt: null },
    billingReady: true, billingMissing: [], isOwner: true, allowsConfigurableAiMode: false, defaultAiMode: "managed",
  };
  try {
    await act(async () => root.render(createElement(AppLanguageProvider, { initialLocale: "es" }, createElement(BillingClient, props))));
    const text = translate("es", "billing.checkoutPlan", { name: props.plans[0].name });
    const button = [...container.querySelectorAll("button")].find(item => item.textContent === text);
    assert.ok(button && !button.disabled);
    assert.ok(!container.textContent.includes(translate("es", "billing.managePayments")));
    dom.window.confirm = () => { throw new Error("Native confirmation must not be used"); };
    button.focus();
    await act(async () => button.click());
    assert.equal(calls.length, 0);
    let dialog = container.querySelector("dialog");
    assert.ok(dialog?.open);
    assert.equal(dialog.querySelector("h2").textContent, translate("es", "dialog.replacePlanTitle"));
    assert.equal(dialog.querySelector("p").textContent, translate("es", "billing.confirmReplacement"));
    assert.equal(dom.window.document.activeElement.textContent, translate("es", "dialog.cancel"));
    await act(async () => dialog.querySelector("button").click());
    assert.equal(calls.length, 0);
    assert.equal(container.querySelector("dialog"), null);
    assert.equal(dom.window.document.activeElement, button);
    await act(async () => button.click());
    dialog = container.querySelector("dialog");
    await act(async () => dialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })));
    assert.equal(calls.length, 0);
    assert.equal(container.querySelector("dialog"), null);
    await act(async () => button.click());
    dialog = container.querySelector("dialog");
    await act(async () => [...dialog.querySelectorAll("button")].find(item => item.textContent === translate("es", "dialog.continue")).click());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/billing/checkout");
    assert.equal(calls[0].body.planSlug, "pro_ai");
    assert.equal(calls[0].body.replacePaid, true);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    restore();
  }
});
test("media deletion uses a custom confirmation and only deletes after consent", async () => {
  const { container, dom, restore } = installDom();
  const root = createRoot(container);
  const previousFetch = globalThis.fetch;
  const calls = [];
  const asset = { id: 17, title: "Test media", assetType: "video", url: "/test.mp4", generationStatus: "ready" };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body && JSON.parse(options.body) });
    return Response.json(options.method === "POST" ? { ok: true } : { assets: [asset] });
  };
  dom.window.confirm = () => { throw new Error("Native confirmation must not be used"); };
  try {
    await act(async () => root.render(createElement(AppLanguageProvider, { initialLocale: "es" }, createElement(PostMediaPicker,
      { selected: [17], onChange: () => {}, libraryOnly: true, canDelete: true }))));
    const deleteButton = [...container.querySelectorAll("button")].find(item => item.textContent === translate("es", "customer.text.561"));
    assert.ok(deleteButton);
    await act(async () => deleteButton.click());
    let dialog = container.querySelector("dialog");
    assert.ok(dialog?.open);
    assert.equal(dialog.querySelector("p").textContent, translate("es", "customer.deleteMedia", { title: asset.title }));
    await act(async () => dialog.querySelector("button").click());
    assert.equal(calls.filter(call => call.method === "POST").length, 0);
    await act(async () => deleteButton.click());
    dialog = container.querySelector("dialog");
    await act(async () => [...dialog.querySelectorAll("button")].find(item => item.textContent === translate("es", "dialog.delete")).click());
    const deletion = calls.filter(call => call.method === "POST");
    assert.equal(deletion.length, 1);
    assert.deepEqual(deletion[0].body, { action: "delete", assetId: 17 });
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    restore();
  }
});
function Probe() {
  const { t } = useAppLanguage();
  return createElement("section", null, createElement(LanguageSelector),
    createElement("h1", null, t("billing.title")),
    createElement("button", null, t("billing.withdraw")),
    createElement("input", { defaultValue: "Draft" }));
}
test("changing language updates real React consumers, preserves drafts and URLs, and persists the server preference", async () => {
  const { dom, container, restore } = installDom();
  const root = createRoot(container);
  globalThis.__i18nRefreshes = 0;
  try {
    await act(async () => root.render(createElement(AppLanguageProvider, { initialLocale: "en" }, createElement(Probe))));
    const input = container.querySelector("input");
    input.value = "Unsaved customer draft";
    const url = dom.window.location.href;
    for (const locale of ["es", "de", "pt-BR", "en"]) {
      await act(async () => {
        const select = container.querySelector("select");
        select.value = locale;
        select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
      assert.equal(container.querySelector("h1").textContent, translations[locale]["billing.title"]);
      assert.equal(container.querySelector("button").textContent, translations[locale]["billing.withdraw"]);
      assert.equal(container.querySelector("select").value, locale);
      assert.equal(container.querySelector("select").selectedOptions[0].textContent, locale === "pt-BR" ? "pt" : locale);
      assert.equal(dom.window.document.documentElement.lang, locale);
      assert.ok(dom.window.document.cookie.includes(`${LOCALE_COOKIE}=${locale}`));
      assert.equal(container.querySelector("input"), input);
      assert.equal(input.value, "Unsaved customer draft");
      assert.equal(dom.window.location.href, url);
      globalThis.__i18nCookie = locale;
      assert.equal((await getServerI18n()).locale, locale);
    }
    assert.equal(globalThis.__i18nRefreshes, 4);
  } finally {
    await act(async () => root.unmount());
    globalThis.__i18nCookie = undefined;
    restore();
  }
});

test("a persisted Portuguese selection hydrates without reverting to English or reporting mismatches", async () => {
  const element = createElement(AppLanguageProvider, { initialLocale: "pt-BR" }, createElement(Probe));
  const html = renderToString(element);
  assert.ok(html.includes(translations["pt-BR"]["billing.title"]));
  const { container, restore } = installDom(html);
  const errors = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(container, element, { onRecoverableError: error => errors.push(error.message) }); });
    assert.deepEqual(errors, []);
    assert.equal(container.querySelector("select").value, "pt-BR");
    assert.equal(container.querySelector("h1").textContent, translations["pt-BR"]["billing.title"]);
  } finally {
    if (root) await act(async () => root.unmount());
    restore();
  }
});
