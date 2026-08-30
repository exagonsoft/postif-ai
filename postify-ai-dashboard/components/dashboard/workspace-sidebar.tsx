"use client";

import { BarChart3, CalendarDays, LayoutDashboard, LogOut, PenLine, Plus, Settings, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const navigation = [
  ["Overview", "Overview", LayoutDashboard],
  ["Posts", "Posts", PenLine],
  ["Calendar", "Calendar", CalendarDays],
  ["Analytics", "Analytics", BarChart3],
  ["Social Accounts", "Social Accounts", UsersRound],
] as const;

type WorkspaceSidebarProps = {
  profileName?: string;
  activeView?: string;
  onCreatePost?: () => void;
};

export function WorkspaceSidebar({ profileName = "My workspace", activeView, onCreatePost }: WorkspaceSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = activeView ?? searchParams.get("view") ?? "Overview";

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return <aside className="workspace-sidebar flex flex-col border-b px-5 py-6 lg:border-r lg:border-b-0">
    <Link href="/" className="flex items-center gap-2.5 px-2"><span className="workspace-mark flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black">P</span><span className="font-serif text-xl font-semibold">Postify</span></Link>
    {onCreatePost ? <button onClick={onCreatePost} className="workspace-create mt-8 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold"><Plus size={17} /> Create post</button> : <Link href="/dashboard#composer" className="workspace-create mt-8 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold"><Plus size={17} /> Create post</Link>}
    <nav className="mt-7 grid grid-cols-3 gap-1 lg:flex lg:flex-col" aria-label="Workspace navigation">
      {navigation.map(([label, view, Icon]) => <Link key={label} href={`/dashboard?view=${encodeURIComponent(view)}`} className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-center text-xs font-medium lg:justify-start lg:px-3 lg:text-left lg:text-sm ${currentView === view ? "workspace-active" : "workspace-link"}`}><Icon size={17} className="shrink-0" />{label}</Link>)}
    </nav>
    <div className="mt-8 border-t pt-5 lg:mt-auto"><Link href="/admin" className={`workspace-link flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${currentView === "Settings" ? "workspace-active" : ""}`}><Settings size={18} />Workspace settings</Link><Link href="/admin/users" className="workspace-link mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"><ShieldCheck size={18} />Administration</Link><button onClick={() => void logout()} className="workspace-danger mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold"><LogOut size={17} />Log out</button><div className="workspace-profile mt-4 flex items-center gap-3 rounded-lg px-3 py-2"><span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold">{profileName.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{profileName}</p><p className="truncate text-xs">Business workspace</p></div></div></div>
  </aside>;
}
