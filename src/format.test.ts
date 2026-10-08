import { describe, expect, test } from "vitest";
import { dateLines } from "./format.ts";

// Tournament card date: days / month / year, each on its own line.

describe("card date lines", () => {
  test("one day", () => {
    expect(dateLines("2026-10-06", "2026-10-06")).toEqual(["6", "окт"]);
    expect(dateLines("2026-10-06", "2026-10-06", true)).toEqual(["6", "окт", "2026"]);
  });
  test("same month", () => {
    expect(dateLines("2026-10-06", "2026-10-08", true)).toEqual(["6–8", "окт", "2026"]);
    expect(dateLines("2026-10-21", "2026-10-23")).toEqual(["21–23", "окт"]);
  });
  test("two months, same year", () => {
    expect(dateLines("2026-09-30", "2026-10-02", true)).toEqual(["30 – 2", "сен–окт", "2026"]);
    expect(dateLines("2026-09-30", "2026-10-02")).toEqual(["30 – 2", "сен–окт"]);
  });
  test("two years", () => {
    expect(dateLines("2026-12-28", "2027-01-03", true)).toEqual(["28 – 3", "дек–янв", "2026–2027"]);
    expect(dateLines("2026-12-28", "2027-01-03")).toEqual(["28 – 3", "дек–янв", "2026–2027"]);
  });
});
