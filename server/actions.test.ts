import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { JudgeMatch } from "../src/api-types.ts";
import { get } from "./db.ts";
import { ApiError } from "./http.ts";
import { applyAction, clearManualResult, saveMatch, setManualResult } from "./services/matches.ts";
import { pointsFor } from "./seeds/points.ts";
import { type TestApp, action, addJudge, addMatchSetup, addOrganizer, memoryDb, startApp } from "./testkit.ts";
import { judgeMatch, judgeMatchesPage } from "./views/judge.ts";
import { protocol } from "./views/public.ts";

// Judge actions: S6.5, S9.1, S9.7, S9.8, S9.10–S9.13, S10.2–S10.3.

const at = (iso: string) => new Date(iso);
const MSK_LATE = "2026-10-06T20:50:00Z"; // 23:50 Moscow
const MSK_NEXT = "2026-10-06T21:10:00Z"; // 00:10 Moscow, next day

function refusal(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("no refusal");
}

function setup() {
  const db = memoryDb();
  const judge = addJudge(db);
  const other = addJudge(db, "judge2", "tennis-judge2", "Кузнецов");
  const s = addMatchSetup(db, { start: "2026-10-05", end: "2026-10-07", day: "2026-10-06", judgeId: judge });
  return { db, judge, other, ...s };
}

/** Plays points through the action function, one second apart from `start`. */
function play(db: ReturnType<typeof memoryDb>, matchId: number, judgeId: number, sides: ("a" | "b")[], start: string, fromSeq = 0) {
  let m: JudgeMatch | null = null;
  sides.forEach((side, i) => {
    m = applyAction(db, matchId, judgeId, action("point", fromSeq + i, side), new Date(Date.parse(start) + i * 1000));
  });
  return m!;
}

describe("action order", () => {
  test("a point is counted, the state and start are written", () => {
    const { db, judge, matchId } = setup();
    const m = applyAction(db, matchId, judge, action("point", 0, "a"), at("2026-10-06T07:00:00Z"));
    expect(m.seq).toBe(1);
    expect(m.game).toEqual({ a: "15", b: "0" });
    expect(get(db, "SELECT state, started_at FROM matches WHERE id = ?", matchId)).toEqual({ state: "running", started_at: "2026-10-06T07:00:00.000Z" });
  });

  test("resend with the same requestId counts once; another action under it is refused", () => {
    const { db, judge, matchId } = setup();
    const first = action("point", 0, "a");
    applyAction(db, matchId, judge, first, at("2026-10-06T07:00:00Z"));
    const again = applyAction(db, matchId, judge, first, at("2026-10-06T07:00:05Z"));
    expect(again.points).toBe(1);
    expect(again.seq).toBe(1);
    expect(refusal(() => applyAction(db, matchId, judge, { ...first, side: "b" })).status).toBe(400);
  });

  test("a tap from an old score is refused with the current score, also after undo then a point for the other side", () => {
    const { db, judge, matchId } = setup();
    play(db, matchId, judge, ["a", "a"], "2026-10-06T07:00:00Z");
    const stale = refusal(() => applyAction(db, matchId, judge, action("point", 1, "b")));
    expect(stale.code).toBe("stale");
    expect((stale.extra.match as JudgeMatch).game).toEqual({ a: "30", b: "0" });
    // Phone 1 undoes and scores for b: points are 1 again, but seq moved to 4.
    applyAction(db, matchId, judge, action("undo", 2), at("2026-10-06T07:01:00Z"));
    applyAction(db, matchId, judge, action("point", 3, "b"), at("2026-10-06T07:02:00Z"));
    expect(refusal(() => applyAction(db, matchId, judge, action("point", 2, "a"))).code).toBe("stale");
  });

  test("another judge's match and a manual result are refused", () => {
    const { db, other, judge, matchId } = setup();
    expect(refusal(() => applyAction(db, matchId, other, action("point", 0, "a"))).code).toBe("not_your_match");
    setManualResult(db, matchId, { winner: "a", sets: [], note: "отказ" });
    const e = refusal(() => applyAction(db, matchId, judge, action("point", 0, "a")));
    expect(e.code).toBe("manual_result");
    expect((e.extra.match as JudgeMatch).manual).toBe(true);
  });

  test("nothing to undo at 0:0; point after the end refused", () => {
    const { db, judge, matchId } = setup();
    expect(refusal(() => applyAction(db, matchId, judge, action("undo", 0))).code).toBe("nothing_to_undo");
    const m = play(db, matchId, judge, pointsFor("6:0, 6:0"), "2026-10-06T07:00:00Z");
    expect(m.finished).toBe(true);
    expect(m.setsText).toBe("6:0, 6:0");
    expect(refusal(() => applyAction(db, matchId, judge, action("point", m.seq, "a"))).code).toBe("finished");
  });

  test("bad bodies are refused", () => {
    const { db, judge, matchId } = setup();
    for (const body of [{}, { ...action("point", 0), side: undefined }, { ...action("point", 0, "a"), requestId: "x" }, { ...action("point", -1, "a") }]) {
      expect(refusal(() => applyAction(db, matchId, judge, body)).code).toBe("bad_request");
    }
  });
});

