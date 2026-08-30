import { Link2 } from "lucide-react";

export function DashboardHeader({ active, notice, onSync }: { active: string; notice: string; onSync: () => void }) {
  return <>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#dedbd4] pb-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d75a34]">{active}</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold sm:text-4xl">Good morning, Marina.</h1>
        <p className="mt-2 text-sm text-[#716e66]">Here&apos;s what&apos;s moving across your social channels.</p>
      </div>
      <button onClick={onSync} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cbc7bd] bg-[#fbfaf7] px-3.5 text-sm font-semibold hover:bg-white">
        <Link2 size={16} /> Sync metrics
      </button>
    </header>
    <p className="mt-4 rounded-md bg-[#ebe8e1] px-3 py-2 text-xs font-medium text-[#5c5952]" role="status">{notice}</p>
  </>;
}
