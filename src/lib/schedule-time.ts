export function formatScheduleInput(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function scheduleToISO(input: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error("Choose a valid date and time.");
  const target = Date.parse(`${input}:00Z`);
  if (!Number.isFinite(target)) throw new Error("Choose a valid date and time.");
  let candidate = target;
  for (let iteration = 0; iteration < 4; iteration++) {
    const rendered = Date.parse(`${formatScheduleInput(new Date(candidate), timezone)}:00Z`);
    candidate += target - rendered;
  }
  if (formatScheduleInput(new Date(candidate), timezone) !== input) throw new Error("This time does not exist in the chosen timezone. Choose a different time.");
  return new Date(candidate).toISOString();
}
