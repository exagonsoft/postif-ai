import type { MetadataRoute } from "next";
import { getSiteUrl, PUBLIC_PAGES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return Object.values(PUBLIC_PAGES).map(({ path }) => ({ url: new URL(path, base).href }));
}
