import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { MotionConfigProvider } from "@/components/MotionPrimitives";
import { getSiteUrl, socialMetadata } from "@/lib/seo";
import { getRequestLocale, getServerI18n } from "@/i18n/server";
import { AppLanguageProvider } from "@/i18n/provider";

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getServerI18n();
  const title = t("public.seo.siteTitle");
  const description = t("public.seo.siteDescription");
  return {
    metadataBase: getSiteUrl(),
    applicationName: "POSTIF-AI",
    title: {
      default: title,
      template: "%s | POSTIF-AI",
    },
    description,
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    ...socialMetadata(title, description, undefined, locale),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased selection:bg-violet-500/30 selection:text-violet-200">
        <AppLanguageProvider initialLocale={locale}>
          <MotionConfigProvider>
            <ThemeProvider>
              <ToastProvider>{children}</ToastProvider>
            </ThemeProvider>
          </MotionConfigProvider>
        </AppLanguageProvider>
      </body>
    </html>
  );
}
