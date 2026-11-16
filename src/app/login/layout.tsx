import { getServerI18n } from "@/i18n/server";
import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { t } = await getServerI18n();
  return privatePageMetadata(t("public.seo.signIn.title"));
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