describe("undo after the end", () => {
  test("the same Moscow day: allowed, the match reopens", () => {
    const { db, judge, matchId } = setup();
    const m = play(db, matchId, judge, pointsFor("6:0, 6:0"), "2026-10-06T19:00:00Z");
    expect(judgeMatch(db, matchId, judge, at(MSK_LATE)).undoOpen).toBe(true);
    const back = applyAction(db, matchId, judge, action("undo", m.seq), at(MSK_LATE));
    expect(back.finished).toBe(false);
    expect(get(db, "SELECT state, finished_at FROM matches WHERE id = ?", matchId)).toEqual({ state: "running", finished_at: null });
  });

  test("after Moscow midnight: closed for the judge", () => {
    const { db, judge, matchId } = setup();
    const m = play(db, matchId, judge, pointsFor("6:0, 6:0"), "2026-10-06T19:00:00Z");
    expect(judgeMatch(db, matchId, judge, at(MSK_NEXT)).undoOpen).toBe(false);
    expect(refusal(() => applyAction(db, matchId, judge, action("undo", m.seq), at(MSK_NEXT))).code).toBe("undo_closed");
  });
});

describe("organizer changes", () => {
  test("new judge continues from the current score, the old one is refused, the protocol lists both", () => {
    const { db, judge, other, matchId, divisionId, a, b } = setup();
    play(db, matchId, judge, ["a", "a", "a"], "2026-10-06T07:00:00Z");
    saveMatch(db, { divisionId, round: "Финал", day: "2026-10-06", time: "10:00", court: "Корт 1", playerA: a, playerB: b, judgeId: other }, matchId);
    expect(refusal(() => applyAction(db, matchId, judge, action("point", 3, "a"))).code).toBe("not_your_match");
    const m = applyAction(db, matchId, other, action("point", 3, "b"), at("2026-10-06T07:05:00Z"));
    expect(m.game).toEqual({ a: "40", b: "15" });
    expect(judgeMatch(db, matchId, judge).mine).toBe(false);
    expect(protocol(db, matchId).judges).toEqual(["Иванов Пётр", "Кузнецов Пётр"]);
  });

  test("editing players of a started match keeps the score", () => {
    const { db, judge, matchId, divisionId, a } = setup();
    play(db, matchId, judge, ["a", "b"], "2026-10-06T07:00:00Z");
    const c = saveMatch(db, {
      divisionId,
      round: "Финал",
      day: "2026-10-06",
      time: "10:00",
      court: "Корт 1",
      playerA: a,
      playerB: 0,
      newB: { firstName: "Илья", lastName: "Сафонов", city: "Выборг" },
      judgeId: judge,
    }, matchId);
    expect(c.b.name).toBe("Сафонов Илья");
    expect(judgeMatch(db, matchId, judge).game).toEqual({ a: "15", b: "15" });
  });

  test("manual result closes the match for the judge; removing it reopens with the saved points", () => {
    const { db, judge, matchId } = setup();
    play(db, matchId, judge, ["a", "a"], "2026-10-06T07:00:00Z");
    setManualResult(db, matchId, { winner: "b", sets: [[3, 6], [2, 6]], note: "отказ" });
    expect(get(db, "SELECT state, finished_at FROM matches WHERE id = ?", matchId)).toEqual({ state: "finished", finished_at: null });
    const p = protocol(db, matchId);
    expect(p.manual).toBe(true);
    expect(p.setsText).toBe("6:3, 6:2");
    expect(p.progression).toEqual([]);
    clearManualResult(db, matchId);
    const m = applyAction(db, matchId, judge, action("point", 2, "a"), at("2026-10-06T07:10:00Z"));
    expect(m.game).toEqual({ a: "40", b: "0" });
  });

  test("manual result: winner required, sets must agree with the winner; a match stopped early may end on an unfinished set", () => {
    const { db, matchId } = setup();
    const sets = (winner: "a" | "b", s: [number, number][]) => refusal(() => setManualResult(db, matchId, { winner, sets: s, note: "" })).extra.fields;
    expect(refusal(() => setManualResult(db, matchId, { sets: [], note: "" })).extra.fields).toHaveProperty("winner");
    expect(sets("a", [[3, 6], [2, 6]])).toEqual({ sets: "По этому счёту победил другой игрок" });
    expect(sets("a", [[6, 4], [4, 6]])).toEqual({ sets: "По этому счёту победил другой игрок" });
    expect(sets("b", [[6, 4], [3, 3]])).toEqual({ sets: "По этому счёту победил другой игрок" });
    expect(sets("a", [[3, 3], [6, 4]])).toEqual({ sets: "Незаконченным может быть только последний сет" });
    // Retired: the winner leads, is level in sets, or the first set was not finished.
    for (const s of [[[6, 4], [3, 3]], [[6, 4], [3, 6], [1, 2]], [[6, 6]], [[4, 6], [6, 3], [10, 8]]] as [number, number][][]) {
      expect(setManualResult(db, matchId, { winner: "a", sets: s, note: "отказ" }).manual?.sets).toEqual(s);
    }
  });
});

