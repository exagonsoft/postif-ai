import "./register-ts.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { act, createElement, forwardRef } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";

globalThis.__sidebarReact = { createElement, forwardRef };
globalThis.__sidebarPathname = "/app/studio";
const router = { refresh() {}, push() {}, replace() {} };
globalThis.__sidebarRouter = router;
registerHooks({
  resolve(specifier, context, next) {
    const sources = {
      "next/navigation": `export function useRouter(){return globalThis.__sidebarRouter;}
        export function usePathname(){return globalThis.__sidebarPathname;}`,
      "next/link": `export default function Link({href,children,onClick,...props}){
        return globalThis.__sidebarReact.createElement("a",{...props,href,onClick(event){event.preventDefault();onClick?.(event);}},children);
      }`,
      "framer-motion": `const {createElement,forwardRef}=globalThis.__sidebarReact;
        const components=new Map();
        export const motion=new Proxy({}, {get(target,tag){
          if(!components.has(tag)) components.set(tag,forwardRef(function Motion({initial,animate,exit,transition,layoutId,whileHover,whileTap,...props},ref){
            return createElement(tag,{...props,ref});
          }));
          return components.get(tag);
        }});
        export function AnimatePresence({children}){return children;}`,
    };
    if (Object.hasOwn(sources, specifier)) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(sources[specifier])}` };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/components/BrandLogo.tsx")) return { shortCircuit: true, format: "module",
      source: `export function BrandLogo({href,compact}){return globalThis.__sidebarReact.createElement("a",{href},compact?"Logo":"POSTIF-AI");}` };
    if (url.endsWith("/src/components/MotionPrimitives.tsx")) return { shortCircuit: true, format: "module",
      source: "export const SPRING_SNAPPY={}; export function PulseStatusDot(){return null;}" };
    return next(url, context);
  },
});

const { AppShell } = await import("../src/components/AppShell.tsx");
const { PlatformAdminShell } = await import("../src/components/PlatformAdminShell.tsx");
const { AppLanguageProvider } = await import("../src/i18n/provider.tsx");
const { translate } = await import("../src/i18n/config.ts");

const workspace = { id: 1, name: "Test workspace", planSlug: "free", aiBillingMode: "byok", aiCreditsBalance: 0 };
const cases = [
  { name: "customer", Component: AppShell, navId: "customer-sidebar-navigation", path: "/app/studio",
    props: { user: { id: 1, name: "Test customer", email: "customer@example.test", systemRole: "user" },
      workspace, workspaces: [workspace], activeBrandName: "Test brand", memberRole: "owner",
      notifications: [], pendingApprovalsCount: 3 } },
  { name: "admin", Component: PlatformAdminShell, navId: "platform-sidebar-navigation", path: "/app/admin/catalog",
    props: { user: { name: "Test operator", email: "operator@example.test" } } },
];
function element(scenario, locale = "en") {
  return createElement(AppLanguageProvider, { initialLocale: locale },
    createElement(scenario.Component, scenario.props, createElement("input", { "aria-label": "Unsaved draft", defaultValue: "Draft" })));
}
function installDom(html = "") {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, { url: "https://app.example.test/app" });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return { dom, container: dom.window.document.getElementById("root"), restore() {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  } };
}
const toggle = (container, scenario) => container.querySelector(`button[aria-controls="${scenario.navId}"]`);

for (const scenario of cases) {
  test(`${scenario.name} sidebar switches between labeled and icon-only links, persists preference and preserves drafts`, async () => {
    globalThis.__sidebarPathname = scenario.path;
    const { dom, container, restore } = installDom();
    const root = createRoot(container);
    try {
      await act(async () => root.render(element(scenario)));
      const nav = container.querySelector(`#${scenario.navId}`);
      const links = [...nav.querySelectorAll("a")];
      const paths = links.map(link => link.getAttribute("href"));
      assert.equal(toggle(container, scenario).getAttribute("aria-expanded"), "true");
      for (const link of links) {
        assert.ok(link.querySelector("svg"), "Each entry must have an icon.");
        assert.ok(link.textContent.trim(), "Each entry must retain an accessible label.");
      }
      assert.equal(nav.querySelector('[aria-current="page"]').getAttribute("href"), scenario.path);
      const draft = container.querySelector("input");
      draft.value = "Unsaved customer draft";
      await act(async () => toggle(container, scenario).click());
      assert.equal(toggle(container, scenario).getAttribute("aria-expanded"), "false");
      assert.equal(dom.window.localStorage.getItem("postifai-sidebar-mode"), "icons");
      for (const link of nav.querySelectorAll("a")) {
        assert.ok(link.title);
        assert.ok(link.querySelector('span[class*="sr-only"]'));
      }
      assert.deepEqual([...nav.querySelectorAll("a")].map(link => link.getAttribute("href")), paths);
      assert.equal(nav.querySelector('[aria-current="page"]').getAttribute("href"), scenario.path);
      assert.equal(container.querySelector("input"), draft);
      assert.equal(draft.value, "Unsaved customer draft");
      if (scenario.name === "customer") {
        const switcher = container.querySelector('button[aria-controls="workspace-switcher-options"]');
        await act(async () => switcher.click());
        assert.ok(container.querySelector("#workspace-switcher-options").classList.contains("w-64"));
        assert.ok(nav.querySelector('a[href="/app/posts"]').textContent.includes("3"));
        await act(async () => container.querySelector(`button[aria-label="${translate("en", "common.openMenu")}"]`).click());
        const mobileNav = [...container.querySelectorAll("nav")].find(candidate => candidate !== nav);
        assert.ok(mobileNav);
        assert.ok([...mobileNav.querySelectorAll("a span")].every(span => !span.classList.contains("sr-only")));
      } else {
        assert.ok([...nav.querySelectorAll("a span")].every(span => span.classList.contains("lg:sr-only")), "Mobile admin labels must stay visible.");
      }
      await act(async () => toggle(container, scenario).click());
      assert.equal(dom.window.localStorage.getItem("postifai-sidebar-mode"), "labels");
      assert.equal(toggle(container, scenario).getAttribute("aria-expanded"), "true");
      assert.ok([...nav.querySelectorAll("a span")].every(span => !span.className.includes("sr-only")));
    } finally { await act(async () => root.unmount()); restore(); }
  });
}

