import { describe, expect, test } from "vitest";
import { type Action, type Side, progressionRows, replay, scoreFromActions, setsText } from "./score.ts";

// Builders: a game won 4:0 by `side`, n games alternating, a tiebreak to 7:k.
const game = (side: Side): Side[] => [side, side, side, side];
const games = (...sides: Side[]): Side[] => sides.flatMap(game);
const repeat = (n: number, side: Side): Side[] => games(...Array<Side>(n).fill(side));
/** Games alternating a, b, a, b ... until each side has `n` games. */
const evenGames = (n: number): Side[] => Array.from({ length: n }, () => games("a", "b")).flat();
const tiebreak = (winner: Side, loserPoints: number): Side[] => {
  const loser: Side = winner === "a" ? "b" : "a";
  const pts: Side[] = [];
  for (let i = 0; i < loserPoints; i++) pts.push(winner, loser);
  if (loserPoints >= 6) pts.push(winner, winner);
  else pts.push(...Array<Side>(7 - loserPoints).fill(winner));
  return pts;
};
const set64 = (w: Side): Side[] => [...evenGames(4), ...repeat(2, w)];
const set76 = (w: Side, tbLoser: number): Side[] => [...evenGames(6), ...tiebreak(w, tbLoser)];

const toActions = (points: Side[]): Action[] =>
  points.map((side, i) => ({ seq: i + 1, type: "point", side, judgeId: 1, at: `t${i}` }));
const undo = (actions: Action[], n = 1): Action[] => {
  const out = [...actions];
  for (let i = 0; i < n; i++) out.push({ seq: out.length + 1, type: "undo", side: null, judgeId: 1, at: "u" });
  return out;
};

describe("game", () => {
  test("calls 0, 15, 30, 40", () => {
    expect(replay([]).game).toEqual({ a: "0", b: "0" });
    expect(replay(["a"]).game).toEqual({ a: "15", b: "0" });
    expect(replay(["a", "a", "b"]).game).toEqual({ a: "30", b: "15" });
    expect(replay(["a", "a", "a"]).game).toEqual({ a: "40", b: "0" });
  });

  test("deuce and advantage, game needs two clear points", () => {
    const deuce: Side[] = ["a", "a", "a", "b", "b", "b"];
    expect(replay(deuce).game).toEqual({ a: "40", b: "40" });
    expect(replay([...deuce, "b"]).game).toEqual({ a: "40", b: "Б" });
    expect(replay([...deuce, "b", "a"]).game).toEqual({ a: "40", b: "40" });
    expect(replay([...deuce, "a", "b", "a", "a"]).sets).toEqual([{ a: 1, b: 0 }]);
  });
});

describe("set", () => {
  test("6:4 ends a set, 6:5 does not, 7:5 does", () => {
    expect(replay(set64("a")).sets).toEqual([{ a: 6, b: 4 }, { a: 0, b: 0 }]);
    const s65 = [...evenGames(5), ...game("a")];
    expect(replay(s65).sets).toEqual([{ a: 6, b: 5 }]);
    expect(replay(s65).tiebreak).toBe(false);
    expect(replay([...s65, ...game("a")]).sets).toEqual([{ a: 7, b: 5 }, { a: 0, b: 0 }]);
  });

  test("tiebreak at 6:6 to seven by two", () => {
    const at66 = evenGames(6);
    expect(replay(at66).tiebreak).toBe(true);
    expect(replay([...at66, "a", "b"]).game).toEqual({ a: "1", b: "1" });
    expect(replay([...at66, ...tiebreak("a", 5)]).sets).toEqual([{ a: 7, b: 6, tb: { a: 7, b: 5 } }, { a: 0, b: 0 }]);
    // 6:6 in the tiebreak goes on to 8:6.
    const tb86 = [...at66, ...tiebreak("b", 6)];
    expect(replay(tb86).sets[0]).toEqual({ a: 6, b: 7, tb: { a: 6, b: 8 } });
  });
});