describe("protocol times", () => {
  test("start and end are the first and last counted points; undone points do not count", () => {
    const { db, judge, matchId } = setup();
    applyAction(db, matchId, judge, action("point", 0, "b"), at("2026-10-06T06:50:00Z"));
    applyAction(db, matchId, judge, action("undo", 1), at("2026-10-06T06:51:00Z"));
    const pts = pointsFor("6:0, 6:0");
    play(db, matchId, judge, pts, "2026-10-06T07:00:00Z", 2);
    const p = protocol(db, matchId);
    expect(p.startedTime).toBe("10:00");
    expect(p.finishedTime).toBe("10:01");
    expect(p.durationText).toBe("1 мин");
  });
});

describe("undo to the start", () => {
  test("undoing every point returns the match to not started; scoring goes on", () => {
    const { db, judge, matchId } = setup();
    play(db, matchId, judge, ["a", "b"], "2026-10-06T07:00:00Z");
    applyAction(db, matchId, judge, action("undo", 2), at("2026-10-06T07:01:00Z"));
    applyAction(db, matchId, judge, action("undo", 3), at("2026-10-06T07:01:05Z"));
    expect(get(db, "SELECT state, started_at, finished_at FROM matches WHERE id = ?", matchId)).toEqual({ state: "not_started", started_at: null, finished_at: null });
    expect(refusal(() => applyAction(db, matchId, judge, action("undo", 4))).code).toBe("nothing_to_undo");
    const m = applyAction(db, matchId, judge, action("point", 4, "b"), at("2026-10-06T07:02:00Z"));
    expect([m.seq, m.points, m.game]).toEqual([5, 1, { a: "0", b: "15" }]);
  });
});

describe("judge's list", () => {
  test("own matches only: today, later days and the ones still running from past days", () => {
    const { db, judge, other, divisionId, a, b, matchId } = setup();
    const more = (day: string, judgeId: number, time = "12:00") =>
      saveMatch(db, { divisionId, round: "1-й круг", day, time, court: "Корт 2", playerA: a, playerB: b, judgeId }).id;
    const pastDone = more("2026-10-05", judge);
    play(db, pastDone, judge, pointsFor("6:0, 6:0"), "2026-10-05T07:00:00Z");
    const pastRunning = more("2026-10-05", judge);
    applyAction(db, pastRunning, judge, action("point", 0, "a"), at("2026-10-05T09:00:00Z"));
    // Finished after Moscow midnight: the judge may still undo today, so it stays listed.
    const pastLate = more("2026-10-05", judge, "20:00");
    play(db, pastLate, judge, pointsFor("6:0, 6:0"), "2026-10-05T20:59:30Z");
    more("2026-10-05", judge); // not started, day passed
    const tomorrow = more("2026-10-07", judge);
    more("2026-10-06", other);
    const page = judgeMatchesPage(db, judge, at("2026-10-06T09:00:00Z"));
    expect(page.matches.map((m) => m.id)).toEqual([pastRunning, pastLate, matchId, tomorrow]);
    expect(judgeMatch(db, pastLate, judge, at("2026-10-06T09:00:00Z")).undoOpen).toBe(true);
    expect(judgeMatchesPage(db, other, at("2026-10-06T09:00:00Z")).matches).toHaveLength(1);
  });
});

describe("over HTTP", () => {
  let app: TestApp;
  let judgeCookie: string;
  let matchId: number;
  beforeAll(async () => {
    const db = memoryDb();
    addOrganizer(db);
    const judge = addJudge(db);
    matchId = addMatchSetup(db, { start: "2026-10-05", end: "2026-10-07", day: "2026-10-06", judgeId: judge }).matchId;
    app = await startApp(db);
    judgeCookie = await app.login("judge1", "tennis-judge1");
  });
  afterAll(() => app.close());

  test("a stale tap gets 409 with the current match in the body", async () => {
    const ok = await app.call("POST", `/api/judge/matches/${matchId}/actions`, { cookie: judgeCookie, body: action("point", 0, "a") });
    expect(ok.status).toBe(200);
    const stale = await app.call("POST", `/api/judge/matches/${matchId}/actions`, { cookie: judgeCookie, body: action("point", 0, "b") });
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error).toBe("stale");
    expect(body.match.seq).toBe(1);
  });
});
