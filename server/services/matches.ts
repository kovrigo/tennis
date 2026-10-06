import type { ActionRequest, AdminMatch, JudgeMatch, ManualResultInput, MatchInput, NewPlayer, Side } from "../../src/api-types.ts";
import { type Db, all, get, run, tx } from "../db.ts";
import { ApiError, fail } from "../http.ts";
import { countedPoints, replay } from "../score.ts";
import { isDay, isTime, moscowDay } from "../time.ts";
import { judgeMatch } from "../views/judge.ts";
import { actionsFor } from "../views/matchRows.ts";
import { type Fields, UUID, check, createOnce, fullName, intOrNull, notFoundUnless, obj, required, str } from "./common.ts";
import { createPlayer, findDuplicates, playerRow, validatePlayer } from "./players.ts";

// Matches: schedule, judge actions, manual result.
//
// matches.state / started_at / finished_at are written only by recomputeMatch,
// from the action log and the manual result, inside the same transaction.

interface MatchRecord {
  id: number;
  division_id: number;
  judge_id: number | null;
  player_a: number;
  player_b: number;
  manual_winner: Side | null;
}

const getMatch = (db: Db, id: number) =>
  get<MatchRecord>(db, "SELECT id, division_id, judge_id, player_a, player_b, manual_winner FROM matches WHERE id = ?", id);

/** Writes state, start and end from the log and the manual result. */
export function recomputeMatch(db: Db, matchId: number): void {
  const m = notFoundUnless(getMatch(db, matchId));
  const points = countedPoints(actionsFor(db, [matchId]).get(matchId) ?? []);
  const score = replay(points.map((p) => p.side));
  const first = points[0]?.at ?? null;
  let state: string;
  let finishedAt: string | null = null;
  if (m.manual_winner) state = "finished";
  else if (!points.length) state = "not_started";
  else if (score.finished) {
    state = "finished";
    finishedAt = points.at(-1)!.at;
  } else state = "running";
  run(db, "UPDATE matches SET state = ?, started_at = ?, finished_at = ? WHERE id = ?", state, first, finishedAt, matchId);
}

/** Counted points of a match (after undos). */
export function pointsCount(db: Db, matchId: number): number {
  return countedPoints(actionsFor(db, [matchId]).get(matchId) ?? []).length;
}

// ---------- judge action ----------

/**
 * One judge action, all in one transaction, checks in this order:
 *   1 assigned to this judge, no manual result   → 403 not_your_match / 409 manual_result
 *   2 requestId seen: same action → current score; different → 400
 *   3 expectedSeq is the last seq                 → else 409 stale
 *   4 point after the end / undo with no points   → 409 finished / nothing_to_undo
 *   5 undo after the end on a later Moscow day    → 409 undo_closed
 *   6 append seq + 1, recompute the match
 * Step 2 comes before 3, or a resend of a saved point would look stale.
 */
export function applyAction(db: Db, matchId: number, judgeId: number, body: unknown, now = new Date()): JudgeMatch {
  const b = obj(body);
  const req: ActionRequest = {
    requestId: typeof b.requestId === "string" ? b.requestId : "",
    type: b.type === "point" || b.type === "undo" ? b.type : ("" as never),
    side: b.side === "a" || b.side === "b" ? b.side : undefined,
    expectedSeq: intOrNull(b.expectedSeq) ?? -1,
  };
  if (!UUID.test(req.requestId) || !req.type || (req.type === "point" && !req.side) || req.expectedSeq < 0) {
    throw fail.badRequest("Неверное действие");
  }
  const side = req.type === "point" ? req.side! : null;
  return tx(db, () => {
    const m = notFoundUnless(getMatch(db, matchId));
    const refuse = (status: number, code: ConstructorParameters<typeof ApiError>[1], message: string) =>
      new ApiError(status, code, message, { match: judgeMatch(db, matchId, judgeId, now) });
    if (m.judge_id !== judgeId) throw refuse(403, "not_your_match", "Матч передан другому судье. Отмечать очки больше нельзя");
    if (m.manual_winner) throw refuse(409, "manual_result", "Организатор внёс итог вручную. Матч больше не ведётся");

    const seen = get<{ type: string; side: string | null }>(
      db,
      "SELECT type, side FROM score_actions WHERE match_id = ? AND request_id = ?",
      matchId,
      req.requestId,
    );
    if (seen) {
      if (seen.type === req.type && seen.side === side) return judgeMatch(db, matchId, judgeId, now);
      throw new ApiError(400, "validation", "Этот номер действия уже использован для другого действия");
    }

    const actions = actionsFor(db, [matchId]).get(matchId) ?? [];
    const lastSeq = actions.at(-1)?.seq ?? 0;
    if (req.expectedSeq !== lastSeq) throw refuse(409, "stale", "Счёт изменился на другом телефоне. Действие не выполнено, показан текущий счёт");

    const points = countedPoints(actions);
    const score = replay(points.map((p) => p.side));
    if (req.type === "point" && score.finished) throw refuse(409, "finished", "Матч завершён");
    if (req.type === "undo" && !points.length) throw refuse(409, "nothing_to_undo", "Отменять нечего");
    if (req.type === "undo" && score.finished && moscowDay(points.at(-1)!.at) < moscowDay(now)) {
      throw refuse(409, "undo_closed", "Исправить итог может организатор");
    }

    run(
      db,
      "INSERT INTO score_actions (match_id, seq, type, side, request_id, judge_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      matchId,
      lastSeq + 1,
      req.type,
      side,
      req.requestId,
      judgeId,
      now.toISOString(),
    );
    recomputeMatch(db, matchId);
    return judgeMatch(db, matchId, judgeId, now);
  });
}

