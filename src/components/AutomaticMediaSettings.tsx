"use client";
export type AutomaticMedia = { kind: "image" | "video" | "gif" } | null;
export function AutomaticMediaSettings({ value, onChange }: { value: AutomaticMedia; onChange: (value: AutomaticMedia) => void }) {
  return <fieldset className="mb-5 space-y-3 rounded-2xl border border-[var(--border-subtle)] p-4">
    <legend className="px-2 text-sm font-bold">Create media when scheduled</legend>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {([ ["none", "No media"], ["image", "Image"], ["video", "Video"], ["gif", "GIF"] ] as const).map(([kind, label]) => <label key={kind} className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-bold ${(value?.kind || "none") === kind ? "border-violet-500 bg-violet-500/15" : "border-[var(--border-subtle)]"}`}>
        <input type="radio" name="automatic-media-kind" value={kind} checked={(value?.kind || "none") === kind} onChange={() => onChange(kind === "none" ? null : { kind })} className="mr-2 accent-violet-600" />{label}
      </label>)}
    </div>
    <p className="text-xs text-[var(--text-secondary)]">Choose the media type. When you schedule, we create and attach it using your topic, post, and selected brand’s style, colors, and audience. We choose the format for your channels.</p>
    {value && <p className="text-xs text-[var(--text-muted)]">{value.kind === "image" ? "40 managed credits, or your OpenAI key." : "120 managed credits."} Your review preference applies to the completed post and media.</p>}
  </fieldset>;
}
