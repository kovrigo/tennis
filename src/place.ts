// A result place from the label the organizer typed. The label is matched whole: "Четвертьфиналист"
// contains "финалист" and "1/4 финала" contains a 1, and neither is a place.

const WORDS = new Map([
  ["победитель", 1],
  ["первое место", 1],
  ["финалист", 2],
  ["второе место", 2],
  ["полуфинал", 3],
  ["полуфиналист", 3],
  ["1/2 финала", 3],
  ["третье место", 3],
]);

/** "2", "2 место", "Место 2", "2-е место", "3–4 место": the first number of the place or range. */
const NUMBER = /^(?:место )?(\d+)(?:-е)?(?: ?[-–—−] ?\d+)?(?: место)?$/;

/** "Победитель" → 1, "3–4 место" → 3, "Четвертьфинал" → null. */
export function placeOf(label: string): number | null {
  const s = label.trim().toLowerCase().replace(/\s+/g, " ");
  const m = NUMBER.exec(s);
  return WORDS.get(s) ?? (m ? Number(m[1]) : null);
}

/** The row colour class for the first three places; a place nobody got yet stays grey. */
export function placeClass(label: string, marked: boolean): string {
  const p = marked ? placeOf(label) : null;
  return p !== null && p >= 1 && p <= 3 ? ` m${p}` : "";
}
