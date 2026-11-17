import { getServerI18n } from "@/i18n/server";
import { LegalDocument } from "@/components/LegalDocument";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("privacy", locale);
}

export default function PrivacyPage() {
  return <LegalDocument kind="privacy" />;
}
