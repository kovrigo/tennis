import { type Side, replay, setsText } from "../score.ts";

// Point sequence for a target score in a:b order, e.g. "6:4, 6:7(5), 7:6(3)",
// optionally followed by an unfinished set "2:1" and a game "30:15".
// Sample matches are entered point by point through the judge's action, so their
// protocols have a real game-by-game flow.

const other = (s: Side): Side => (s === "a" ? "b" : "a");

/** One game won by `w`; `k` is the loser's points (3 means a deuce game). */
function game(w: Side, k: number): Side[] {
  const l = other(w);
  if (k === 3) return [w, l, w, l, w, l, w, w];
  const out: Side[] = [];
  for (let i = 0; i < k; i++) out.push(l, w);
  while (out.filter((s) => s === w).length < 4) out.push(w);
  return out;
}

function tiebreak(w: Side, loserPoints: number): Side[] {
  const l = other(w);
  const out: Side[] = [];
  for (let i = 0; i < loserPoints; i++) out.push(w, l);
  if (loserPoints >= 6) out.push(w, w);
  else for (let i = loserPoints; i < 7; i++) out.push(w);
  return out;
}

const LOSER_POINTS = [1, 2, 0, 3, 2, 1, 0, 2];

/** Games in order for a set a:b, with the set winner taking the last game(s). */
function setGames(a: number, b: number): Side[] {
  const w: Side = a > b ? "a" : "b";
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: Side[] = [];
  for (let i = 0; i < lo; i++) out.push(i % 2 ? other(w) : w, i % 2 ? w : other(w));
  for (let i = lo; i < hi; i++) out.push(w);
  return out;
}

export function pointsFor(score: string, current?: { games: [number, number]; game?: [number, number] }): Side[] {
  const points: Side[] = [];
  let n = 0;
  for (const part of score.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+):(\d+)(?:\((\d+)\))?$/);
    if (!m) throw new Error(`bad set ${part}`);
    const a = Number(m[1]);
    const b = Number(m[2]);
    const tb = (a === 7 && b === 6) || (a === 6 && b === 7);
    const games = tb ? setGames(6, 6).slice(0, 12) : setGames(a, b);
    for (const g of games) points.push(...game(g, LOSER_POINTS[n++ % LOSER_POINTS.length]));
    if (tb) points.push(...tiebreak(a > b ? "a" : "b", Number(m[3] ?? 5)));
  }
  if (current) {
    const [ga, gb] = current.games;
    const order: Side[] = [];
    for (let i = 0; i < Math.max(ga, gb); i++) {
      if (i < ga) order.push("a");
      if (i < gb) order.push("b");
    }
    for (const g of order) points.push(...game(g, LOSER_POINTS[n++ % LOSER_POINTS.length]));
    const [pa, pb] = current.game ?? [0, 0];
    for (let i = 0; i < Math.max(pa, pb); i++) {
      if (i < pa) points.push("a");
      if (i < pb) points.push("b");
    }
  }
  // Guard: the sequence must replay to exactly the target.
  const s = replay(points);
  const done = s.finished ? s.sets : s.sets.slice(0, -1);
  if (setsText(done, "a") !== score.replace(/\s+/g, " ").trim()) throw new Error(`points for ${score} replay as ${setsText(done, "a")}`);
  return points;
}
