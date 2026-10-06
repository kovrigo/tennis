// Moscow dates and times. The server decides "today"; pages never convert time zones.
// Days are "YYYY-MM-DD", match times "HH:MM", moments ISO strings in UTC.

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("ru", {
  timeZone: "Europe/Moscow",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Moscow calendar day of a moment. */
export function moscowDay(at: Date | string = new Date()): string {
  return dayFormat.format(typeof at === "string" ? new Date(at) : at);
}

/** Moscow "HH:MM" of a moment. */
export function moscowTime(at: Date | string = new Date()): string {
  return timeFormat.format(typeof at === "string" ? new Date(at) : at);
}

/** Day plus n days, both "YYYY-MM-DD". */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every day from start to end inclusive. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "1 ч 12 мин", "38 мин". */
export function durationText(from: string, to: string): string {
  const min = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  const h = Math.floor(min / 60);
  return h ? `${h} ч ${min % 60} мин` : `${min} мин`;
}

/** Moscow midnight of a day as a UTC ISO string. Moscow has been UTC+3 all year since 2014. */
export const moscowDayStart = (day: string): string => new Date(`${day}T00:00:00+03:00`).toISOString();

/** A real calendar day "YYYY-MM-DD": "2026-02-30" and "2026-13-01" are not. */
export function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const isTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
