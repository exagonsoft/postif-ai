import { getServerI18n } from "@/i18n/server";
import { AccountActionForm } from "@/components/AccountActionForm";
import { privatePageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { t } = await getServerI18n();
  return privatePageMetadata(t("public.seo.resetPassword.title"));
}

export default function ResetPasswordPage() {
  return <AccountActionForm purpose="reset_password" />;
}
