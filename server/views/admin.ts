import type { AdminMatchRow, AdminTournament, AdminTournamentRow, MatchFormContext, MatchRow } from "../../src/api-types.ts";
import { type Db, all } from "../db.ts";
import { countedPoints, setsText } from "../score.ts";
import { fullName, notFoundUnless } from "../services/common.ts";
import { judgeRows } from "../services/people.ts";
import { playerRows } from "../services/players.ts";
import { fileInfo } from "../services/tournaments.ts";
import { moscowDay } from "../time.ts";
import { actionsFor, buildRow, byTime, loadMatches } from "./matchRows.ts";
import { tournamentStatus } from "./public.ts";

// Organizer lists and forms.

interface TournamentDb {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  city: string;
  venue: string;
  kind: "rtt" | "amateur";
  category: string;
  regulation_file_id: string | null;
  match_count: number;
}

const T_SELECT = `
  SELECT t.*, (SELECT COUNT(*) FROM matches m JOIN divisions d ON d.id = m.division_id WHERE d.tournament_id = t.id) AS match_count
  FROM tournaments t`;

/** Running and upcoming first by start date, then finished, latest first. */
export function adminTournaments(db: Db, today = moscowDay()): AdminTournamentRow[] {
  return all<TournamentDb>(db, T_SELECT)
    .map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.start_date,
      endDate: t.end_date,
      kind: t.kind,
      city: t.city,
      status: tournamentStatus(t, today),
      matchCount: t.match_count,
    }))
    .sort((a, b) => {
      const fa = a.status === "finished";
      const fb = b.status === "finished";
      if (fa !== fb) return fa ? 1 : -1;
      return fa ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate);
    });
}

function scoreText(r: MatchRow): string {
  if (r.manual) {
    const sets = r.sets.length ? `${setsText(r.sets, "a")}, ` : "";
    return `${sets}итог вручную${r.manualNote ? `: ${r.manualNote}` : ""}`;
  }
  if (r.state === "not_started") return "";
  const sets = setsText(r.sets, "a");
  return r.state === "running" ? `${sets} · идёт` : sets;
}

export function adminTournament(db: Db, id: number, today = moscowDay()): AdminTournament {
  const t = notFoundUnless(all<TournamentDb>(db, `${T_SELECT} WHERE t.id = ?`, id)[0]);
  const divisions = all<{ id: number; name: string; group_name: string | null; rows: number; placed: number }>(
    db,
    `SELECT d.id, d.name, g.name AS group_name,
            (SELECT COUNT(*) FROM points_rows r WHERE r.division_id = d.id) AS rows,
            (SELECT COUNT(*) FROM placements p WHERE p.division_id = d.id) AS placed
     FROM divisions d LEFT JOIN rating_groups g ON g.id = d.group_id WHERE d.tournament_id = ? ORDER BY d.id`,
    id,
  );
  const dbRows = loadMatches(db, "t.id = ?", id);
  const actions = actionsFor(db, dbRows.map((m) => m.id));
  const judges = new Map(
    all<{ id: number; first_name: string; last_name: string }>(db, "SELECT id, first_name, last_name FROM users WHERE role = 'judge'").map((u) => [u.id, fullName(u)]),
  );
  const matches: AdminMatchRow[] = dbRows
    .map((m) => {
      const r = buildRow(m, actions.get(m.id) ?? []);
      return {
        id: r.id,
        day: r.day,
        time: r.time,
        court: r.court,
        divisionName: r.divisionName,
        round: r.round,
        a: r.a,
        b: r.b,
        judgeName: m.judge_id ? (judges.get(m.judge_id) ?? null) : null,
        state: r.state,
        manual: r.manual,
        scoreText: scoreText(r),
        pointsCount: countedPoints(actions.get(m.id) ?? []).length,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b));
  return {
    id: t.id,
    name: t.name,
    startDate: t.start_date,
    endDate: t.end_date,
    city: t.city,
    venue: t.venue,
    kind: t.kind,
    category: t.category,
    status: tournamentStatus(t, today),
    regulation: fileInfo(db, t.regulation_file_id),
    matchCount: t.match_count,
    hasPointsTables: divisions.some((d) => d.rows > 0),
    divisions: divisions.map((d) => ({ id: d.id, name: d.name, groupName: d.group_name, rowsCount: d.rows, placementsCount: d.placed })),
    matches,
  };
}

export function matchFormContext(db: Db, tournamentId: number): MatchFormContext {
  const t = notFoundUnless(all<TournamentDb>(db, `${T_SELECT} WHERE t.id = ?`, tournamentId)[0]);
  return {
    tournament: { id: t.id, name: t.name, startDate: t.start_date, endDate: t.end_date },
    divisions: all<{ id: number; name: string }>(db, "SELECT id, name FROM divisions WHERE tournament_id = ? ORDER BY id", tournamentId),
    judges: judgeRows(db).map((j) => ({ id: j.id, name: `${j.lastName} ${j.firstName}` })),
    players: playerRows(db),
  };
}
