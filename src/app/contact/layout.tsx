import { getServerI18n } from "@/i18n/server";
import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("contact", locale);
}

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
