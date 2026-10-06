import { describe, expect, test } from "vitest";
import { verifyPassword } from "./auth.ts";
import { all, get } from "./db.ts";
import { replay } from "./score.ts";
import { runSeeds } from "./seed.ts";
import { pointsFor } from "./seeds/points.ts";
import { seeds } from "./seeds/index.ts";
import { memoryDb, tmpDir } from "./testkit.ts";
import { judgeMatchesPage } from "./views/judge.ts";
import { homePage, livePage, protocol, ratingPage, tournamentPage, tournamentsPage } from "./views/public.ts";

// Samples on a clean database at three Moscow times of day.

const MOMENTS = [
  ["00:30", "2026-10-05T21:30:00Z"],
  ["12:00", "2026-10-06T09:00:00Z"],
  ["23:50", "2026-10-06T20:50:00Z"],
] as const;

describe.each(MOMENTS)("samples first run at %s Moscow", (_label, iso) => {
  const now = new Date(iso);
  const db = memoryDb();
  runSeeds(db, seeds, { now, filesDir: tmpDir("seed") });

  test("one tournament in each calendar group, one RTT without a points table", () => {
    const t = tournamentsPage(db, "2026-10-06");
    expect([t.running.length, t.upcoming.length, t.finished.length]).toEqual([1, 1, 1]);
    expect(t.running[0].kind).toBe("rtt");
    const open = tournamentPage(db, t.running[0].id, "2026-10-06");
    expect(open.results.every((d) => !d.hasTable)).toBe(true);
    expect([t.running, t.upcoming, t.finished].flat().every((x) => x.regulation?.type === "pdf")).toBe(true);
  });

  test("finished tournament: results, places, points and a 7:6, 6:7, 7:6 match", () => {
    const cup = tournamentPage(db, tournamentsPage(db, "2026-10-06").finished[0].id, "2026-10-06");
    expect(cup.matches.every((m) => m.state === "finished")).toBe(true);
    const men = cup.results.find((d) => d.name.startsWith("Мужчины"))!;
    expect(men.rows.map((r) => [r.name, r.points, r.players.length])).toEqual([
      ["Победитель", 100, 1],
      ["Финалист", 70, 1],
      ["Полуфинал", 40, 2],
      ["Четвертьфинал", 20, 4],
    ]);
    const women = cup.results.find((d) => d.name.startsWith("Женщины"))!;
    expect(women.hasTable).toBe(false);
    expect(women.places.map((p) => p.place)).toEqual(["1 место", "2 место"]);
    const semi = cup.matches.find((m) => m.sets.length === 3 && m.sets.every((s) => s.tb))!;
    const p = protocol(db, semi.id);
    expect(p.setsText).toBe("7:6(5), 6:7(4), 7:6(3)");
    expect(p.progression.map((r) => r.cells.length)).toEqual([13, 13, 13]);
    expect(p.judges).toEqual(["Иванов Пётр"]);
  });

  test("rating sums with shared places", () => {
    const r = ratingPage(db, null);
    expect(r.groups.map((g) => g.name)).toEqual(["Мужчины", "Юноши до 15 лет"]);
    expect(r.rows.map((x) => [x.place, x.player.name, x.points])).toEqual([
      [1, "Морозов Артём", 100],
      [2, "Кравцов Денис", 70],
      [3, "Логинов Максим", 40],
      [3, "Сафонов Илья", 40],
      [5, "Белов Кирилл", 20],
      [5, "Жуков Павел", 20],
      [5, "Никитин Роман", 20],
      [5, "Орлов Георгий", 20],
    ]);
    expect(homePage(db, "2026-10-06").rating[1].rows[0].player.name).toBe("Титов Матвей");
  });

  test("today: one running, one finished, one manual, the rest not started; nothing in the future", () => {
    const live = livePage(db, now);
    expect(live.running).toHaveLength(1);
    expect(live.running[0].game).toEqual({ a: "30", b: "15" });
    expect(live.finished.map((m) => (m.manual ? `manual ${m.manualNote}` : "judge")).sort()).toEqual(["judge", "manual отказ"]);
    expect(live.upcoming.map((m) => m.court)).toEqual(["Корт 3", "Корт 10"]);
    const latest = get<{ at: string }>(db, "SELECT MAX(at) AS at FROM score_actions")!.at;
    expect(latest <= now.toISOString()).toBe(true);
  });

  test("sample accounts sign in with the documented passwords; judges have today's matches", async () => {
    const users = all<{ login: string; role: string; password_hash: string }>(db, "SELECT login, role, password_hash FROM users ORDER BY login");
    expect(users.map((u) => [u.login, u.role])).toEqual([["judge1", "judge"], ["judge2", "judge"], ["organizer", "organizer"]]);
    const passwords = ["tennis-judge1", "tennis-judge2", "tennis-org"];
    expect(await Promise.all(users.map((u, i) => verifyPassword(passwords[i], u.password_hash)))).toEqual([true, true, true]);
    const judges = all<{ id: number; login: string }>(db, "SELECT id, login FROM users WHERE role = 'judge' ORDER BY login");
    const today = judgeMatchesPage(db, judges[0].id, now).matches.filter((m) => m.day === judgeMatchesPage(db, judges[0].id, now).today);
    expect(today.length).toBeGreaterThanOrEqual(2);
  });
});

test("points helper refuses a score it cannot reproduce", () => {
  expect(() => pointsFor("6:5")).toThrow();
  expect(replay(pointsFor("6:0, 6:0")).winner).toBe("a");
  expect(replay(pointsFor("6:4", { games: [2, 1], game: [3, 3] })).game).toEqual({ a: "40", b: "40" });
});
