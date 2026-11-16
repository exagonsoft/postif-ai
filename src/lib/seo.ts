import type { Metadata } from "next";
import { translate } from "@/i18n/config";
import type { Locale } from "@/i18n/locale";

export const SITE_NAME = "POSTIF-AI";
export const SITE_TITLE = "AI Content Creation & Social Media Scheduling | POSTIF-AI";
export const SITE_DESCRIPTION = "Create, schedule, and publish AI-powered social media content from one workspace. Manage multiple brands with BYOK or Managed AI.";

export const PUBLIC_PAGES = {
  home: { path: "/", title: "AI Content Creation & Social Media Scheduling", description: SITE_DESCRIPTION },
  features: { path: "/features", title: "AI Content, Scheduling & Publishing Features", description: "Explore POSTIF-AI's content studio, social media scheduling, publishing, analytics, and AI-assisted planning in one multi-brand workspace." },
  pricing: { path: "/pricing", title: "Plans & Pricing", description: "Compare POSTIF-AI plans for creators, businesses, and agencies. Choose monthly or annual billing with your own OpenAI key or Managed AI credits." },
  about: { path: "/about", title: "About Us", description: "Meet POSTIF-AI by ExagonSoft: AI-assisted content creation and social media management with multi-brand workspaces and human approval controls." },
  contact: { path: "/contact", title: "Contact & Support", description: "Contact ExagonSoft about POSTIF-AI, agency workspaces, enterprise requirements, BYOK security, and social media management." },
  creators: { path: "/solutions/creators", title: "Social Media Tools for Creators", description: "Turn ideas into platform-ready content with POSTIF-AI. Repurpose posts, preserve your brand voice, and plan your social content in one workspace." },
  agencies: { path: "/solutions/agencies", title: "Social Media Management for Agencies", description: "Manage client brands with POSTIF-AI's separate workspaces, team roles, approval workflows, and shared social media scheduling tools." },
  smallBusinesses: { path: "/solutions/small-businesses", title: "Social Media Tools for Small Businesses", description: "Plan, create, and schedule social content for your business with POSTIF-AI. Build a consistent brand presence with AI assistance and approval controls." },
  privacy: { path: "/privacy", title: "Privacy Policy", description: "Read how POSTIF-AI by ExagonSoft handles workspace data, content ownership, BYOK credentials, and privacy." },
  terms: { path: "/terms", title: "Terms of Service", description: "Review the terms for using POSTIF-AI by ExagonSoft, including subscriptions, AI-assisted content, and social publishing." },
} as const;

const SOCIAL_IMAGES = [
  {
    url: encodeURI("/images/Imagen de ChatGPT 16 nov 2026, 04_20_08 p.m-1.png"),
    width: 1731,
    height: 909,
    type: "image/png",
    alt: "POSTIF-AI: AI content creation, scheduling, publishing, and analytics for social media.",
  },
  {
    url: encodeURI("/images/Imagen de ChatGPT 16 nov 2026, 04_20_09 p.m-2.png"),
    width: 1254,
    height: 1254,
    type: "image/png",
    alt: "POSTIF-AI: Create once. Publish everywhere. Grow automatically. BYOK or Managed AI for multi-brand workspaces.",
  },
];

export function getSiteUrl(env: NodeJS.ProcessEnv = process.env): URL {
  if (!env.APP_URL?.trim()) throw new Error("APP_URL is required for SEO canonical URLs and social previews.");
  const url = new URL(env.APP_URL);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) {
    throw new Error("APP_URL must be an HTTPS origin (HTTP is allowed only on loopback for local testing).");
  }
  return url;
}

export function socialMetadata(title = SITE_TITLE, description = SITE_DESCRIPTION, path?: string, locale: Locale = "en"): Pick<Metadata, "openGraph" | "twitter"> {
  const images = SOCIAL_IMAGES.map((image, index) => ({
    ...image,
    alt: translate(locale, `public.seo.socialImage${index + 1}`),
  }));
  const localizedTitle = title === SITE_TITLE ? translate(locale, "public.seo.siteTitle") : title;
  const localizedDescription = description === SITE_DESCRIPTION ? translate(locale, "public.seo.siteDescription") : description;
  return {
    openGraph: {
      title: localizedTitle,
      description: localizedDescription,
      ...(path ? { url: path } : {}),
      siteName: "POSTIF-AI by ExagonSoft",
      locale: { en: "en_US", es: "es_ES", de: "de_DE", "pt-BR": "pt_BR" }[locale],
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: localizedTitle,
      description: localizedDescription,
      images: [{ url: images[0].url, alt: images[0].alt }],
    },
  };
}

export function publicPageMetadata(page: keyof typeof PUBLIC_PAGES, locale: Locale = "en"): Metadata {
  const { path } = PUBLIC_PAGES[page];
  const title = translate(locale, `public.seo.${page}.title`);
  const description = translate(locale, `public.seo.${page}.description`);
  return {
    title,
    description,
    alternates: { canonical: path },
    ...socialMetadata(`${title} | ${SITE_NAME}`, description, path, locale),
  };
}

export function privatePageMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: false, nocache: true } };
}

export function siteStructuredData(locale: Locale = "en") {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": new URL("#organization", url).href,
        name: SITE_NAME,
        url: url.href,
        parentOrganization: { "@type": "Organization", name: "ExagonSoft" },
      },
      {
        "@type": "WebSite",
        "@id": new URL("#website", url).href,
        name: SITE_NAME,
        url: url.href,
        description: translate(locale, "public.seo.siteDescription"),
        inLanguage: locale,
        publisher: { "@id": new URL("#organization", url).href },
      },
    ],
  };
}
