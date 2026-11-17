import "./register-ts.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";

globalThis.__legalLocale = undefined;
globalThis.__legalRouter = { refresh() {} };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/headers") return { shortCircuit: true,
      url: `data:text/javascript,${encodeURIComponent(`export async function cookies(){return {get(name){
        if(name!=="postif_locale") throw new Error("Legal pages must not require authentication cookies");
        return globalThis.__legalLocale ? {value:globalThis.__legalLocale} : undefined;
      }}}`)}` };
    if (specifier === "next/navigation") return { shortCircuit: true,
      url: "data:text/javascript,export function useRouter(){return globalThis.__legalRouter;}" };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/db/index.ts") || url.endsWith("/src/lib/auth.ts")) {
      throw new Error("Public legal rendering must not load account authorization or the database.");
    }
    return next(url, context);
  },
});

const { LegalDocument } = await import("../src/components/LegalDocument.tsx");
const { LEGAL_DOCUMENTS } = await import("../src/lib/legal-content.ts");
const { AppLanguageProvider } = await import("../src/i18n/provider.tsx");
const { LOCALES, LOCALE_COOKIE } = await import("../src/i18n/locale.ts");
const { translate, translations } = await import("../src/i18n/config.ts");
const routes = {
  privacy: await import("../src/app/privacy/page.tsx"),
  terms: await import("../src/app/terms/page.tsx"),
  dataDeletion: await import("../src/app/data-deletion/page.tsx"),
};
const email = "mailto:exagonsoft@exagonsoft.uk";

function assertLegalMarkup(document, kind, locale) {
  const article = document.querySelector("main article");
  assert.ok(article, "Legal content must be in the public main landmark.");
  assert.equal(article.lang, locale);
  assert.equal(article.querySelectorAll("h1").length, 1);
  assert.equal(article.querySelector("h1").textContent, translate(locale, `legal.${kind}.title`));
  assert.equal(article.querySelectorAll("form,input,textarea").length, 0, "Requests must not collect passwords or credentials in a form.");
  assert.ok(article.querySelector(`a[href="${email}"]`), "The email contact must be actionable.");
  assert.equal(article.querySelectorAll("section[id]").length, LEGAL_DOCUMENTS[kind].sections.length);
  for (const section of LEGAL_DOCUMENTS[kind].sections) {
    const node = article.querySelector(`#${kind}-${section}`);
    assert.ok(node, `Missing ${locale}/${kind}/${section}`);
    assert.equal(node.querySelector("h2").textContent, translate(locale, `legal.${kind}.${section}.title`));
    assert.equal(node.querySelector("p").textContent, translate(locale, `legal.${kind}.${section}.body`));
  }
  for (const link of article.querySelectorAll('a[href^="#"]')) {
    assert.ok(document.getElementById(link.hash.slice(1)), `Broken contents link: ${link.hash}`);
  }
  for (const [other, { path }] of Object.entries(LEGAL_DOCUMENTS)) {
    assert.equal(article.querySelector(`a[href="${path}"]`).textContent, translate(locale, `legal.${other}.title`));
    assert.equal(document.querySelector(`footer a[href="${path}"]`).textContent, translate(locale, `legal.${other}.title`));
  }
  const ids = [...document.querySelectorAll("[id]")].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length, "Section navigation must not introduce duplicate IDs.");
  assert.doesNotMatch(article.textContent, /\blegal\.[\w.-]+|\bpublic\.[\w.-]+/);
}

for (const locale of LOCALES) {
  for (const [kind, route] of Object.entries(routes)) {
    test(`${locale} ${LEGAL_DOCUMENTS[kind].path} renders complete public legal content, accessible navigation and contact links`, async () => {
      globalThis.__legalLocale = locale === "en" ? undefined : locale;
      const page = route.default();
      assert.equal(page.type, LegalDocument);
      const element = await page.type(page.props);
      const html = renderToString(createElement(AppLanguageProvider, { initialLocale: locale }, element));
      const dom = new JSDOM(html);
      try {
        assertLegalMarkup(dom.window.document, kind, locale);
        const metadata = await route.generateMetadata();
        assert.equal(metadata.alternates.canonical, LEGAL_DOCUMENTS[kind].path);
        assert.equal(metadata.title, translate(locale, `public.seo.${kind}.title`));
        assert.equal(metadata.description, translate(locale, `public.seo.${kind}.description`));
        assert.equal(metadata.openGraph.url, LEGAL_DOCUMENTS[kind].path);
      } finally {
        dom.window.close();
      }
    });
  }
}

test("dynamic legal section keys have complete, non-abbreviated translations without English fallbacks", () => {
  for (const [kind, { sections }] of Object.entries(LEGAL_DOCUMENTS)) {
    for (const locale of LOCALES) {
      const required = ["title", "intro", ...sections.flatMap(section => [`${section}.title`, `${section}.body`])];
      for (const suffix of required) {
        const key = `legal.${kind}.${suffix}`;
        assert.ok(Object.hasOwn(translations[locale], key), `Missing dynamic key ${locale}/${key}`);
        if (locale !== "en") assert.notEqual(translations[locale][key], translations.en[key], `${locale}/${key} must be translated.`);
      }
    }
  }
});

const originIndex = process.argv.indexOf("--origin");
if (originIndex !== -1) {
  const origin = new URL(process.argv[originIndex + 1]);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "HTTP regression requests must target an owned local test server.");
  const request = async (path, locale) => {
    const response = await fetch(new URL(path, origin), {
      redirect: "manual",
      headers: {
        "User-Agent": "facebookexternalhit/1.1",
        ...(locale && locale !== "en" ? { Cookie: `${LOCALE_COOKIE}=${locale}` } : {}),
      },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, `${locale ?? "en"} ${path} must be public, with no login redirect.`);
    assert.ok(!response.headers.get("set-cookie")?.includes("postifai_session"), "Public legal access must not create an authenticated session.");
    assert.doesNotMatch(response.headers.get("x-robots-tag") ?? "", /noindex/i);
    return response.text();
  };
  for (const locale of LOCALES) {
    for (const [kind, { path }] of Object.entries(LEGAL_DOCUMENTS)) {
      test(`HTTP ${locale} ${path} returns indexable, fully rendered content without authentication or JavaScript`, async () => {
        const dom = new JSDOM(await request(path, locale));
        try {
          const document = dom.window.document;
          assert.equal(document.documentElement.lang, locale);
          assertLegalMarkup(document, kind, locale);
          assert.equal(document.title, `${translate(locale, `public.seo.${kind}.title`)} | POSTIF-AI`);
          assert.equal(document.querySelector('meta[name="description"]').content, translate(locale, `public.seo.${kind}.description`));
          assert.equal(new URL(document.querySelector('link[rel="canonical"]').href).pathname, path);
          assert.doesNotMatch(document.querySelector('meta[name="robots"]')?.content ?? "", /noindex/i);
        } finally {
          dom.window.close();
        }
      });
    }
  }
  test("HTTP sitemap and crawler rules expose all three legal routes", async () => {
    const xml = new JSDOM(await request("/sitemap.xml"), { contentType: "application/xml" });
    try {
      const paths = [...xml.window.document.querySelectorAll("loc")].map(node => new URL(node.textContent).pathname);
      const robots = await request("/robots.txt");
      for (const { path } of Object.values(LEGAL_DOCUMENTS)) {
        assert.ok(paths.includes(path));
        assert.ok(!robots.split("\n").some(line => line.trim() === `Disallow: ${path}`));
      }
    } finally {
      xml.window.close();
    }
  });
}
