// Tennis scoring from the judge's action log. Nothing here touches the database.
//
//   actions (seq order) ──► counted points (undo pops the last point)
//                              │
//                              ▼
//   game: 0-15-30-40, deuce/advantage ──► set: first to 6 by 2, tiebreak at 6:6
//                                          │    (first to 7 by 2, every set)
//                                          ▼
//                              match: first to 2 sets, then finished
//
// Every rule lives in replay(): undo is the same replay without the last
// point, so undo across a game, set or tiebreak needs no extra code.

export type Side = "a" | "b";

export interface Action {
  seq: number;
  type: "point" | "undo";
  side: Side | null;
  judgeId: number;
  at: string;
}

export interface CountedPoint {
  side: Side;
  judgeId: number;
  at: string;
}

export interface SetScore {
  a: number;
  b: number;
  /** Tiebreak points, present only when the set went to a tiebreak. */
  tb?: { a: number; b: number };
}

export interface Score {
  /** Finished sets, then the current set while the match runs. */
  sets: SetScore[];
  /** Current game: "0", "15", "30", "40", "Б", or tiebreak points. Null when finished. */
  game: { a: string; b: string } | null;
  tiebreak: boolean;
  finished: boolean;
  winner: Side | null;
  /** 1-based number of the current (or last) set. */
  setNumber: number;
  points: number;
  /** Per set: games after each finished game, in a:b order. A tiebreak is the last entry. */
  progression: { games: { a: number; b: number }[]; tiebreak: { a: number; b: number } | null }[];
}

const other = (s: Side): Side => (s === "a" ? "b" : "a");

/** Counted points after applying undos in order. */
export function countedPoints(actions: Action[]): CountedPoint[] {
  const stack: CountedPoint[] = [];
  for (const act of actions) {
    if (act.type === "point" && act.side) stack.push({ side: act.side, judgeId: act.judgeId, at: act.at });
    else if (act.type === "undo") stack.pop();
  }
  return stack;
}

export function scoreFromActions(actions: Action[]): Score {
  return replay(countedPoints(actions).map((p) => p.side));
}

export function replay(points: Side[]): Score {
  const done: SetScore[] = [];
  const progression: Score["progression"] = [{ games: [], tiebreak: null }];
  const setsWon = { a: 0, b: 0 };
  let games = { a: 0, b: 0 };
  let pts = { a: 0, b: 0 };
  let tiebreak = false;
  let winner: Side | null = null;

  for (const side of points) {
    if (winner) throw new Error("point after match end");
    pts[side]++;
    const target = tiebreak ? 7 : 4;
    if (pts[side] < target || pts[side] - pts[other(side)] < 2) continue;

    // Game (or tiebreak) won.
    const current = progression[progression.length - 1];
    let setWon = false;
    if (tiebreak) {
      const tb = { ...pts };
      games[side]++;
      current.tiebreak = tb;
      done.push({ ...games, tb });
      setWon = true;
    } else {
      games[side]++;
      current.games.push({ ...games });
      if (games[side] >= 6 && games[side] - games[other(side)] >= 2) {
        done.push({ ...games });
        setWon = true;
      } else if (games.a === 6 && games.b === 6) {
        tiebreak = true;
      }
    }
    pts = { a: 0, b: 0 };
    if (setWon) {
      tiebreak = false;
      setsWon[side]++;
      games = { a: 0, b: 0 };
      if (setsWon[side] === 2) winner = side;
      else progression.push({ games: [], tiebreak: null });
    }
  }

  const finished = winner !== null;
  const sets = finished ? done : [...done, { ...games }];
  return {
    sets,
    game: finished ? null : tiebreak ? { a: String(pts.a), b: String(pts.b) } : gameText(pts),
    tiebreak: !finished && tiebreak,
    finished,
    winner,
    setNumber: finished ? done.length : done.length + 1,
    points: points.length,
    progression,
  };
}

const CALLS = ["0", "15", "30", "40"];

function gameText(p: { a: number; b: number }): { a: string; b: string } {
  if (p.a >= 3 && p.b >= 3) {
    if (p.a === p.b) return { a: "40", b: "40" };
    return p.a > p.b ? { a: "Б", b: "40" } : { a: "40", b: "Б" };
  }
  return { a: CALLS[p.a], b: CALLS[p.b] };
}

/**
 * Sets as text, e.g. "6:4, 6:7(5), 7:6(3)". `from` decides whose games come first.
 * A tiebreak set adds the tiebreak loser's points in brackets.
 */
export function setsText(sets: SetScore[], from: Side): string {
  return sets
    .map((s) => {
      const first = from === "a" ? s.a : s.b;
      const second = from === "a" ? s.b : s.a;
      const tb = s.tb ? `(${Math.min(s.tb.a, s.tb.b)})` : "";
      return `${first}:${second}${tb}`;
    })
    .join(", ");
}

/** Protocol "Ход матча": one row per set, cells "1:0", tiebreak as the last cell with its points below. */
export function progressionRows(score: Score): { set: number; cells: string[]; tiebreak: string | null }[] {
  return score.progression
    .map((p, i) => {
      const cells = p.games.map((g) => `${g.a}:${g.b}`);
      let tiebreak: string | null = null;
      if (p.tiebreak) {
        const set = score.sets[i];
        cells.push(`${set.a}:${set.b}`);
        tiebreak = `${p.tiebreak.a}:${p.tiebreak.b}`;
      }
      return { set: i + 1, cells, tiebreak };
    })
    .filter((row) => row.cells.length > 0);
}
