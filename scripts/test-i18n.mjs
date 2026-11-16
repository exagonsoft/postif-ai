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
