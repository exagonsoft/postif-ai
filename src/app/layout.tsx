import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { MotionConfigProvider } from "@/components/MotionPrimitives";

export const metadata: Metadata = {
  title: {
    default: "POSTIF-AI — Your Social Media. On Autopilot. | ExagonSoft",
    template: "%s | POSTIF-AI by ExagonSoft",
  },
  description:
    "Create Once. Publish Everywhere. Grow Automatically. POSTIF-AI is an AI-powered social media generation, multi-channel scheduling, and autonomous marketing agent SaaS developed by ExagonSoft.",
  openGraph: {
    title: "POSTIF-AI — Your Social Media. On Autopilot.",
    description:
      "Create, schedule, and publish AI-powered content across all your social channels with autonomous marketing agents and flexible BYOK or Managed AI billing.",
    siteName: "POSTIF-AI by ExagonSoft",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased selection:bg-violet-500/30 selection:text-violet-200">
        <MotionConfigProvider>
          <ThemeProvider>
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </MotionConfigProvider>
      </body>
    </html>
  );
}
