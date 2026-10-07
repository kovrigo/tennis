import type { MatchRow, SetScore, Side } from "../../src/api-types.ts";
import { type Db, all } from "../db.ts";
import { type Action, type Score, countedPoints, replay } from "../score.ts";
import { matchNames } from "../services/common.ts";
import { durationText, moscowDay, moscowTime } from "../time.ts";

// One builder for every match list (home, online score, tournament page, judge's list):
// one query for the matches, one for all their actions, scores replayed in memory.

export interface MatchDbRow {
  id: number;
  division_id: number;
  round: string;
  day: string;
  time: string | null;
  court: string;
  player_a: number;
  player_b: number;
  judge_id: number | null;
  state: "not_started" | "running" | "finished";
  started_at: string | null;
  finished_at: string | null;
  manual_winner: Side | null;
  manual_sets: string | null;
  manual_note: string;
  manual_at: string | null;
  division_name: string;
  tournament_id: number;
  tournament_name: string;
  a_first: string;
  a_last: string;
  a_city: string;
  b_first: string;
  b_last: string;
  b_city: string;
}

export const MATCH_SELECT = `
  SELECT m.*, d.name AS division_name, t.id AS tournament_id, t.name AS tournament_name,
         pa.first_name AS a_first, pa.last_name AS a_last, pa.city AS a_city,
         pb.first_name AS b_first, pb.last_name AS b_last, pb.city AS b_city
  FROM matches m
  JOIN divisions d ON d.id = m.division_id
  JOIN tournaments t ON t.id = d.tournament_id
  JOIN players pa ON pa.id = m.player_a
  JOIN players pb ON pb.id = m.player_b`;

export function loadMatches(db: Db, where: string, ...params: (string | number | null)[]): MatchDbRow[] {
  return all<MatchDbRow>(db, `${MATCH_SELECT} WHERE ${where}`, ...params);
}

interface ActionRow {
  match_id: number;
  seq: number;
  type: "point" | "undo";
  side: Side | null;
  judge_id: number;
  at: string;
}

/** Actions of many matches in one query, by match id. */
export function actionsFor(db: Db, ids: number[]): Map<number, Action[]> {
  const out = new Map<number, Action[]>();
  if (!ids.length) return out;
  const rows = all<ActionRow>(
    db,
    "SELECT match_id, seq, type, side, judge_id, at FROM score_actions WHERE match_id IN (SELECT value FROM json_each(?)) ORDER BY match_id, seq",
    JSON.stringify(ids),
  );
  for (const r of rows) {
    const list = out.get(r.match_id) ?? [];
    list.push({ seq: r.seq, type: r.type, side: r.side, judgeId: r.judge_id, at: r.at });
    out.set(r.match_id, list);
  }
  return out;
}

export function manualSets(json: string | null): SetScore[] {
  if (!json) return [];
  try {
    return (JSON.parse(json) as [number, number][]).map(([a, b]) => ({ a, b }));
  } catch {
    return [];
  }
}

export function buildRow(m: MatchDbRow, actions: Action[]): MatchRow {
  const [aName, bName] = matchNames({ first_name: m.a_first, last_name: m.a_last }, { first_name: m.b_first, last_name: m.b_last });
  const points = countedPoints(actions);
  const score: Score = replay(points.map((p) => p.side));
  const manual = m.manual_winner !== null;
  const base = {
    id: m.id,
    tournamentId: m.tournament_id,
    tournamentName: m.tournament_name,
    divisionName: m.division_name,
    round: m.round,
    day: m.day,
    time: m.time,
    court: m.court,
    manualNote: manual ? m.manual_note : "",
    a: { id: m.player_a, name: aName },
    b: { id: m.player_b, name: bName },
    hasProtocol: manual || points.length > 0,
  };
  if (manual) {
    const sets = manualSets(m.manual_sets);
    return {
      ...base,
      state: "finished",
      manual: true,
      sets,
      game: null,
      tiebreak: false,
      setNumber: sets.length,
      winner: m.manual_winner,
      startedTime: null,
      startedDay: null,
      durationText: null,
    };
  }
  const first = points[0]?.at ?? null;
  const last = points.at(-1)?.at ?? null;
  return {
    ...base,
    state: points.length === 0 ? "not_started" : score.finished ? "finished" : "running",
    manual: false,
    sets: points.length ? score.sets : [],
    game: points.length && !score.finished ? score.game : null,
    tiebreak: score.tiebreak,
    setNumber: score.setNumber,
    winner: score.winner,
    startedTime: first ? moscowTime(first) : null,
    startedDay: first ? moscowDay(first) : null,
    durationText: score.finished && first && last ? durationText(first, last) : null,
  };
}

export function matchRows(db: Db, where: string, ...params: (string | number | null)[]): MatchRow[] {
  const rows = loadMatches(db, where, ...params);
  const actions = actionsFor(db, rows.map((r) => r.id));
  return rows.map((r) => buildRow(r, actions.get(r.id) ?? []));
}

const collator = new Intl.Collator("ru", { numeric: true });

/** By court (numbers inside compared as numbers), then time; no court last. */
export function byCourt(a: MatchRow, b: MatchRow): number {
  if (!a.court !== !b.court) return a.court ? -1 : 1;
  return collator.compare(a.court, b.court) || byTime(a, b);
}

/** By time; no time last. */
export function byTime(a: { time: string | null; court: string }, b: { time: string | null; court: string }): number {
  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  }
  return collator.compare(a.court, b.court);
}
