import { ModelAdmin } from "@/components/admin/model-admin";

export default function UsersAdminPage() {
  return <ModelAdmin resource="users" title="Users" description="Create, update, and delete Postify workspace users." />;
}
