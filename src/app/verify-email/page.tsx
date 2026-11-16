import { getServerI18n } from "@/i18n/server";
import { AccountActionForm } from "@/components/AccountActionForm";
import { privatePageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { t } = await getServerI18n();
  return privatePageMetadata(t("public.seo.verifyEmail.title"));
}

export default function VerifyEmailPage() {
  return <AccountActionForm purpose="verify_email" />;
}
