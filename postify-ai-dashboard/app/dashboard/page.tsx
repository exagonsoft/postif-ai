import { PostifyDashboard } from "@/components/dashboard/postify-dashboard";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  if (!await getSessionUser()) redirect("/login");
  return <PostifyDashboard />;
}