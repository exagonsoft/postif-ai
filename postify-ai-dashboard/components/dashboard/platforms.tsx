import { Check } from "lucide-react";
import { Platform, PostStatus } from "./types";

export const platformOptions: { name: Platform; initial: string; color: string; account: string }[] = [
  { name: "Instagram", initial: "I", color: "bg-[#dc3c6c]", account: "@maison.studio" },
  { name: "LinkedIn", initial: "in", color: "bg-[#0a66c2]", account: "Maison Studio" },
  { name: "Facebook", initial: "f", color: "bg-[#1877f2]", account: "Maison Studio" },
  { name: "Pinterest", initial: "p", color: "bg-[#d9293a]", account: "Maison Ideas" },
];

export function platformFromApi(value: string): Platform | undefined {
  return platformOptions.find((platform) => platform.name.toLowerCase() === value.toLowerCase())?.name;
}

export function PlatformMark({ platform }: { platform: Platform }) {
  const item = platformOptions.find((entry) => entry.name === platform)!;
  return <span title={platform} className={`${item.color} inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white`}>{item.initial}</span>;
}

export function PlatformSelector({ selected, onToggle }: { selected: Platform[]; onToggle: (platform: Platform) => void }) {
  return <div className="mt-3 grid grid-cols-2 gap-2">
    {platformOptions.map((platform) => {
      const enabled = selected.includes(platform.name);
      return <button key={platform.name} type="button" onClick={() => onToggle(platform.name)} className={`flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-left text-xs font-semibold ${enabled ? "border-[#6e968d] bg-[#eef5f2]" : "border-[#dedbd4] bg-white"}`} aria-pressed={enabled}>
        <PlatformMark platform={platform.name} />
        <span>{platform.name}</span>
        {enabled && <Check size={15} className="ml-auto text-[#347267]" />}
      </button>;
    })}
  </div>;
}

export function StatusBadge({ status }: { status: PostStatus }) {
  const styles: Record<PostStatus, string> = { Published: "bg-[#e3f3e9] text-[#1b7f4c]", Scheduled: "bg-[#e7edfa] text-[#2f5dab]", Draft: "bg-[#f0eee9] text-[#6d675d]", Failed: "bg-[#fae6e3] text-[#b14a3c]" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status]}`}>{status}</span>;
}