// ---------- schedule ----------

/** Places of players who no longer play in a division are removed (they would count invisibly). */
export function dropStalePlacements(db: Db, divisionId: number): void {
  run(
    db,
    `DELETE FROM placements WHERE division_id = ?
       AND player_id NOT IN (SELECT player_a FROM matches WHERE division_id = ? UNION SELECT player_b FROM matches WHERE division_id = ?)`,
    divisionId,
    divisionId,
    divisionId,
  );
}

function newPlayerInput(v: unknown): NewPlayer | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  return { firstName: str(p.firstName, 100), lastName: str(p.lastName, 100), city: str(p.city, 100) };
}

export function saveMatch(db: Db, body: unknown, id?: number): AdminMatch {
  const b = obj(body);
  const errs: Fields = {};
  const divisionId = intOrNull(b.divisionId);
  const round = required(errs, "round", b.round, "Укажите круг", 100);
  const day = str(b.day, 10);
  const time = str(b.time, 5) || null;
  const court = str(b.court, 60);
  const judgeId = b.judgeId === null || b.judgeId === undefined || b.judgeId === "" ? null : intOrNull(b.judgeId);
  const newA = newPlayerInput(b.newA);
  const newB = newPlayerInput(b.newB);
  let playerA = newA ? 0 : (intOrNull(b.playerA) ?? 0);
  let playerB = newB ? 0 : (intOrNull(b.playerB) ?? 0);

  const division = divisionId
    ? get<{ id: number; tournament_id: number; start_date: string; end_date: string }>(
        db,
        "SELECT d.id, d.tournament_id, t.start_date, t.end_date FROM divisions d JOIN tournaments t ON t.id = d.tournament_id WHERE d.id = ?",
        divisionId,
      )
    : undefined;
  if (!division) errs.divisionId = "Выберите разряд";
  if (!isDay(day)) errs.day = "Укажите день";
  else if (division && (day < division.start_date || day > division.end_date)) errs.day = "День должен быть в датах турнира";
  if (time && !isTime(time)) errs.time = "Время — в формате ЧЧ:ММ";
  if (judgeId !== null && !get(db, "SELECT 1 FROM users WHERE id = ? AND role = 'judge'", judgeId)) errs.judgeId = "Выберите судью";
  if (newA) Object.assign(errs, prefixed("newA", validatePlayer(newA)));
  else if (!playerA || !get(db, "SELECT 1 FROM players WHERE id = ?", playerA)) errs.playerA = "Выберите двух разных игроков";
  if (newB) Object.assign(errs, prefixed("newB", validatePlayer(newB)));
  else if (!playerB || !get(db, "SELECT 1 FROM players WHERE id = ?", playerB)) errs.playerB = "Выберите двух разных игроков";
  if (!newA && !newB && playerA && playerA === playerB) errs.playerB = "Выберите двух разных игроков";
  check(errs);

  // A repeated create returns the first match before new players are checked or added again.
  if (id === undefined && typeof b.requestId === "string") {
    const repeated = get<{ entity_id: number }>(db, "SELECT entity_id FROM create_requests WHERE request_id = ? AND entity = 'match'", b.requestId);
    if (repeated) return adminMatch(db, repeated.entity_id);
  }

  if (b.confirmDuplicate !== true) {
    for (const [side, p] of [["a", newA], ["b", newB]] as const) {
      const dups = p ? findDuplicates(db, p) : [];
      if (dups.length) {
        const d = dups[0];
        throw new ApiError(409, "duplicate", `Такой игрок уже есть: ${d.name}, ${d.city}, матчей: ${d.matchCount}`, { duplicates: dups, side });
      }
    }
  }

  return tx(db, () => {
    if (newA) playerA = createPlayer(db, newA);
    if (newB) playerB = createPlayer(db, newB);
    const values = [division!.id, round, day, time, court, playerA, playerB, judgeId] as const;
    let matchId: number;
    if (id === undefined) {
      matchId = createOnce(db, b.requestId, "match", () =>
        run(
          db,
          "INSERT INTO matches (division_id, round, day, time, court, player_a, player_b, judge_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ...values,
          new Date().toISOString(),
        ).lastId,
      );
    } else {
      const old = notFoundUnless(getMatch(db, id));
      run(
        db,
        "UPDATE matches SET division_id = ?, round = ?, day = ?, time = ?, court = ?, player_a = ?, player_b = ?, judge_id = ? WHERE id = ?",
        ...values,
        id,
      );
      if (old.division_id !== division!.id) dropStalePlacements(db, old.division_id);
      matchId = id;
    }
    dropStalePlacements(db, division!.id);
    return adminMatch(db, matchId);
  });
}

