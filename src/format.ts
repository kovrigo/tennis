// Display formats for plain days ("YYYY-MM-DD", no time zone involved) and names.

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const parts = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
};

/** "24–28 сен", "30 сен – 2 окт", "28 дек 2026 – 3 янв 2027"; withYear adds the year: "24–28 сен 2026". */
export function dateRange(start: string, end: string, withYear = false): string {
  const s = parts(start);
  const e = parts(end);
  const year = withYear ? ` ${e.y}` : "";
  if (start === end) return `${s.d} ${MONTHS_SHORT[s.m - 1]}${year}`;
  if (s.y !== e.y) return `${s.d} ${MONTHS_SHORT[s.m - 1]} ${s.y} – ${e.d} ${MONTHS_SHORT[e.m - 1]} ${e.y}`;
  if (s.m === e.m) return `${s.d}–${e.d} ${MONTHS_SHORT[s.m - 1]}${year}`;
  return `${s.d} ${MONTHS_SHORT[s.m - 1]} – ${e.d} ${MONTHS_SHORT[e.m - 1]}${year}`;
}

/** Card date as separate lines: ["6–8", "окт", "2026"]; the year line only with withYear or across two years. */
export function dateLines(start: string, end: string, withYear = false): string[] {
  const s = parts(start);
  const e = parts(end);
  const ms = MONTHS_SHORT[s.m - 1];
  const me = MONTHS_SHORT[e.m - 1];
  if (s.y !== e.y) return [`${s.d} – ${e.d}`, `${ms}–${me}`, `${s.y}–${e.y}`];
  const year = withYear ? [String(e.y)] : [];
  if (start === end) return [String(s.d), ms, ...year];
  if (s.m === e.m) return [`${s.d}–${e.d}`, ms, ...year];
  return [`${s.d} – ${e.d}`, `${ms}–${me}`, ...year];
}

/** "6 октября". */
export function dayLong(day: string): string {
  const { m, d } = parts(day);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

/** "6 октября 2026". */
export function dayFull(day: string): string {
  return `${dayLong(day)} ${parts(day).y}`;
}

/** "6 окт". */
export function dayShort(day: string): string {
  const { m, d } = parts(day);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "пн". */
export function weekday(day: string): string {
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
}

/** Day plus n days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Морозов Артём" → "МА". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "1,2 МБ", "0,4 МБ", "35 КБ". */
export function fileSize(bytes: number): string {
  if (bytes < 100 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

/** "PDF" or "Word". */
export function fileKind(type: string): string {
  return type === "pdf" ? "PDF" : "Word";
}

/** Thousands with a thin space: "1 840". */
export function points(n: number): string {
  return n.toLocaleString("ru-RU");
}