describe("match", () => {
  test("two sets win the match", () => {
    const s = replay([...set64("a"), ...set64("a")]);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe("a");
    expect(s.game).toBeNull();
    expect(s.sets).toEqual([{ a: 6, b: 4 }, { a: 6, b: 4 }]);
  });

  test("third set tiebreak decides", () => {
    const pts = [...set76("a", 5), ...set76("b", 4), ...evenGames(6)];
    expect(replay(pts).tiebreak).toBe(true);
    expect(replay(pts).setNumber).toBe(3);
    const s = replay([...pts, ...tiebreak("a", 3)]);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe("a");
    expect(setsText(s.sets, "a")).toBe("7:6(5), 6:7(4), 7:6(3)");
    expect(setsText(s.sets, "b")).toBe("6:7(5), 7:6(4), 6:7(3)");
  });

  test("a point after the end is refused", () => {
    expect(() => replay([...set64("a"), ...set64("a"), "a"])).toThrow();
  });
});

describe("undo", () => {
  test("at 0:0 nothing to undo, repeated undo goes back to the start", () => {
    expect(scoreFromActions(undo([])).points).toBe(0);
    const acts = toActions(["a", "b", "a"]);
    expect(scoreFromActions(undo(acts, 3)).points).toBe(0);
    expect(scoreFromActions(undo(acts, 3)).game).toEqual({ a: "0", b: "0" });
  });

  test("across a game boundary", () => {
    const s = scoreFromActions(undo(toActions(game("a"))));
    expect(s.sets).toEqual([{ a: 0, b: 0 }]);
    expect(s.game).toEqual({ a: "40", b: "0" });
  });

  test("across a set boundary", () => {
    const s = scoreFromActions(undo(toActions(set64("b"))));
    expect(s.sets).toEqual([{ a: 4, b: 5 }]);
    expect(s.game).toEqual({ a: "0", b: "40" });
    expect(s.setNumber).toBe(1);
  });

  test("into and out of a tiebreak", () => {
    const at66 = evenGames(6);
    expect(scoreFromActions(undo(toActions(at66))).tiebreak).toBe(false);
    const s = scoreFromActions(undo(toActions([...at66, ...tiebreak("a", 5)])));
    expect(s.tiebreak).toBe(true);
    expect(s.game).toEqual({ a: "6", b: "5" });
  });

  test("after the match end reopens it", () => {
    const s = scoreFromActions(undo(toActions([...set64("a"), ...set64("a")])));
    expect(s.finished).toBe(false);
    expect(s.sets).toEqual([{ a: 6, b: 4 }, { a: 5, b: 4 }]);
    expect(s.game).toEqual({ a: "40", b: "0" });
  });

  test("undo then a point for the other side", () => {
    const acts = toActions(["a", "a"]);
    const next = [...undo(acts), { seq: 4, type: "point" as const, side: "b" as const, judgeId: 1, at: "x" }];
    expect(scoreFromActions(next).game).toEqual({ a: "15", b: "15" });
  });
});

describe("protocol", () => {
  test("games progression with the tiebreak as one cell", () => {
    const s = replay([...set64("a"), ...set76("b", 5), ...set76("a", 3)]);
    const rows = progressionRows(s);
    expect(rows).toHaveLength(3);
    expect(rows[0].cells).toEqual(["1:0", "1:1", "2:1", "2:2", "3:2", "3:3", "4:3", "4:4", "5:4", "6:4"]);
    expect(rows[1].cells.at(-1)).toBe("6:7");
    expect(rows[1].cells).toHaveLength(13);
    expect(rows[1].tiebreak).toBe("5:7");
    expect(rows[2].tiebreak).toBe("7:3");
    expect(setsText(s.sets, "a")).toBe("6:4, 6:7(5), 7:6(3)");
  });

  test("running match shows finished games only", () => {
    const rows = progressionRows(replay([...set64("a"), ...game("b"), "a"]));
    expect(rows).toHaveLength(2);
    expect(rows[1].cells).toEqual(["0:1"]);
  });
});
