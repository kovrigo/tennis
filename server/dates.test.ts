import { describe, expect, test } from "vitest";
import { applyAction, saveMatch, setManualResult } from "./services/matches.ts";
import { pointsFor } from "./seeds/points.ts";
import { saveTournament } from "./services/tournaments.ts";
import { action, addJudge, addMatchSetup, memoryDb } from "./testkit.ts";
import { durationText, moscowDay, moscowTime } from "./time.ts";
import { homePage, livePage, tournamentsPage } from "./views/public.ts";

// Moscow dates: S1.1 calendar groups, S2.1 online score, the day change at Moscow midnight.

describe("Moscow day", () => {
  test("21:00 UTC is already the next day in Moscow", () => {
    expect(moscowDay(new Date("2026-10-06T20:59:59Z"))).toBe("2026-10-06");
    expect(moscowDay(new Date("2026-10-06T21:00:00Z"))).toBe("2026-10-07");
    expect(moscowTime("2026-10-06T07:04:00Z")).toBe("10:04");
    expect(durationText("2026-10-06T07:00:00Z", "2026-10-06T08:12:30Z")).toBe("1 ч 13 мин");
  });
});

describe("calendar groups", () => {
  test("running includes the last day; upcoming and finished by Moscow date", () => {
    const db = memoryDb();
    const t = (name: string, startDate: string, endDate: string) =>
      saveTournament(db, { name, startDate, endDate, city: "Тосно", venue: "", kind: "amateur", category: "" });
    t("Вчера закончился", "2026-10-01", "2026-10-05");
    t("Сегодня последний день", "2026-10-04", "2026-10-06");
    t("Сегодня первый день", "2026-10-06", "2026-10-09");
    t("Завтра", "2026-10-07", "2026-10-07");
    t("Позже", "2026-11-01", "2026-11-02");
    const page = tournamentsPage(db, "2026-10-06");
    expect(page.running.map((x) => x.name)).toEqual(["Сегодня последний день", "Сегодня первый день"]);
    expect(page.upcoming.map((x) => x.name)).toEqual(["Завтра", "Позже"]);
    expect(page.finished.map((x) => x.name)).toEqual(["Вчера закончился"]);
    const home = homePage(db, "2026-10-06");
    expect(home.hero?.name).toBe("Сегодня последний день");
    expect(home.upcoming.map((x) => x.name)).toEqual(["Сегодня последний день", "Сегодня первый день", "Завтра"]);
  });
});

describe("online score", () => {
  function setup() {
    const db = memoryDb();
    const judge = addJudge(db);
    const s = addMatchSetup(db, { start: "2026-10-05", end: "2026-10-07", day: "2026-10-06", judgeId: judge });
    const more = (day: string, time: string | null, court: string) =>
      saveMatch(db, { divisionId: s.divisionId, round: "1-й круг", day, time, court, playerA: s.a, playerB: s.b, judgeId: judge }).id;
    return { db, judge, ...s, more };
  }

  test("today's matches and every running one, in three groups", () => {
    const { db, judge, matchId, more } = setup();
    const runningFromYesterday = more("2026-10-05", "18:00", "Корт 2");
    applyAction(db, runningFromYesterday, judge, action("point", 0, "a"), new Date("2026-10-05T15:00:00Z"));
    const later = more("2026-10-06", null, "Корт 10");
    const early = more("2026-10-06", "09:00", "Корт 2");
    const tomorrow = more("2026-10-07", "10:00", "Корт 1");
    const now = new Date("2026-10-06T09:00:00Z"); // 12:00 Moscow
    const live = livePage(db, now);
    expect(live.today).toBe("2026-10-06");
    expect(live.updatedAt).toBe("12:00");
    expect(live.running.map((m) => m.id)).toEqual([runningFromYesterday]);
    expect(live.running[0].startedDay).toBe("2026-10-05");
    expect(live.upcoming.map((m) => m.id)).toEqual([early, matchId, later]);
    expect(live.finished).toEqual([]);
    expect([...live.running, ...live.upcoming].some((m) => m.id === tomorrow)).toBe(false);
  });

  test("finished today: judge-finished today or scheduled today; an old match closed by a manual result today is not", () => {
    const { db, judge, matchId, more } = setup();
    const yesterdayLate = more("2026-10-05", "20:00", "Корт 3");
    // Started yesterday 23:00 Moscow, finished today 00:30 Moscow.
    const pts = pointsFor("6:0, 6:0");
    pts.forEach((side, i) => applyAction(db, yesterdayLate, judge, action("point", i, side), new Date(Date.parse("2026-10-05T20:00:00Z") + i * 60_000)));
    const oldWalkover = more("2026-10-05", "10:00", "Корт 4");
    setManualResult(db, oldWalkover, { winner: "a", sets: [], note: "неявка" });
    setManualResult(db, matchId, { winner: "b", sets: [], note: "отказ" });
    const live = livePage(db, new Date("2026-10-06T09:00:00Z"));
    expect(live.finished.map((m) => m.id).sort()).toEqual([matchId, yesterdayLate].sort());
  });

  test("after Moscow midnight the page moves to the new day", () => {
    const { db, matchId } = setup();
    expect(livePage(db, new Date("2026-10-06T20:59:00Z")).upcoming.map((m) => m.id)).toEqual([matchId]);
    const next = livePage(db, new Date("2026-10-06T21:01:00Z"));
    expect(next.today).toBe("2026-10-07");
    expect(next.upcoming).toEqual([]);
  });
});
