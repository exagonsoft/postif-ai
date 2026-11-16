"use client";
export type AutomaticMedia = { kind: "image" | "video" | "gif" } | null;
export function AutomaticMediaSettings({ value, onChange }: { value: AutomaticMedia; onChange: (value: AutomaticMedia) => void }) {
  const { t } = useAppLanguage();

  return <fieldset className="mb-5 space-y-3 rounded-2xl border border-[var(--border-subtle)] p-4">
    <legend className="px-2 text-sm font-bold">{t("customer.text.284")}</legend>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {([ ["none", t("customer.text.285")], ["image", t("customer.text.286")], ["video", t("customer.text.287")], ["gif", t("customer.text.288")] ] as const).map(([kind, label]) => <label key={kind} className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-bold ${(value?.kind || "none") === kind ? "border-violet-500 bg-violet-500/15" : "border-[var(--border-subtle)]"}`}>
        <input type="radio" name="automatic-media-kind" value={kind} checked={(value?.kind || "none") === kind} onChange={() => onChange(kind === "none" ? null : { kind })} className="mr-2 accent-violet-600" />{label}
      </label>)}
    </div>
    <p className="text-xs text-[var(--text-secondary)]">{t("customer.text.289")}</p>
    {value && <p className="text-xs text-[var(--text-muted)]">{value.kind === "image" ? t("customer.text.290") : t("customer.text.291")} {t("customer.text.292")}</p>}
  </fieldset>;
}
