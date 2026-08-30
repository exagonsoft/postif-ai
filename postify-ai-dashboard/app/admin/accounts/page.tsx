import { ModelAdmin } from "@/components/admin/model-admin";

export default function AccountsAdminPage() {
  return <ModelAdmin resource="accounts" title="Social accounts" description="Create, update, and delete social provider destinations for a profile." />;
}
