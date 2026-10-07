import { describe, expect, test } from "vitest";
import { leagueOf } from "./League.tsx";

// Brief «Исправления до проверки», item 1: sex words decide before age words.

describe("league from a division or rating group name", () => {
  const cases: [string, ReturnType<typeof leagueOf>][] = [
    ["Женщины до 18 лет", "women"],
    ["Женщины, одиночный", "women"],
    ["Женский парный", "women"],
    ["Мужчины, одиночный", "men"],
    ["Мужской парный", "men"],
    ["Девушки до 15 лет", "girls"],
    ["Юниорки", "girls"],
    ["Юноши до 15 лет", "boys"],
    ["Юниоры", "boys"],
    ["Дети до 10 лет", "boys"],
    ["Ветераны", null],
    ["Смешанный парный", null],
  ];
  test.each(cases)("%s → %s", (name, league) => expect(leagueOf(name)).toBe(league));

  test("a name with two leagues gets the first in check order", () => {
    expect(leagueOf("Юноши и девушки")).toBe("girls");
    expect(leagueOf("Женщины и мужчины")).toBe("women");
  });
});
