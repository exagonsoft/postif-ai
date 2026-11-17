import { getServerI18n } from "@/i18n/server";
import { LegalDocument } from "@/components/LegalDocument";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("terms", locale);
}

export default function TermsPage() {
  return <LegalDocument kind="terms" />;
}
