import "./register-ts.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
const { getSiteUrl, privatePageMetadata, PUBLIC_PAGES, publicPageMetadata, siteStructuredData } = await import("../src/lib/seo.ts");
const { default: sitemap } = await import("../src/app/sitemap.ts");
const { default: robots } = await import("../src/app/robots.ts");

test("the browser favicon uses the conventional app route with valid, matching ICO image sizes", () => {
  const icon = readFileSync(path.join("src", "app", "favicon.ico"));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const count = icon.readUInt16LE(4);
  const sizes = new Set();
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const width = icon[entry] || 256, height = icon[entry + 1] || 256;
    const length = icon.readUInt32LE(entry + 8), offset = icon.readUInt32LE(entry + 12);
    assert.ok(offset >= 6 + count * 16 && length > 0 && offset + length <= icon.length);
    const image = icon.subarray(offset, offset + length);
    if (image.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      assert.equal(image.readUInt32BE(16), width, "ICO directory width must match the embedded PNG.");
      assert.equal(image.readUInt32BE(20), height, "ICO directory height must match the embedded PNG.");
    } else {
      assert.equal(image.readUInt32LE(0), 40);
      assert.equal(image.readInt32LE(4), width);
      assert.equal(image.readInt32LE(8), height * 2);
    }
    assert.equal(width, height);
    sizes.add(width);
  }
  for (const size of [16, 32, 48, 256]) assert.ok(sizes.has(size), `Missing ${size}px browser icon.`);
});

test("SEO origins reject missing, insecure, credential-bearing and non-origin URLs", () => {
  for (const APP_URL of [undefined, "", "https://", "http://example.test", "https://user:password@example.test", "https://example.test/path", "https://example.test/?token=private", "https://example.test/#fragment"]) {
    assert.throws(() => getSiteUrl({ APP_URL }));
  }
  assert.equal(getSiteUrl({ APP_URL: "https://example.test" }).href, "https://example.test/");
  assert.equal(getSiteUrl({ APP_URL: "http://localhost:3000" }).origin, "http://localhost:3000");
});

test("public pages have their own canonical and matching social metadata with usable uploaded images", () => {
  const canonicalPaths = new Set();
  for (const key of Object.keys(PUBLIC_PAGES)) {
    const metadata = publicPageMetadata(key);
    assert.equal(metadata.alternates.canonical, PUBLIC_PAGES[key].path);
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    assert.equal(metadata.openGraph.title, `${metadata.title} | POSTIF-AI`);
    assert.equal(metadata.twitter.title, metadata.openGraph.title);
    assert.equal(metadata.openGraph.description, metadata.description);
    assert.equal(metadata.twitter.description, metadata.description);
    assert.ok(!canonicalPaths.has(metadata.alternates.canonical));
    canonicalPaths.add(metadata.alternates.canonical);
  }
  const metadata = publicPageMetadata("home");
  assert.equal(metadata.openGraph.images.length, 2);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(metadata.twitter.images[0].url, metadata.openGraph.images[0].url);
  for (const image of metadata.openGraph.images) {
    const file = path.join("public", ...decodeURI(image.url).split("/"));
    const data = readFileSync(file);
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.equal(data.readUInt32BE(16), image.width);
    assert.equal(data.readUInt32BE(20), image.height);
    assert.ok(data.length < 5_000_000, "Social image must fit Twitter's image size limit");
    assert.ok(image.alt);
  }
});

