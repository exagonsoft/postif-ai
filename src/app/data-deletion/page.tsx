import { LegalDocument } from "@/components/LegalDocument";
import { getServerI18n } from "@/i18n/server";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { locale } = await getServerI18n();
  return publicPageMetadata("dataDeletion", locale);
}

export default function DataDeletionPage() {
  return <LegalDocument kind="dataDeletion" />;
}
