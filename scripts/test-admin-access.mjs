import "./register-ts.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { act, cloneElement, createElement, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { PassThrough, Writable } from "node:stream";
import { createOperatorPrompts } from "./operator-prompts.mjs";

const navigation = `export function redirect(destination) {const error = new Error("Redirect");error.destination=destination;throw error;}
  export function notFound(){const error=new Error("Not found");error.status=404;throw error;}
  export function useRouter(){return {replace(){},push(){},refresh(){globalThis.__adminRefreshes=(globalThis.__adminRefreshes||0)+1;}};} export function usePathname(){return "/app/admin";}`;
const headers = `export async function cookies(){return {
  get(key){const value=globalThis.__adminCookies.get(key);return value ? {value} : undefined;},
  set(key,value){globalThis.__adminCookies.set(key,value);},
  delete(key){globalThis.__adminCookies.delete(key);}
};}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation" || specifier === "next/headers") {
      return { url: `data:text/javascript,${encodeURIComponent(specifier === "next/navigation" ? navigation : headers)}`, shortCircuit: true };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "next/link") return { url: "data:text/javascript,export default function Link({children}){return children;}", shortCircuit: true };
    if (specifier.startsWith("@/") || specifier.startsWith(".") && /\.tsx?$/.test(context.parentURL || "")) {
      const target = specifier.startsWith("@/") ? path.resolve("src", specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL));
      const file = [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")].find(file => /\.tsx?$/.test(file) && existsSync(file));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    for (const name of ["AppShell", "VerifyEmailNotice", "AdminConsoleClient"]) {
      if (url.endsWith(`/src/components/${name}.tsx`)) return { format: "module", shortCircuit: true, source: `export function ${name}(){return null;}` };
    }
    if (url.endsWith("/src/components/BrandLogo.tsx")) return { format: "module", shortCircuit: true, source: 'export function BrandLogo(){return "POSTIF-AI";}' };
    if (url.endsWith("/src/components/ThemeProvider.tsx")) return { format: "module", shortCircuit: true, source: 'export function useTheme(){return {theme:"dark",toggleTheme(){}};}' };
    if (url.endsWith("/src/components/ToastProvider.tsx")) return { format: "module", shortCircuit: true, source: "export function useToast(){return {toast(...args){globalThis.__adminToasts?.push(args);}};}" };
    if (url.endsWith("/src/lib/account-email.ts")) return { format: "module", shortCircuit: true, source: "export async function requestAccountEmail(){throw new Error('Unexpected email operation');}export async function completeAccountAction(){throw new Error('Unexpected account action');}" };
    if (url.endsWith(".tsx") && !url.includes("node_modules")) return {
      format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});

const { db } = await import("../src/db/index.ts");
const { users, workspaces, brands, auditLogs, featureFlags } = await import("../src/db/schema.ts");
const { hashPassword, verifyPassword } = await import("../src/lib/crypto.ts");
const { createPlatformOperator } = await import("../src/lib/operator-accounts.ts");
const { resolveLoginRedirect } = await import("../src/lib/login-redirect.ts");
const { getAuthContext } = await import("../src/lib/auth.ts");
const authRoute = await import("../src/app/api/auth/route.ts");
const adminRoute = await import("../src/app/api/admin/route.ts");
const catalogRoute = await import("../src/app/api/admin/catalog/route.ts");
const remoteCatalogRoute = await import("../src/app/api/admin/catalog/paypal/route.ts");
const { default: applicationLayout } = await import("../src/app/app/layout.tsx");
const { default: dashboard } = await import("../src/app/app/page.tsx");
const { default: onboarding } = await import("../src/app/onboarding/page.tsx");
const { default: adminPage } = await import("../src/app/app/admin/page.tsx");
const { default: adminSection } = await import("../src/app/app/admin/[section]/page.tsx");
const { default: adminDetail } = await import("../src/app/app/admin/[section]/[id]/page.tsx");
const { PlatformAdminShell } = await import("../src/components/PlatformAdminShell.tsx");
const { CatalogPlanCard } = await import("../src/components/CatalogPlanCard.tsx");
const { PayPalSetupForm } = await import("../src/components/PayPalSetupForm.tsx");
const { PayPalPlanNameUpdate } = await import("../src/components/PayPalPlanNameUpdate.tsx");
const { CatalogSourceComparison } = await import("../src/components/CatalogSourceComparison.tsx");
const { BillingCatalogAdmin } = await import("../src/components/BillingCatalogAdmin.tsx");
const { CatalogBlockControls } = await import("../src/components/CatalogBlockControls.tsx");
const { BillingClient } = await import("../src/components/BillingClient.tsx");
const { SUBSCRIPTION_PLANS } = await import("../src/lib/plans.ts");
const { AppLanguageProvider } = await import("../src/i18n/provider.tsx");
const { translate } = await import("../src/i18n/config.ts");
function renderToStaticMarkup(element) {
  return renderMarkup(createElement(AppLanguageProvider, { initialLocale: "en" }, element));
}
async function resolveServerElements(element) {
  if (Array.isArray(element)) return Promise.all(element.map(resolveServerElements));
  if (!isValidElement(element)) return element;
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction") {
    return resolveServerElements(await element.type(element.props));
  }
  return cloneElement(element, {}, await resolveServerElements(element.props.children));
}

for (const scenario of ["busy-then-success", "always-busy", "binding-conflict"]) {
  test(`billing refresh handles ${scenario} with bounded retries only for lease contention`, async t => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://app.example.test/app/billing" });
    const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const timers = [], requests = [];
    t.mock.method(dom.window, "setTimeout", callback => { timers.push(callback); return timers.length; });
    t.mock.method(globalThis, "fetch", async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (scenario === "binding-conflict") return Response.json({ error: "Purchase binding mismatch" }, { status: 409 });
      if (scenario === "busy-then-success" && requests.length > 1) return Response.json({ message: "Refreshed" });
      return Response.json({ error: "Another billing operation is in progress.", code: "BILLING_BUSY" }, { status: 409 });
    });
    globalThis.__adminRefreshes = 0;
    globalThis.__adminToasts = [];
    const root = createRoot(dom.window.document.getElementById("root"));
    try {
      await act(async () => root.render(createElement(AppLanguageProvider, { initialLocale: "en" }, createElement(BillingClient, {
        plans: [], currentPlanSlug: "free", currentPlanVersionId: null, billingCycle: "monthly", aiBillingMode: "byok",
        creditsBalance: 0, creditsAllowance: 0, keyLast4: null, keyValidated: false, preferredModel: "gpt-4o-mini", usageRecords: [],
        subscription: { status: "APPROVAL_PENDING", paidThrough: null, cancelAtPeriodEnd: false, hasCustomer: true,
          canChange: false, pendingPlanSlug: "starter_ai", pendingInterval: "month", pendingEffectiveAt: null },
        billingReady: true, billingMissing: [], isOwner: true, allowsConfigurableAiMode: false, defaultAiMode: "byok",
      }))));
      const button = [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === translate("en", "billing.refresh"));
      assert.ok(button);
      await act(async () => button.click());
      assert.equal(button.disabled, timers.length > 0);
      for (let attempt = 0; timers.length && attempt < 4; attempt++) await act(async () => timers.shift()());
      assert.equal(requests.length, scenario === "always-busy" ? 4 : scenario === "busy-then-success" ? 2 : 1);
      assert.ok(requests.every(request => request.url === "/api/billing" && request.body.action === "refresh_subscription"));
      assert.equal(timers.length, 0);
      assert.equal(button.disabled, false);
      assert.equal(globalThis.__adminRefreshes, scenario === "busy-then-success" ? 1 : 0);
      assert.equal(globalThis.__adminToasts.length, 1);
      if (scenario !== "busy-then-success") assert.equal(globalThis.__adminToasts[0][2], "error");
    } finally {
      await act(async () => root.unmount());
      delete globalThis.__adminToasts;
      delete globalThis.__adminRefreshes;
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      dom.window.close();
    }
  });
}
test("Free exposes local checkout withdrawal to owners even when PayPal billing is disabled", () => {
  const props = {
    plans: [{ ...SUBSCRIPTION_PLANS.free, catalogVersionId: 1 }],
    currentPlanSlug: "free", currentPlanVersionId: 1, billingCycle: "monthly",
    aiBillingMode: "byok", creditsBalance: 0, creditsAllowance: 0,
    keyLast4: null, keyValidated: false, preferredModel: "gpt-4o-mini", usageRecords: [],
    subscription: { status: "APPROVAL_PENDING", paidThrough: null, cancelAtPeriodEnd: false,
      hasCustomer: true, canChange: false, pendingPlanSlug: "starter_ai", pendingInterval: "month", pendingEffectiveAt: null },
    billingReady: false, billingMissing: [], isOwner: true, allowsConfigurableAiMode: false, defaultAiMode: "byok",
  };
  for (const isOwner of [true, false]) {
    const html = renderToStaticMarkup(createElement(BillingClient, { ...props, isOwner }));
    const buttons = html.match(/<button[^>]*>Stay on Free \/ withdraw checkout<\/button>/g);
    assert.equal(buttons?.length, 2, "Both the summary and the Free card must expose withdrawal.");
    assert.ok(buttons.every(button => /\sdisabled(?:=|\s|>)/.test(button) === !isOwner));
    const summary = html.slice(0, html.indexOf("Dimension 1:"));
    assert.match(summary, /Stay on Free \/ withdraw checkout/, "Withdrawal must be visible before AI settings, not buried in the plan grid.");
    assert.match(summary, /is already active\. No PayPal approval is required for Free/);
    assert.match(summary, /PayPal paid subscription status/);
    assert.match(summary, /You remain on Free until payment is verified/);
    assert.doesNotMatch(summary, /Manage automatic payments|Same-product plan changes/);
  }
  const settled = renderToStaticMarkup(createElement(BillingClient, { ...props,
    currentPlanSlug: "starter_ai", subscription: { ...props.subscription, status: "ACTIVE", pendingPlanSlug: null },
  }));
  assert.match(settled, /Manage automatic payments in PayPal/);
  assert.doesNotMatch(settled, /Stay on Free \/ withdraw checkout/);
});

function planCardProps() {
  return {
    plan: { id: 7, slug: "starter_byok", productId: 3, revision: 1, archived: false,
      publishingVersionId: null, currentVersions: {}, draft: SUBSCRIPTION_PLANS.starter_byok },
    product: { id: 3, name: "POSTIF-AI", revision: 1, archived: false, publishingVersionId: null },
    environment: "sandbox", busy: false, publishing: false,
    onPublish() { throw new Error("Rendering must not publish"); },
    onEdit() {}, onArchive() {},
  };
}
function publicationButton(html) {
  const button = html.match(/<button[^>]*aria-describedby="catalog-plan-7-publication-help"[^>]*>/)?.[0];
  assert.ok(button, "Plan card must expose a named publication button associated with its explanation.");
  return button;
}

test("bulk visibility actions repeatedly toggle every nested disclosure in the catalog without replacing its content", () => {
  const form = { value: "Unsaved plan name" }, loadedRecords = { id: "P-MONTH", name: "Loaded PayPal name" };
  const blocks = [{ open: false, form }, { open: true, loadedRecords }, { open: false }];
  const outsideCatalog = { open: false };
  let queries = 0;
  const containerRef = { current: null };
  let controls;
  renderToStaticMarkup(createElement(function CaptureControls() {
    controls = CatalogBlockControls({ containerRef });
    return controls;
  }));
  const expand = controls.props.children.find(button => button.props.children === "Expand all");
  const collapse = controls.props.children.find(button => button.props.children === "Collapse all");
  assert.doesNotThrow(() => expand.props.onClick(), "Unmounted catalog refs must be safe.");
  containerRef.current = { querySelectorAll(selector) { queries++; assert.equal(selector, "details"); return blocks; } };
  assert.equal(queries, 0, "Rendering visibility controls must not change anything.");
  expand.props.onClick();
  assert.ok(blocks.every(block => block.open));
  blocks[1].open = false;
  expand.props.onClick();
  assert.ok(blocks.every(block => block.open), "Expand all must work again after manually collapsing one nested block.");
  collapse.props.onClick();
  collapse.props.onClick();
  assert.ok(blocks.every(block => !block.open));
  assert.equal(outsideCatalog.open, false);
  assert.equal(blocks[0].form, form);
  assert.equal(form.value, "Unsaved plan name");
  assert.equal(blocks[1].loadedRecords, loadedRecords);
});
test("catalog groups forms, plans, records and history into native disclosure blocks with global visibility controls", () => {
  const { plan, product, environment } = planCardProps();
  const version = { id: 8, planId: plan.id, environment, status: "published", definition: plan.draft, draftRevision: 1, productRevision: 1,
    paypalProductId: "POSTIF-AI", paypalMonthPlanId: "P-MONTH", paypalYearPlanId: "P-YEAR", paypalMonthName: "Monthly", paypalYearName: "Yearly",
    monthPaymentPolicy: null, yearPaymentPolicy: null, nameUpdatePending: false, syncStatus: "verified", syncCheckedAt: null };
  const initialCatalog = { environment, readAt: "2026-11-16T19:00:00.000Z",
    billing: { enabled: false, missing: [], invalid: [] }, products: [{ ...product, slug: "postif-ai", description: "Product", paypalProductIds: { sandbox: "POSTIF-AI" } }],
    plans: [{ ...plan, currentVersions: { sandbox: version.id } }], versions: [version] };
  const html = renderToStaticMarkup(createElement(BillingCatalogAdmin, { initialCatalog })).replace(/<!--.*?-->/g, "");
  const firstDisclosure = html.indexOf("<details");
  assert.ok(html.indexOf(">Expand all</button>") < firstDisclosure, "Bulk controls must stay visible when every block is collapsed.");
  assert.ok(html.indexOf(">Collapse all</button>") < firstDisclosure);
  assert.match(html, /aria-label="Catalog block visibility"/);
  for (const summary of ["Catalog status, connection and help", "Subscription plans (1)", "MongoDB / PayPal records", "Version history and saved PayPal IDs", "Create a MongoDB plan draft", "Manage local product drafts", "Existing PayPal sandbox products and plans"]) {
    assert.ok([...html.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].some(([, content]) => content.includes(summary)), `${summary} must be independently collapsible`);
  }
  assert.match(html, /<article[^>]*aria-label="Starter BYOK plan"[^>]*><details><summary/);
  const planStart = html.indexOf('aria-label="Starter BYOK plan"');
  const planSummaryEnd = html.indexOf("</summary>", planStart);
  assert.ok(html.indexOf("USD 9.00 / month", planStart) < planSummaryEnd, "Collapsed plan summaries must retain prices and status.");
  assert.ok(html.indexOf("Published mapping - Sandbox", planStart) < planSummaryEnd);
  assert.ok(html.indexOf('aria-label="Edit draft for Starter BYOK"', planStart) > planSummaryEnd, "Actions must not be nested in the summary toggle.");
  assert.match(html, /<summary[^>]*>Version 8/);
  assert.match(html, /<textarea[^>]*name="description"[^>]*>/, "Closed disclosure blocks must keep form controls mounted.");
  const descriptions = html.match(/<textarea[^>]*name="description"[^>]*>/g);
  assert.equal(descriptions.length, 3, "Draft, published plan and product descriptions must all be multiline.");
  for (const field of descriptions) {
    assert.match(field, /rows="4"/);
    assert.match(field, /resize-y/);
  }
  assert.equal(descriptions.filter(field => /maxLength="127"/.test(field)).length, 2);
  assert.equal(descriptions.filter(field => /maxLength="256"/.test(field)).length, 1);
  assert.match(html, /aria-label="Update PayPal names and descriptions for version 8"/);
});
test("unlinked paid plan card exposes a named PayPal setup action and explains its scope", () => {
  const html = renderToStaticMarkup(createElement(CatalogPlanCard, planCardProps()));
  assert.match(publicationButton(html), /aria-label="Set up PayPal Sandbox for Starter BYOK"/);
  assert.doesNotMatch(publicationButton(html), /disabled=/);
  assert.match(html, /Not linked locally/);
  assert.match(html, /Choose an existing PayPal product and plans, then create only the missing intervals/);
  assert.match(html, /No payment is taken/);
});
test("PayPal setup requires explicit resource choices and confirmation to replace an incomplete attempt", () => {
  const { plan, environment } = planCardProps();
  const props = { plan, environment, busy: false, onSubmit() { throw new Error("Rendering must not publish"); }, onCancel() {} };
  let html = renderToStaticMarkup(createElement(PayPalSetupForm, props));
  assert.match(html, /Select an existing product or create a new one/);
  assert.match(html, /Create a NEW PayPal product/);
  assert.match(html, /Names alone never establish a link/);
  assert.match(html, /<fieldset disabled/);
  assert.match(html, /<button type="button" class="[^"]*">Cancel setup/);
  html = renderToStaticMarkup(createElement(PayPalSetupForm, { ...props, linkedProductId: "POSTIF-AI", plan: { ...plan, publishingVersionId: 42 } }));
  assert.match(html, /value="POSTIF-AI" selected/);
  assert.match(html, /Monthly.*PayPal plan/);
  assert.match(html, /Annual.*PayPal plan/);
  assert.match(html, /Replace incomplete local attempt #42/);
  assert.match(html, /type="checkbox" required=""/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.doesNotMatch(html, /Create a NEW PayPal product/);
});
test("published details form has editable names/descriptions, previews, exact IDs and required confirmation", () => {
  const version = { id: 8, status: "published", environment: "sandbox", definition: SUBSCRIPTION_PLANS.starter_byok,
    paypalMonthPlanId: "P-MONTH", paypalYearPlanId: "P-YEAR", paypalMonthName: "Starter BYOK", paypalYearName: "Starter BYOK" };
  const props = { version, environment: "sandbox", busy: false, onConfirm() { throw new Error("Rendering must not rename"); } };
  let html = renderToStaticMarkup(createElement(PayPalPlanNameUpdate, props)).replace(/<!--.*?-->/g, "");
  assert.match(html, /Edit published plan name and description/);
  assert.ok(html.includes("POSTIF-AI Starter BYOK \u2014 Monthly"));
  assert.ok(html.includes("POSTIF-AI Starter BYOK \u2014 Yearly"));
  assert.match(html, /P-MONTH/); assert.match(html, /P-YEAR/);
  assert.match(html, /type="checkbox" required=""/);
  const nameInput = html.match(/<input[^>]*name="name"[^>]*>/)?.[0];
  assert.match(nameInput, /required=""/);
  assert.doesNotMatch(nameInput, /disabled/);
  assert.match(html, /name="description" required="" maxLength="127"/);
  assert.match(html, /Save name and description to local \+ PayPal Sandbox/);
  assert.match(html, /Prices, payment policies, IDs and subscriber terms stay unchanged/);
  html = renderToStaticMarkup(createElement(PayPalPlanNameUpdate, { ...props,
    version: { ...version, definition: { ...version.definition, description: "First line.\nSecond line." } } }));
  assert.match(html, /<textarea[^>]*>First line\.\nSecond line\.<\/textarea>/);
  assert.match(html, /Description sent to PayPal: First line\. Second line\./);
  assert.match(html, /line breaks are replaced with spaces/);
  html = renderToStaticMarkup(createElement(PayPalPlanNameUpdate, { ...props, version: { ...version, nameUpdatePending: true, pendingDetails: { name: "Retry name", description: "Retry description" } } }));
  assert.match(html, /Retry incomplete PayPal name and description update/);
  assert.match(html, /value="Retry name"/);
  assert.match(html, /name="description"[^>]*disabled/);
  assert.equal(renderToStaticMarkup(createElement(PayPalPlanNameUpdate, { ...props, environment: "live" })), "");
  assert.equal(renderToStaticMarkup(createElement(PayPalPlanNameUpdate, { ...props, version: { ...version, status: "pending" } })), "");
});
test("source comparison clearly separates MongoDB drafts/saved names from fresh PayPal records and missing resources", () => {
  const { plan, environment } = planCardProps();
  const version = { id: 8, environment, status: "published" };
  const props = { plan, version, environment, mongoReadAt: "2026-11-16T19:00:00.000Z", busy: false, reading: false, onRefresh() { throw new Error("Rendering must not fetch"); } };
  let html = renderToStaticMarkup(createElement(CatalogSourceComparison, props)).replace(/<!--.*?-->/g, "");
  assert.match(html, /Local means the MongoDB database/);
  assert.match(html, /PayPal has not been read for this view/);
  assert.match(html, /Read \/ refresh MongoDB \+ PayPal/);
  assert.match(html, /Base name: Starter BYOK/);
  const saved = { id: "P-MONTH", name: "MongoDB monthly name", description: null, paymentPolicy: null, updatePending: false };
  const comparison = { versionId: 8, environment, checkedAt: "2026-11-16T19:01:00.000Z",
    mongo: { planId: plan.id, revision: plan.revision, currentVersionId: 8, draft: plan.draft, readAt: props.mongoReadAt,
      publication: { status: "published", definition: plan.draft },
      mappings: { product: { id: "POSTIF-AI", name: "MongoDB product", description: "" }, month: saved, year: { ...saved, id: "P-YEAR" } } },
    paypal: { product: { status: "loaded", data: { id: "POSTIF-AI", name: "PayPal product", description: "" } },
      month: { status: "loaded", data: { id: "P-MONTH", name: "Actual PayPal monthly name", description: "Actual provider description", status: "ACTIVE", productId: "POSTIF-AI", paymentPreferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
        cycles: [{ type: "REGULAR", price: { currency_code: "USD", value: "9.00" }, intervalCount: 1, interval: "MONTH", totalCycles: 0 }] } },
      year: { status: "missing", id: "P-YEAR", error: "Stored yearly ID not found in PayPal." } } };
  html = renderToStaticMarkup(createElement(CatalogSourceComparison, { ...props, comparison })).replace(/<!--.*?-->/g, "");
  for (const text of ["Saved in MongoDB", "Read from PayPal", "MongoDB monthly name", "Actual PayPal monthly name", "Actual provider description", "Different from MongoDB", "ACTIVE", "USD 9.00", "Stored yearly ID not found in PayPal.", "Not recorded in MongoDB"]) assert.ok(html.includes(text), text);
  assert.match(html, /current MongoDB mapping/);
  for (const summary of ["Linked product", "Monthly plan", "Yearly plan"]) {
    assert.match(html, new RegExp(`<details[^>]*><summary[^>]*>${summary}</summary>`));
  }
  assert.match(html, /auto_bill_outstanding: true; payment_failure_threshold: 3/);
  assert.doesNotMatch(html, /PayPal has not been read for this view/);
  html = renderToStaticMarkup(createElement(CatalogSourceComparison, { ...props, error: "PayPal read failed." }));
  assert.match(html, /No current PayPal data is being shown/);
  assert.doesNotMatch(html, /Actual PayPal monthly name/);
});
test("published, changed and pending cards distinguish verification, revision publication and in-progress retry", () => {
  const props = planCardProps();
  props.currentVersion = { draftRevision: 1, productRevision: 1 };
  let html = renderToStaticMarkup(createElement(CatalogPlanCard, props));
  assert.match(publicationButton(html), /aria-label="Verify in PayPal Sandbox for Starter BYOK"/);
  assert.match(html, /without creating duplicates/);
  html = renderToStaticMarkup(createElement(CatalogPlanCard, { ...props, plan: { ...props.plan, revision: 2 }, environment: "live" }));
  assert.match(publicationButton(html), /aria-label="Publish revision to PayPal Live for Starter BYOK"/);
  html = renderToStaticMarkup(createElement(CatalogPlanCard, { ...props, plan: { ...props.plan, publishingVersionId: 10 },
    product: { ...props.product, publishingVersionId: 10 }, busy: true, publishing: true }));
  assert.match(publicationButton(html), /aria-label="Retry in PayPal Sandbox for Starter BYOK"/);
  assert.match(publicationButton(html), /disabled=""|disabled/);
  assert.match(publicationButton(html), /aria-busy="true"/);
  assert.match(html, /Processing PayPal setup/);
});
test("free and unavailable plan cards clearly explain local-only and disabled actions", () => {
  const props = planCardProps();
  let html = renderToStaticMarkup(createElement(CatalogPlanCard, { ...props, plan: { ...props.plan, slug: "free", draft: SUBSCRIPTION_PLANS.free } }));
  assert.match(publicationButton(html), /aria-label="Publish locally for Free"/);
  assert.match(html, /No PayPal request is made/);
  assert.doesNotMatch(html, /Create in PayPal/);
  html = renderToStaticMarkup(createElement(CatalogPlanCard, { ...props, plan: { ...props.plan, archived: true } }));
  assert.match(publicationButton(html), /disabled/);
  assert.match(html, /Restore this plan before publishing/);
  html = renderToStaticMarkup(createElement(CatalogPlanCard, { ...props, product: { ...props.product, archived: true } }));
  assert.match(publicationButton(html), /disabled/);
  assert.match(html, /restore the linked local product before publishing/);
});

function fixture(t) {
  const originals = { find: db.find, insert: db.insert, transaction: db.transaction, count: db.count, aggregate: db.aggregate, update: db.update };
  t.after(() => Object.assign(db, originals));
  globalThis.__adminCookies = new Map();
  const tables = new Map(), reads = [], inserts = [];
  let id = 0;
  const rows = model => tables.get(model.name) || (tables.set(model.name, []), tables.get(model.name));
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === "$and") return value.every(part => matches(row, part));
      if (key === "$or") return value.some(part => matches(row, part));
      if (value instanceof RegExp) return value.test(String(row[key] || ""));
      if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
        if (op === "$in") return expected.includes(row[key]);
        if (op === "$gt") return row[key] > expected;
        if (op === "$ne") return row[key] !== expected;
        if (op === "$type") return typeof row[key] === expected;
        throw new Error(`Unexpected filter ${op}`);
      });
      return row[key] === value;
    });
  }
  db.find = async (model, filter = {}, options = {}) => {
    reads.push(model.name);
    let result = rows(model).filter(row => matches(row, filter));
    if (options.skip) result = result.slice(options.skip);
    if (options.limit) result = result.slice(0, options.limit);
    return structuredClone(result);
  };
  db.count = async (model, filter = {}) => rows(model).filter(row => matches(row, filter)).length;
  db.aggregate = async model => { assert.equal(rows(model).length, 0, "Populated aggregation is covered by the isolated MongoDB tests."); return []; };
  db.update = async (model, filter, values) => rows(model).filter(row => matches(row, filter)).map(row => { Object.assign(row, structuredClone(values)); return structuredClone(row); });
  db.insert = async (model, values) => {
    inserts.push(model.name);
    const row = { ...model.defaults(), id: ++id, ...structuredClone(values) };
    rows(model).push(row);
    return [structuredClone(row)];
  };
  db.transaction = async operation => operation(db);
  async function login(systemRole = "operator") {
    await db.insert(users, { name: "Admin Test", email: "admin@example.test", passwordHash: hashPassword("offline-password-only"), systemRole });
    return authRoute.POST(new Request("https://app.example.test/api/auth", {
      method: "POST", body: JSON.stringify({ action: "login", email: "admin@example.test", password: "offline-password-only" }),
    }));
  }
  return { rows, reads, inserts, login };
}

test("trusted operator creation stores only a user with a real password hash and no fabricated verification", async t => {
  const { rows, inserts } = fixture(t);
  await createPlatformOperator({ name: " Platform Admin ", email: " ADMIN@example.test ", password: "offline-password-only" });
  assert.deepEqual(inserts, ["users"]);
  assert.equal(rows(workspaces).length, 0);
  assert.equal(rows(brands).length, 0);
  const user = rows(users)[0];
  assert.equal(user.systemRole, "operator");
  assert.equal(user.email, "admin@example.test");
  assert.equal(user.emailVerified, false);
  assert.ok(verifyPassword("offline-password-only", user.passwordHash));
  assert.notEqual(user.passwordHash, "offline-password-only");
});
test("operator provisioning rejects invalid credentials before database work and never overwrites existing users", async t => {
  const { rows, inserts, reads } = fixture(t);
  await assert.rejects(createPlatformOperator({ name: "Admin", email: "admin@example.test", password: "short" }), /at least 12/);
  assert.equal(reads.length, 0);
  assert.equal(inserts.length, 0);
  await db.insert(users, { name: "Customer", email: "admin@example.test", passwordHash: "unchanged", systemRole: "user" });
  await assert.rejects(createPlatformOperator({ name: "Admin", email: "admin@example.test", password: "offline-password-only" }), /already exists/);
  assert.equal(rows(users)[0].systemRole, "user");
  assert.equal(rows(users)[0].passwordHash, "unchanged");
  assert.equal(inserts.length, 1);
});
test("workspace-free operator login uses a real authenticated session and the platform-only shell", async t => {
  const { rows, reads, login } = fixture(t);
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirectTo, "/app/admin");
  const context = await getAuthContext();
  assert.equal(context.user.systemRole, "operator");
  assert.equal(context.workspace, null);
  const shell = await applicationLayout({ children: "Operator content" });
  assert.equal(shell.type, PlatformAdminShell);
  const html = renderToStaticMarkup(shell);
  assert.match(html, /Platform Admin Console/);
  assert.doesNotMatch(html, /workspace selector|branding onboarding|credits/i);
  assert.equal(rows(workspaces).length, 0);
  assert.ok(!reads.includes("notifications") && !reads.includes("posts"));
  await adminPage();
});
test("operators bypass customer dashboard and either onboarding mode before any branding operations", async t => {
  const { login } = fixture(t);
  await login();
  const redirectsToAdmin = error => error.destination === "/app/admin";
  await assert.rejects(dashboard(), redirectsToAdmin);
  await assert.rejects(onboarding({ searchParams: Promise.resolve({}) }), redirectsToAdmin);
  await assert.rejects(onboarding({ searchParams: Promise.resolve({ mode: "create" }) }), redirectsToAdmin);
});
test("existing operator-owned workspaces are preserved but are not required by the admin shell", async t => {
  const { rows, login } = fixture(t);
  await login();
  const [workspace] = await db.insert(workspaces, { name: "Existing tenant", slug: "existing", ownerId: rows(users)[0].id });
  await db.insert(brands, { workspaceId: workspace.id, name: "Existing brand" });
  const shell = await applicationLayout({ children: "Admin" });
  assert.equal(shell.type, PlatformAdminShell);
  assert.equal(rows(workspaces).length, 1);
  assert.equal(rows(brands).length, 1);
});
test("missing sessions and ordinary workspace-free accounts cannot enter platform administration", async t => {
  const { login } = fixture(t);
  await assert.rejects(applicationLayout({ children: null }), error => error.destination === "/login");
  const response = await login("user");
  assert.equal((await response.json()).redirectTo, "/app");
  await assert.rejects(applicationLayout({ children: null }), error => error.destination === "/login");
  await assert.rejects(adminPage(), error => error.destination === "/app");
});
test("public registration preserves customer workspace/branding and ignores attempted platform promotion", async t => {
  const { rows } = fixture(t);
  const response = await authRoute.POST(new Request("https://app.example.test/api/auth", {
    method: "POST", body: JSON.stringify({ action: "register", name: "Customer", email: "customer@example.test",
      password: "offline-password-only", systemRole: "operator" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirectTo, "/onboarding");
  assert.equal(rows(users)[0].systemRole, "user");
  assert.equal(rows(workspaces).length, 1);
  assert.equal(rows(brands).length, 1);
});
test("operator destinations override customer return links without permitting arbitrary redirects", () => {
  assert.equal(resolveLoginRedirect("/app/admin", "/onboarding?mode=create"), "/app/admin");
  assert.equal(resolveLoginRedirect("/app", "/onboarding"), "/onboarding");
  assert.equal(resolveLoginRedirect("/app", "/onboarding?mode=create"), "/onboarding?mode=create");
  assert.equal(resolveLoginRedirect("/app", "https://untrusted.example.test"), "/app");
});
function adminRequest(body) {
  return new Request("https://app.example.test/api/admin", { method: "POST", body: JSON.stringify(body) });
}
test("anonymous users and ordinary accounts cannot create platform administrators", async t => {
  const { rows, login } = fixture(t);
  const body = { action: "create_admin", name: "Staff", email: "staff@example.test", password: "offline-password-only" };
  assert.equal((await adminRoute.POST(adminRequest(body))).status, 403);
  await login("user");
  assert.equal((await adminRoute.POST(adminRequest(body))).status, 403);
  assert.equal(rows(users).length, 1);
  assert.equal(rows(auditLogs).length, 0);
});
test("internal directories and administrator form require platform access and reject unknown routes", async t => {
  const { login } = fixture(t);
  const props = { params: Promise.resolve({ section: "admins" }), searchParams: Promise.resolve({}) };
  await assert.rejects(adminSection(props), error => error.destination === "/app");
  await login();
  const html = renderToStaticMarkup(await resolveServerElements(await adminSection(props)));
  assert.match(html, /Create an ExagonSoft administrator/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /passwordHash|offline-password-only/);
  await assert.rejects(adminSection({ ...props, params: Promise.resolve({ section: "unknown" }) }), error => error.status === 404);
  await assert.rejects(adminDetail({ params: Promise.resolve({ section: "admins", id: "bad" }) }), error => error.status === 404);
});
test("PayPal catalog verification routes authorize first and reject invalid or duplicate identifiers", async t => {
  const { login } = fixture(t);
  const request = query => new Request(`https://app.example.test/api/admin/catalog?${query}`);
  assert.equal((await catalogRoute.GET(request("checkConnection=true"))).status, 403);
  assert.equal((await catalogRoute.GET(request("readVersionId=1"))).status, 403);
  await login();
  for (const query of ["checkConnection=false", "verifyVersionId=1&verifyVersionId=2", "verifyVersionId=invalid", "checkConnection=true&verifyVersionId=1", "readVersionId=invalid", "readVersionId=1&readVersionId=2", "readVersionId=1&verifyVersionId=1", "readVersionId=0"]) {
    assert.equal((await catalogRoute.GET(request(query))).status, 400);
  }
  assert.equal((await catalogRoute.GET(request("verifyVersionId=999"))).status, 404);
  const response = await catalogRoute.GET(request(""));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("remote PayPal catalog is admin-only and rejects malformed paging before contacting PayPal", async t => {
  const { login, inserts } = fixture(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected external call"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const request = query => new Request(`https://app.example.test/api/admin/catalog/paypal?${query}`);
  assert.equal((await remoteCatalogRoute.GET(request("kind=products"))).status, 403);
  await login("user");
  assert.equal((await remoteCatalogRoute.GET(request("kind=plans"))).status, 403);
  globalThis.__adminCookies.clear();
  await createPlatformOperator({ name: "Operator", email: "operator@example.test", password: "offline-password-only" });
  await authRoute.POST(new Request("https://app.example.test/api/auth", { method: "POST",
    body: JSON.stringify({ action: "login", email: "operator@example.test", password: "offline-password-only" }) }));
  for (const query of ["", "kind=unknown", "kind=products&page=0", "kind=products&page=100001", "kind=products&page=1&page=2",
    "kind=products&id=PROD-TEST", "kind=plans&id=P-TEST&page=1", "kind=plans&id=../bad", "kind=plans&secret=anything",
    "kind=products&source=mirror"]) {
    const response = await remoteCatalogRoute.GET(request(query));
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  const configuration = { PAYPAL_ENVIRONMENT: "sandbox", PAYPAL_CLIENT_ID: `offline-${crypto.randomUUID()}`, PAYPAL_CLIENT_SECRET: "offline-secret" };
  const originalEnv = Object.fromEntries(Object.keys(configuration).map(key => [key, process.env[key]]));
  Object.assign(process.env, configuration);
  t.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const previousInserts = inserts.length, providerCalls = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    providerCalls.push({ path, method: options.method });
    if (path === "/v1/oauth2/token") return Response.json({ access_token: "offline-token", expires_in: 3600 });
    return Response.json({ products: [{ id: "PROD-EXTERNAL", name: "Existing PayPal product", privateState: "provider-private-marker" }], total_items: 1 });
  };
  const response = await remoteCatalogRoute.GET(request("kind=products"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const result = await response.json();
  assert.equal(result.items[0].name, "Existing PayPal product");
  assert.doesNotMatch(JSON.stringify(result), /privateState|provider-private-marker|offline-secret/);
  assert.equal(inserts.length, previousInserts);
  assert.ok(providerCalls.every(call => call.path === "/v1/oauth2/token" || call.method === "GET"));
});
test("selected-plan publication rejects anonymous/customer requests before provider operations", async t => {
  const { login } = fixture(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected provider operation"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const request = action => new Request("https://app.example.test/api/admin/catalog", {
    method: "POST", body: JSON.stringify({ action, id: 1, revision: 1, ...(action === "use_paypal_setup" ? { setup: { productId: "POSTIF-AI" } } : {}) }),
  });
  for (const action of ["publish_plan", "use_paypal_setup", "rename_paypal_plans", "update_plan_details"]) assert.equal((await catalogRoute.POST(request(action))).status, 403);
  await login("user");
  for (const action of ["publish_plan", "use_paypal_setup", "rename_paypal_plans", "update_plan_details"]) assert.equal((await catalogRoute.POST(request(action))).status, 403);
});
test("administrator catalog publication accepts a selected plan, not bulk or queued actions", async t => {
  const { login } = fixture(t);
  await login();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected provider operation"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const body of [
    { action: "publish_plan", id: [1, 2], revision: 1 },
    { action: "publish_plan", id: 1, revision: 1, all: true },
    { action: "publish_all" },
    { action: "approve_publication", id: 1, revision: 1 },
    { action: "use_paypal_setup", id: 1, revision: 1, setup: { productId: "POSTIF-AI", all: true } },
    { action: "use_paypal_setup", id: 1, revision: 1, setup: { monthPlanId: "../invalid" } },
    { action: "rename_paypal_plans", versionId: 1 },
    { action: "rename_paypal_plans", versionId: 1, confirm: false },
    { action: "rename_paypal_plans", versionId: 1, confirm: true, name: "Arbitrary client name" },
    { action: "update_plan_details", versionId: 1, revision: 1, name: "New name", description: "New description" },
    { action: "update_plan_details", versionId: 1, revision: 1, name: "New name", description: "", confirm: true },
    { action: "update_plan_details", versionId: 1, revision: 1, name: "New name", description: "New description", confirm: true, monthlyPrice: 1 },
  ]) {
    const response = await catalogRoute.POST(new Request("https://app.example.test/api/admin/catalog", {
      method: "POST", body: JSON.stringify(body),
    }));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});
test("authenticated administrators create account-only staff with a safe response and audit trail", async t => {
  const { rows, login } = fixture(t);
  await login();
  const body = { action: "create_admin", name: "Staff", email: "staff@example.test", password: "offline-password-only" };
  const response = await adminRoute.POST(adminRequest(body));
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(await response.json()).sort(), ["id", "ok"]);
  assert.equal(rows(users)[1].systemRole, "operator");
  assert.ok(verifyPassword(body.password, rows(users)[1].passwordHash));
  assert.equal(rows(workspaces).length, 0);
  assert.equal(rows(brands).length, 0);
  assert.equal(rows(auditLogs)[0].action, "admin.administrator_created");
  assert.equal(rows(auditLogs)[0].workspaceId, null);
  assert.doesNotMatch(JSON.stringify(rows(auditLogs)), /offline-password-only|passwordHash/);
  assert.equal((await adminRoute.POST(adminRequest(body))).status, 409);
  assert.equal((await adminRoute.POST(adminRequest({ ...body, email: "other@example.test", systemRole: "operator" }))).status, 400);
  assert.equal((await adminRoute.POST(adminRequest({ ...body, email: "other@example.test", password: "short" }))).status, 400);
  assert.equal(rows(users).length, 2);
});
test("flag writes reject string booleans, missing flags and stale states instead of claiming success", async t => {
  const { rows, login } = fixture(t);
  await login();
  const [flag] = await db.insert(featureFlags, { key: "test_registry", name: "Registry", description: "No runtime consumer" });
  const body = { action: "toggle_flag", flagId: flag.id, enabled: false, expectedEnabled: true };
  assert.equal((await adminRoute.POST(adminRequest({ ...body, enabled: "false" }))).status, 400);
  assert.equal((await adminRoute.POST(adminRequest({ ...body, flagId: 999 }))).status, 404);
  assert.equal((await adminRoute.POST(adminRequest(body))).status, 200);
  assert.equal(rows(featureFlags)[0].enabled, false);
  assert.equal(rows(auditLogs).length, 1);
  assert.equal((await adminRoute.POST(adminRequest(body))).status, 409);
  assert.equal(rows(auditLogs).length, 1);
});
function promptFixture(t) {
  const input = new PassThrough(), chunks = [];
  input.isTTY = true;
  input.setRawMode = () => {};
  const output = new Writable({ write(chunk, encoding, done) { chunks.push(chunk.toString()); done(); } });
  output.isTTY = true;
  output.columns = 80;
  const prompts = createOperatorPrompts(input, output);
  t.after(() => { prompts.close(); input.end(); output.end(); });
  return { input, prompts, text: () => chunks.join("") };
}
test("readline repaint keeps administrator prompts visible and never echoes or recalls hidden passwords", async t => {
  const { input, prompts, text } = promptFixture(t);
  const name = prompts.question("Administrator name: ");
  assert.match(text().split("\x1b[0J").at(-1), /Administrator name: /);
  input.write("Test Administrator\r");
  assert.equal(await name, "Test Administrator");
  const password = prompts.question("Password (at least 12 characters): ", true);
  assert.match(text().split("\x1b[0J").at(-1), /Password \(at least 12 characters\): /);
  input.write("hidden-synthetic-password\r");
  assert.equal(await password, "hidden-synthetic-password");
  assert.doesNotMatch(text(), /hidden-synthetic-password/);
  const confirmation = prompts.question("Confirm: ");
  input.write("\x1b[A");
  assert.doesNotMatch(text(), /hidden-synthetic-password/);
  input.write("CONFIRM\r");
  assert.equal(await confirmation, "CONFIRM");
});
test("Ctrl+C cancels a pending administrator prompt rather than leaving the command waiting", async t => {
  const { input, prompts } = promptFixture(t);
  const answer = prompts.question("Administrator name: ");
  input.write("\x03");
  await assert.rejects(answer, error => error.name === "AbortError");
});
