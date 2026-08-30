import { ModelAdmin } from "@/components/admin/model-admin";

export default function PostsAdminPage() {
  return <ModelAdmin resource="posts" title="Posts" description="Create, update, and delete persisted posts and their scheduling details." />;
}
