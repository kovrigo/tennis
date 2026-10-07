import type { JudgeMatch, JudgeMatchesPage } from "../../src/api-types.ts";
import { type Db, get } from "../db.ts";
import { countedPoints, replay, setsText } from "../score.ts";
import { matchNames, notFoundUnless, shortName } from "../services/common.ts";
import { moscowDay, moscowDayStart } from "../time.ts";
import { actionsFor, byTime, loadMatches, matchRows } from "./matchRows.ts";

/** The scoring screen's match, as stored; also the answer to every action. */
export function judgeMatch(db: Db, matchId: number, judgeId: number, now = new Date()): JudgeMatch {
  const m = notFoundUnless(loadMatches(db, "m.id = ?", matchId)[0]);
  const actions = actionsFor(db, [matchId]).get(matchId) ?? [];
  const points = countedPoints(actions);
  const score = replay(points.map((p) => p.side));
  const [aName, bName] = matchNames({ first_name: m.a_first, last_name: m.a_last }, { first_name: m.b_first, last_name: m.b_last });
  const mine = m.judge_id === judgeId;
  const manual = m.manual_winner !== null;
  const lastDay = points.length ? moscowDay(points.at(-1)!.at) : null;
  return {
    id: m.id,
    tournamentName: m.tournament_name,
    divisionName: m.division_name,
    round: m.round,
    court: m.court,
    day: m.day,
    time: m.time,
    a: { id: m.player_a, name: aName },
    b: { id: m.player_b, name: bName },
    seq: actions.at(-1)?.seq ?? 0,
    sets: score.sets,
    game: score.game,
    tiebreak: score.tiebreak,
    setNumber: score.setNumber,
    finished: score.finished,
    winner: score.winner,
    points: points.length,
    setsText: score.finished && score.winner ? setsText(score.sets, score.winner) : "",
    mine,
    manual,
    undoOpen: mine && !manual && points.length > 0 && (!score.finished || lastDay! >= moscowDay(now)),
  };
}

/** Own matches: today and later, still running from past days, finished today by the judge (undo is open till midnight). */
export function judgeMatchesPage(db: Db, judgeId: number, now = new Date()): JudgeMatchesPage {
  const today = moscowDay(now);
  const judge = notFoundUnless(get<{ first_name: string; last_name: string }>(db, "SELECT first_name, last_name FROM users WHERE id = ?", judgeId));
  const matches = matchRows(
    db,
    "m.judge_id = ? AND (m.day >= ? OR m.state = 'running' OR (m.state = 'finished' AND m.manual_winner IS NULL AND m.finished_at >= ?))",
    judgeId,
    today,
    moscowDayStart(today),
  ).sort(
    (a, b) => a.day.localeCompare(b.day) || byTime(a, b),
  );
  return { judgeName: shortName(judge), today, matches };
}
