import { Plus } from "lucide-react";
import { PlatformMark, platformOptions } from "./platforms";

export function SocialAccounts({ profileName }: { profileName?: string }) {
  return <section className="mt-8 border-t border-[#dedbd4] pt-6" aria-labelledby="accounts">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8c877b]">Workspace profile</p><h2 id="accounts" className="mt-1 font-serif text-2xl font-semibold">Social accounts & permissions</h2></div><button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cbc7bd] bg-[#fbfaf7] px-3.5 text-sm font-bold"><Plus size={16} />Authorize account</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{platformOptions.map((platform) => <article key={platform.name} className="border border-[#dfdcd5] bg-[#fbfaf7] p-3.5"><div className="flex items-center gap-2"><PlatformMark platform={platform.name} /><div><p className="text-sm font-bold">{platform.name}</p><p className="text-xs text-[#777269]">{platform.account}</p></div></div><p className="mt-3 text-xs font-medium text-[#397258]">Connected · publish & analytics</p></article>)}</div>
    <p className="mt-3 text-xs text-[#777269]">{profileName ? `Connected to ${profileName}. ` : "Authorization is simulated. "}Production connections use each provider&apos;s OAuth consent flow; Postify never requests social passwords.</p>
  </section>;
}
