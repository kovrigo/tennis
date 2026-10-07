import { describe, expect, test } from "vitest";
import type { Db } from "./db.ts";
import { ApiError } from "./http.ts";
import { saveDivision, saveGroup, savePlacements } from "./services/divisions.ts";
import { deleteMatch, saveMatch } from "./services/matches.ts";
import { saveNews } from "./services/people.ts";
import { createPlayer } from "./services/players.ts";
import { saveRegulation, saveTournament } from "./services/tournaments.ts";
import { PDF, memoryDb, tmpDir } from "./testkit.ts";
import { homePage, playerPage, ratingPage, tournamentPage } from "./views/public.ts";

// Rating and points: S4.1–S4.3, S4.5, S7.5–S7.9.

const files = tmpDir("rating");

function tournament(db: Db, name: string, day: string, regulation = true) {
  const id = saveTournament(db, { name, startDate: day, endDate: day, city: "Тосно", venue: "", kind: "amateur", category: "" });
  if (regulation) saveRegulation(db, files, id, "p.pdf", PDF);
  return id;
}

function players(db: Db, names: string[]) {
  return names.map((n) => {
    const [last, first] = n.split(" ");
    return createPlayer(db, { firstName: first, lastName: last, city: "Луга" });
  });
}

/** Division with a table and one match per pair, so every player belongs to it. */
function division(db: Db, tournamentId: number, day: string, groupId: number | null, rows: [string, number][], ids: number[]) {
  const d = saveDivision(db, { tournamentId, name: "Разряд", groupId, rows: rows.map(([name, points]) => ({ name, points })) });
  for (let i = 0; i + 1 < ids.length; i += 2) {
    saveMatch(db, { divisionId: d.id, round: "1-й круг", day, time: null, court: "", playerA: ids[i], playerB: ids[i + 1], judgeId: null });
  }
  return d;
}

const rowId = (d: { rows: { id: number; name: string }[] }, name: string) => d.rows.find((r) => r.name === name)!.id;