test("sitemap, robots and structured data use the configured origin without publishing private routes", () => {
  const original = process.env.APP_URL;
  process.env.APP_URL = "https://seo.example.test";
  try {
    const entries = sitemap();
    assert.equal(entries.length, Object.keys(PUBLIC_PAGES).length);
    for (const entry of entries) {
      assert.equal(new URL(entry.url).origin, process.env.APP_URL);
      assert.ok(Object.values(PUBLIC_PAGES).some(page => new URL(entry.url).pathname === page.path));
    }
    const crawlerRules = robots();
    assert.equal(crawlerRules.sitemap, "https://seo.example.test/sitemap.xml");
    for (const route of ["/api/", "/app", "/onboarding", "/reset-password", "/verify-email"]) {
      assert.ok(crawlerRules.rules.disallow.includes(route));
    }
    const privateMetadata = privatePageMetadata("Sign In");
    assert.equal(privateMetadata.robots.index, false);
    assert.equal(privateMetadata.robots.follow, false);
    const structured = siteStructuredData();
    for (const entity of structured["@graph"]) {
      assert.equal(entity.url, "https://seo.example.test/");
      assert.equal(new URL(entity["@id"]).origin, process.env.APP_URL);
    }
    assert.equal(structured["@graph"][1].publisher["@id"], structured["@graph"][0]["@id"]);
  } finally {
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  }
});

test("localized public metadata retains existing URLs and uses the selected social locale", () => {
  for (const locale of ["es", "de", "pt-BR"]) {
    for (const key of Object.keys(PUBLIC_PAGES)) {
      const metadata = publicPageMetadata(key, locale);
      assert.equal(metadata.alternates.canonical, PUBLIC_PAGES[key].path);
      assert.equal(metadata.openGraph.url, PUBLIC_PAGES[key].path);
      assert.notEqual(metadata.title, PUBLIC_PAGES[key].title, `${locale}/${key}`);
      assert.notEqual(metadata.description, PUBLIC_PAGES[key].description, `${locale}/${key}`);
      assert.match(metadata.openGraph.locale, new RegExp(`^${locale.split("-")[0]}_`));
      assert.equal(metadata.twitter.description, metadata.description);
      assert.equal(metadata.openGraph.images.length, 2);
    }
  }
});

if (process.argv.includes("--built")) {
  test("built public HTML exposes absolute canonical/social URLs and private forms stay non-indexable", () => {
    const decode = value => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const tags = html => [...html.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(([tag]) =>
      Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])));
    const xml = readFileSync(path.join(".next", "server", "app", "sitemap.xml.body"), "utf8");
    const origin = new URL(xml.match(/<loc>([^<]+)<\/loc>/)[1]).origin;
    for (const key of ["features", "about", "contact", "creators", "agencies", "smallBusinesses", "privacy", "terms"]) {
      const page = PUBLIC_PAGES[key];
      const html = readFileSync(path.join(".next", "server", "app", `${page.path.slice(1)}.html`), "utf8");
      const attributes = tags(html);
      const find = (key, value) => attributes.find(tag => tag[key] === value);
      assert.equal(find("rel", "canonical").href, new URL(page.path, origin).href);
      assert.equal(find("name", "description").content, page.description);
      assert.equal(find("property", "og:url").content, new URL(page.path, origin).href);
      assert.equal(find("property", "og:title").content, `${page.title} | POSTIF-AI`);
      assert.equal(find("name", "twitter:card").content, "summary_large_image");
      const ogImages = attributes.filter(tag => tag.property === "og:image").map(tag => tag.content);
      assert.equal(ogImages.length, 2);
      assert.equal(find("name", "twitter:image").content, ogImages[0]);
      for (const image of ogImages) {
        assert.equal(new URL(image).origin, origin);
        assert.ok(readFileSync(path.join("public", ...decodeURI(new URL(image).pathname).split("/"))).length);
      }
    }
    for (const route of ["login", "register", "reset-password", "verify-email"]) {
      const attributes = tags(readFileSync(path.join(".next", "server", "app", `${route}.html`), "utf8"));
      assert.match(attributes.find(tag => tag.name === "robots").content, /noindex/);
      assert.ok(!attributes.some(tag => tag.name === "googlebot" && /(^|, )index(,|$)/.test(tag.content)));
      assert.ok(!attributes.some(tag => tag.rel === "canonical"), "Private forms must not inherit the homepage canonical");
    }
  });
}