test("saved compact mode hydrates both shells without mismatches and honors preference changes from another tab", async () => {
  for (const scenario of cases) {
    globalThis.__sidebarPathname = scenario.path;
    const tree = element(scenario);
    const html = renderToString(tree);
    const { dom, container, restore } = installDom(html);
    dom.window.localStorage.setItem("postifai-sidebar-mode", "icons");
    const errors = [];
    let root;
    try {
      await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error.message) }); });
      assert.deepEqual(errors, []);
      assert.equal(toggle(container, scenario).getAttribute("aria-expanded"), "false");
      await act(async () => {
        dom.window.localStorage.setItem("postifai-sidebar-mode", "labels");
        dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "postifai-sidebar-mode", newValue: "labels" }));
      });
      assert.equal(toggle(container, scenario).getAttribute("aria-expanded"), "true");
    } finally { if (root) await act(async () => root.unmount()); restore(); }
  }
});

test("sidebar controls and compact link labels use every supported language", async () => {
  const scenario = cases[1];
  globalThis.__sidebarPathname = scenario.path;
  for (const locale of ["en", "es", "de", "pt-BR"]) {
    const { container, restore } = installDom();
    const root = createRoot(container);
    try {
      await act(async () => root.render(element(scenario, locale)));
      assert.equal(toggle(container, scenario).getAttribute("aria-label"), translate(locale, "common.sidebarIconsOnly"));
      await act(async () => toggle(container, scenario).click());
      assert.equal(toggle(container, scenario).getAttribute("aria-label"), translate(locale, "common.sidebarShowLabels"));
      assert.equal(container.querySelector('nav a[href="/app/admin/catalog"]').title, translate(locale, "common.admin.catalog"));
    } finally { await act(async () => root.unmount()); restore(); }
  }
});
