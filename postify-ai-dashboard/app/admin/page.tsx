import Link from "next/link";
import { WorkspaceSidebar } from "@/components/dashboard/workspace-sidebar";

const sections = [
  ["Users", "Create owners and workspace members.", "/admin/users"],
  ["Profiles", "Manage personal and business workspaces.", "/admin/profiles"],
  ["Social Accounts", "Manage authorized provider destinations.", "/admin/accounts"],
  ["Posts", "Create and manage persisted publishing records.", "/admin/posts"],
];

export default function AdminPage() {
  return <main className="dashboard-shell min-h-screen"><div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]"><WorkspaceSidebar activeView="Settings" /><section className="min-w-0 px-5 py-7 sm:px-8 lg:px-10"><Link href="/dashboard" className="text-sm font-bold text-[#a891ff] hover:underline">Back to dashboard</Link><p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-[#a891ff]">Workspace settings</p><h1 className="mt-1 font-serif text-4xl font-semibold">Data administration</h1><p className="mt-2 text-sm text-[#9ba6c3]">Manage the MongoDB documents used by Postify. These routes require a configured database.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{sections.map(([title, description, href]) => <Link key={href} href={href} className="admin-section-card rounded-xl border p-5 transition-colors"><h2 className="font-serif text-2xl font-semibold">{title}</h2><p className="mt-2 text-sm text-[#9ba6c3]">{description}</p></Link>)}</div></section></div></main>;
}