const prefixed = (prefix: string, errs: Fields): Fields =>
  Object.fromEntries(Object.entries(errs).map(([k, v]) => [`${prefix}.${k}`, v]));

export function deleteMatch(db: Db, id: number): void {
  tx(db, () => {
    const m = notFoundUnless(getMatch(db, id));
    if (pointsCount(db, id) > 0) throw fail.inUse("Матч с очками удалить нельзя");
    run(db, "DELETE FROM matches WHERE id = ?", id);
    dropStalePlacements(db, m.division_id);
  });
}

export function adminMatch(db: Db, id: number): AdminMatch {
  const m = notFoundUnless(
    get<{
      id: number;
      division_id: number;
      tournament_id: number;
      round: string;
      day: string;
      time: string | null;
      court: string;
      player_a: number;
      player_b: number;
      judge_id: number | null;
      state: AdminMatch["state"];
      manual_winner: Side | null;
      manual_sets: string | null;
      manual_note: string;
    }>(
      db,
      "SELECT m.*, d.tournament_id FROM matches m JOIN divisions d ON d.id = m.division_id WHERE m.id = ?",
      id,
    ),
  );
  const player = (pid: number) => {
    const p = playerRow(db, pid);
    return { id: p.id, name: p.name, city: p.city };
  };
  return {
    id: m.id,
    tournamentId: m.tournament_id,
    divisionId: m.division_id,
    round: m.round,
    day: m.day,
    time: m.time,
    court: m.court,
    playerA: m.player_a,
    playerB: m.player_b,
    judgeId: m.judge_id,
    a: player(m.player_a),
    b: player(m.player_b),
    state: m.state,
    pointsCount: pointsCount(db, id),
    manual: m.manual_winner
      ? { winner: m.manual_winner, sets: m.manual_sets ? (JSON.parse(m.manual_sets) as [number, number][]) : [], note: m.manual_note }
      : null,
  };
}

// ---------- manual result ----------

export function setManualResult(db: Db, id: number, body: unknown): AdminMatch {
  const b = obj(body) as Partial<ManualResultInput>;
  const errs: Fields = {};
  const winner = b.winner === "a" || b.winner === "b" ? b.winner : null;
  if (!winner) errs.winner = "Выберите победителя";
  const rawSets = Array.isArray(b.sets) ? b.sets : [];
  const sets: [number, number][] = [];
  for (const pair of rawSets.slice(0, 3)) {
    const [x, y] = Array.isArray(pair) ? pair.map((n) => intOrNull(n)) : [null, null];
    if (x === null && y === null) continue;
    if (x === null || y === null || x < 0 || y < 0 || x > 20 || y > 20) errs.sets = "Счёт сета — два числа от 0 до 20";
    else if (x === y) errs.sets = "Счёт сета не может быть равным";
    else sets.push([x, y]);
  }
  if (rawSets.length > 3) errs.sets = "Не больше трёх сетов";
  if (winner && sets.length && !errs.sets) {
    const won = sets.filter(([x, y]) => (winner === "a" ? x > y : y > x)).length;
    if (won <= sets.length - won) errs.sets = "По этому счёту победил другой игрок";
  }
  const note = str(b.note, 100);
  check(errs);
  return tx(db, () => {
    notFoundUnless(getMatch(db, id));
    run(
      db,
      "UPDATE matches SET manual_winner = ?, manual_sets = ?, manual_note = ?, manual_at = ? WHERE id = ?",
      winner,
      sets.length ? JSON.stringify(sets) : null,
      note,
      new Date().toISOString(),
      id,
    );
    recomputeMatch(db, id);
    return adminMatch(db, id);
  });
}

export function clearManualResult(db: Db, id: number): AdminMatch {
  return tx(db, () => {
    notFoundUnless(getMatch(db, id));
    run(db, "UPDATE matches SET manual_winner = NULL, manual_sets = NULL, manual_note = '', manual_at = NULL WHERE id = ?", id);
    recomputeMatch(db, id);
    return adminMatch(db, id);
  });
}

/** Judges of counted points in order of first point, full names; the assigned judge when none. */
export function protocolJudges(db: Db, matchId: number, assigned: number | null): string[] {
  const points = countedPoints(actionsFor(db, [matchId]).get(matchId) ?? []);
  const ids = [...new Set(points.map((p) => p.judgeId))];
  if (!ids.length && assigned) ids.push(assigned);
  const names = new Map(
    all<{ id: number; first_name: string; last_name: string }>(
      db,
      "SELECT id, first_name, last_name FROM users WHERE id IN (SELECT value FROM json_each(?))",
      JSON.stringify(ids),
    ).map((u) => [u.id, fullName(u)]),
  );
  return ids.map((i) => names.get(i)).filter((n): n is string => !!n);
}
