import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  if (!await getSessionUser()) redirect("/login");
  return children;
}