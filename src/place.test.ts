import { describe, expect, test } from "vitest";
import { placeClass, placeOf } from "./place.ts";

// Brief «Исправления до проверки», item 2: the place comes from the whole label, never part of it.

describe("place from a result label", () => {
  const cases: [string, number | null][] = [
    ["1 место", 1],
    ["Победитель", 1],
    ["Первое место", 1],
    ["Место 1", 1],
    ["1–2 место", 1],
    ["2 место", 2],
    ["2", 2],
    ["2-е место", 2],
    ["Финалист", 2],
    ["Второе место", 2],
    ["3–4 место", 3],
    ["3-4 место", 3],
    ["3–4", 3],
    ["Место 3–4", 3],
    ["Полуфинал", 3],
    ["Полуфиналист", 3],
    ["1/2 финала", 3],
    ["Третье место", 3],
    ["Победительница", 1],
    ["Финалистка", 2],
    ["Полуфиналистка", 3],
    ["3–4 места", 3],
    ["1–2 места", 1],
    ["1 место (финал)", 1],
    ["Четвертьфиналистка", null],
    ["Финал (2 место)", null],
    ["Четвертьфинал (5–8 место)", null],
    ["(1 место)", null],
    ["5–8 место", 5],
    ["Четвертьфинал", null],
    ["Четвертьфиналист", null],
    ["1/4 финала", null],
    ["Финал", null],
    ["Выбыл в 1 круге", null],
    ["", null],
  ];
  test.each(cases)("«%s» → %s", (label, place) => expect(placeOf(label)).toBe(place));

  test("case and extra spaces do not matter", () => {
    expect(placeOf("  ПОБЕДИТЕЛЬ  ")).toBe(1);
    expect(placeOf("1/2   финала")).toBe(3);
    expect(placeOf("3 – 4  место")).toBe(3);
    expect(placeOf("3—4")).toBe(3);
    expect(placeOf("3−4 место")).toBe(3);
  });

  test("only the first three places get a colour class", () => {
    expect(["Победитель", "Финалист", "Полуфинал"].map((l) => placeClass(l, true))).toEqual([" m1", " m2", " m3"]);
    expect(["0", "4 место", "5–8 место", "Финал", ""].map((l) => placeClass(l, true))).toEqual(["", "", "", "", ""]);
  });

  test("a place nobody got yet is grey, whatever its label", () => {
    expect(["Победитель", "1 место", "Финалист", "Полуфинал"].map((l) => placeClass(l, false))).toEqual(["", "", "", ""]);
  });
});
