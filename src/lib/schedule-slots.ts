import { formatScheduleInput, scheduleToISO } from "./schedule-time";

export const SCHEDULE_SLOTS = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"] as const;

export function isScheduleSlot(date: Date, timezone: string) {
  const local = formatScheduleInput(date, timezone);
  return date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0 &&
    SCHEDULE_SLOTS.some(slot => local.endsWith(`T${slot}`));
}

export function nextScheduleSlot(after: Date, timezone: string) {
  const localDate = formatScheduleInput(after, timezone).slice(0, 10);
  const start = Date.parse(`${localDate}T00:00:00Z`);
  for (let day = 0; day < 3; day++) {
    const date = new Date(start + day * 86400000).toISOString().slice(0, 10);
    for (const slot of SCHEDULE_SLOTS) {
      try {
        const candidate = new Date(scheduleToISO(`${date}T${slot}`, timezone));
        if (candidate > after) return candidate;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("does not exist")) throw error;
      }
    }
  }
  throw new Error("No available publishing time was found in the chosen timezone.");
}
