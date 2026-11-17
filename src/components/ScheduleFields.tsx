"use client";

import { useAppLanguage } from "@/i18n/provider";
import { SCHEDULE_SLOTS } from "@/lib/schedule-slots";

export function ScheduleFields({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useAppLanguage();
  const [date = "", time = ""] = value.split("T");
  const legacy = time && !SCHEDULE_SLOTS.some(slot => slot === time);
  return <div className="mt-1 flex flex-wrap gap-2">
    <input type="date" aria-label={t("customer.schedule.date")} value={date}
      onChange={event => onChange(event.target.value ? `${event.target.value}T${time || SCHEDULE_SLOTS[0]}` : "")}
      className="elevated-card rounded-lg p-2 text-xs" />
    <select aria-label={t("customer.schedule.time")} value={time} onChange={event => onChange(date ? `${date}T${event.target.value}` : "")}
      className="elevated-card rounded-lg p-2 text-xs">
      {!time && <option value="">{t("customer.schedule.choose")}</option>}
      {legacy && <option value={time}>{time} ({t("customer.schedule.existing")})</option>}
      {SCHEDULE_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
    </select>
  </div>;
}