describe("group rating", () => {
  test("sum over all divisions of the group, all time; shared places 1, 2, 2, 4 with names in Russian order", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const [yak, abr, yol, bor] = players(db, ["Яковлев Иван", "Абрамов Пётр", "Ёлкин Олег", "Борисов Илья"]);
    const t1 = tournament(db, "Первый", "2025-05-01");
    const t2 = tournament(db, "Второй", "2026-05-01");
    const d1 = division(db, t1, "2025-05-01", g, [["Победитель", 50], ["Финалист", 30], ["Участник", 0]], [yak, abr, yol, bor]);
    const d2 = division(db, t2, "2026-05-01", g, [["Победитель", 20], ["Финалист", 10]], [yak, abr, yol, bor]);
    savePlacements(db, d1.id, [
      { playerId: yak, pointsRowId: rowId(d1, "Финалист") },
      { playerId: abr, pointsRowId: rowId(d1, "Победитель") },
      { playerId: yol, pointsRowId: rowId(d1, "Финалист") },
      { playerId: bor, pointsRowId: rowId(d1, "Участник") },
    ]);
    savePlacements(db, d2.id, [
      { playerId: yak, pointsRowId: rowId(d2, "Победитель") },
      { playerId: yol, pointsRowId: rowId(d2, "Победитель") },
      { playerId: abr, pointsRowId: rowId(d2, "Финалист") },
    ]);
    const r = ratingPage(db, String(g));
    expect(r.rows.map((x) => [x.place, x.player.name, x.points, x.tournaments])).toEqual([
      [1, "Абрамов Пётр", 60, 2],
      [2, "Ёлкин Олег", 50, 2],
      [2, "Яковлев Иван", 50, 2],
    ]);
    // Борисов has only a 0-point place: not in the rating.
    expect(playerPage(db, bor).groups).toEqual([]);
    expect(playerPage(db, yol).groups).toEqual([{ id: g, name: "Мужчины", points: 50, place: 2 }]);
  });

  test("a place 4 after a tie of three at 1", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const ids = players(db, ["Вега Ян", "Гусев Лев", "Дьяков Ян", "Жаров Ян"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", g, [["A", 10], ["B", 5]], ids);
    savePlacements(db, d.id, [
      ...ids.slice(0, 3).map((playerId) => ({ playerId, pointsRowId: rowId(d, "A") })),
      { playerId: ids[3], pointsRowId: rowId(d, "B") },
    ]);
    expect(ratingPage(db, String(g)).rows.map((x) => x.place)).toEqual([1, 1, 1, 4]);
  });

  test("equal sums in Russian dictionary order: Ё counts as Е, not before А", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const ids = players(db, ["Жуков Ян", "Ёлкин Ян", "Еремин Ян", "Абрамов Ян"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", g, [["A", 10]], ids);
    savePlacements(db, d.id, ids.map((playerId) => ({ playerId, pointsRowId: d.rows[0].id })));
    expect(ratingPage(db, String(g)).rows.map((r) => [r.place, r.player.name])).toEqual([
      [1, "Абрамов Ян"],
      [1, "Ёлкин Ян"],
      [1, "Еремин Ян"],
      [1, "Жуков Ян"],
    ]);
  });

  test("home page: the first five of each group and the three latest news", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const ids = players(db, ["Вега Ян", "Гусев Лев", "Дьяков Ян", "Жаров Ян", "Зуев Ян", "Ильин Ян"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", g, [["A", 10]], ids);
    savePlacements(db, d.id, ids.map((playerId) => ({ playerId, pointsRowId: d.rows[0].id })));
    for (const day of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]) saveNews(db, { title: day, date: day, body: "Текст" });
    const home = homePage(db, "2026-10-06");
    expect(home.rating.map((r) => r.rows.length)).toEqual([5]);
    expect(home.news.map((n) => n.title)).toEqual(["2026-09-04", "2026-09-03", "2026-09-02"]);
  });

  test("unknown or missing group opens the first group", () => {
    const db = memoryDb();
    const first = saveGroup(db, { name: "Первая" }).id;
    saveGroup(db, { name: "Вторая" });
    expect(ratingPage(db, null).groupId).toBe(first);
    expect(ratingPage(db, "999").groupId).toBe(first);
    expect(ratingPage(db, "abc").groupId).toBe(first);
  });
});

describe("points follow the table", () => {
  test("a division without a table gives no points; its places are published as text", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const ids = players(db, ["Вега Ян", "Гусев Лев"]);
    const t = tournament(db, "РТТ", "2026-05-01", false);
    const d = division(db, t, "2026-05-01", g, [], ids);
    savePlacements(db, d.id, [{ playerId: ids[0], placeText: "1 место" }]);
    expect(ratingPage(db, String(g)).rows).toEqual([]);
    const page = tournamentPage(db, t);
    expect(page.results[0]).toMatchObject({ hasTable: false, places: [{ place: "1 место" }] });
    expect(playerPage(db, ids[0]).results[0]).toMatchObject({ place: "1 место", points: null });
    expect(playerPage(db, ids[1]).results).toEqual([]); // no place: 0 points, not listed
  });

  test("renaming a row keeps places; changing points changes sums everywhere", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const ids = players(db, ["Вега Ян", "Гусев Лев"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", g, [["Победитель", 10]], ids);
    savePlacements(db, d.id, [{ playerId: ids[0], pointsRowId: d.rows[0].id }]);
    saveDivision(db, { tournamentId: t, name: "Разряд", groupId: g, rows: [{ id: d.rows[0].id, name: "1 место", points: 15 }] }, d.id);
    expect(ratingPage(db, String(g)).rows[0].points).toBe(15);
    expect(tournamentPage(db, t).results[0].rows[0]).toMatchObject({ name: "1 место", points: 15, players: [{ id: ids[0] }] });
    expect(playerPage(db, ids[0]).results[0]).toMatchObject({ place: "1 место", points: 15 });
  });

  test("a row with places cannot be removed", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const ids = players(db, ["Вега Ян", "Гусев Лев"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", g, [["Победитель", 10], ["Финалист", 5]], ids);
    savePlacements(db, d.id, [{ playerId: ids[0], pointsRowId: rowId(d, "Победитель") }, { playerId: ids[1], pointsRowId: rowId(d, "Победитель") }]);
    let e: unknown;
    try {
      saveDivision(db, { tournamentId: t, name: "Разряд", groupId: g, rows: [{ id: rowId(d, "Финалист"), name: "Финалист", points: 5 }] }, d.id);
    } catch (x) {
      e = x;
    }
    expect((e as ApiError).code).toBe("in_use");
    expect((e as ApiError).message).toBe("Это место отмечено у игроков: 2. Сначала снимите его в «Местах»");
  });

  test("a table appearing removes text places; a group is required with a table", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const ids = players(db, ["Вега Ян", "Гусев Лев"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", null, [], ids);
    savePlacements(db, d.id, [{ playerId: ids[0], placeText: "1 место" }]);
    expect(() => saveDivision(db, { tournamentId: t, name: "Разряд", groupId: null, rows: [{ name: "A", points: 1 }] }, d.id)).toThrow(ApiError);
    saveDivision(db, { tournamentId: t, name: "Разряд", groupId: g, rows: [{ name: "A", points: 1 }] }, d.id);
    expect(tournamentPage(db, t).results[0].anyPlacements).toBe(false);
  });

  test("a player who leaves the division loses the place there", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const [a, b, c] = players(db, ["Вега Ян", "Гусев Лев", "Дьяков Ян"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", g, [["A", 10]], [a, b]);
    const matchId = tournamentPage(db, t).matches[0].id;
    savePlacements(db, d.id, [{ playerId: a, pointsRowId: d.rows[0].id }, { playerId: b, pointsRowId: d.rows[0].id }]);
    // b replaced by c in the only match: b's place goes.
    saveMatch(db, { divisionId: d.id, round: "1-й круг", day: "2026-05-01", time: null, court: "", playerA: a, playerB: c, judgeId: null }, matchId);
    expect(ratingPage(db, String(g)).rows.map((r) => r.player.id)).toEqual([a]);
    deleteMatch(db, matchId);
    expect(ratingPage(db, String(g)).rows).toEqual([]);
  });

  test("places only for players of the division's matches; one place for several players", () => {
    const db = memoryDb();
    const g = saveGroup(db, { name: "Мужчины" }).id;
    const [a, b, outsider] = players(db, ["Вега Ян", "Гусев Лев", "Дьяков Ян"]);
    const t = tournament(db, "Турнир", "2026-05-01");
    const d = division(db, t, "2026-05-01", g, [["Полуфинал", 10]], [a, b]);
    expect(() => savePlacements(db, d.id, [{ playerId: outsider, pointsRowId: d.rows[0].id }])).toThrow(ApiError);
    savePlacements(db, d.id, [{ playerId: a, pointsRowId: d.rows[0].id }, { playerId: b, pointsRowId: d.rows[0].id }]);
    expect(tournamentPage(db, t).results[0].rows[0].players.map((p) => p.name)).toEqual(["Вега Ян", "Гусев Лев"]);
  });
});
