import type {
  DivisionResults,
  HomePage,
  LivePage,
  NewsCard,
  PlayerFull,
  PlayerPage,
  Protocol,
  RatingPage,
  TournamentCard,
  TournamentPage,
  TournamentStatus,
  TournamentsPage,
} from "../../src/api-types.ts";
import { type Db, all, get } from "../db.ts";
import { countedPoints, progressionRows, replay, setsText } from "../score.ts";
import { collator, fullName, notFoundUnless } from "../services/common.ts";
import { protocolJudges } from "../services/matches.ts";
import { groupRows } from "../services/divisions.ts";
import { fileInfo } from "../services/tournaments.ts";
import { daysBetween, durationText, moscowDay, moscowDayStart, moscowTime } from "../time.ts";
import { actionsFor, byCourt, byTime, loadMatches, manualSets, matchRows } from "./matchRows.ts";
import { groupRating } from "./rating.ts";

// Data for the public pages: one request per page.

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
}

/** Calendar group by Moscow date, the last day included. */
export function tournamentStatus(t: { start_date: string; end_date: string }, today: string): TournamentStatus {
  if (t.start_date > today) return "upcoming";
  if (t.end_date < today) return "finished";
  return "running";
}

function cards(db: Db, today: string, where = "1", ...params: (string | number)[]): TournamentCard[] {
  const ts = all<TournamentDb>(db, `SELECT * FROM tournaments WHERE ${where}`, ...params);
  const divisions = all<{ tournament_id: number; name: string }>(db, "SELECT tournament_id, name FROM divisions ORDER BY id");
  return ts.map((t) => ({
    id: t.id,
    name: t.name,
    startDate: t.start_date,
    endDate: t.end_date,
    city: t.city,
    venue: t.venue,
    kind: t.kind,
    category: t.category,
    divisions: divisions.filter((d) => d.tournament_id === t.id).map((d) => d.name),
    status: tournamentStatus(t, today),
    regulation: fileInfo(db, t.regulation_file_id),
  }));
}

const byStart = (a: TournamentCard, b: TournamentCard) => a.startDate.localeCompare(b.startDate) || a.id - b.id;

export function tournamentsPage(db: Db, today = moscowDay()): TournamentsPage {
  const all = cards(db, today);
  return {
    running: all.filter((t) => t.status === "running").sort(byStart),
    upcoming: all.filter((t) => t.status === "upcoming").sort(byStart),
    finished: all.filter((t) => t.status === "finished").sort((a, b) => b.endDate.localeCompare(a.endDate) || b.id - a.id),
  };
}

function newsCards(db: Db, limit = -1): NewsCard[] {
  return all<{ id: number; title: string; date: string; body: string }>(
    db,
    "SELECT id, title, date, body FROM news ORDER BY date DESC, id DESC LIMIT ?",
    limit,
  ).map((n) => ({ id: n.id, title: n.title, date: n.date, excerpt: n.body.replace(/\s+/g, " ").slice(0, 240) }));
}

export function homePage(db: Db, today = moscowDay()): HomePage {
  const t = tournamentsPage(db, today);
  const soon = [...t.running, ...t.upcoming];
  return {
    hero: soon[0] ?? null,
    upcoming: soon.slice(0, 3),
    rating: groupRows(db).map((g) => ({ id: g.id, name: g.name, rows: groupRating(db, g.id).slice(0, 5) })),
    news: newsCards(db, 3),
  };
}

export const newsPage = (db: Db) => newsCards(db);

export function tournamentPage(db: Db, id: number, today = moscowDay()): TournamentPage {
  const tournament = notFoundUnless(cards(db, today, "id = ?", id)[0]);
  const matches = matchRows(db, "t.id = ?", id).sort((a, b) => a.day.localeCompare(b.day) || byCourt(a, b));
  const results: DivisionResults[] = all<{ id: number; name: string; group_name: string | null }>(
    db,
    "SELECT d.id, d.name, g.name AS group_name FROM divisions d LEFT JOIN rating_groups g ON g.id = d.group_id WHERE d.tournament_id = ? ORDER BY d.id",
    id,
  ).map((d) => {
    const rows = all<{ id: number; name: string; points: number }>(db, "SELECT id, name, points FROM points_rows WHERE division_id = ? ORDER BY position, id", d.id);
    const placed = all<{ player_id: number; points_row_id: number | null; place_text: string | null; first_name: string; last_name: string; city: string }>(
      db,
      "SELECT pl.player_id, pl.points_row_id, pl.place_text, p.first_name, p.last_name, p.city FROM placements pl JOIN players p ON p.id = pl.player_id WHERE pl.division_id = ?",
      d.id,
    );
    const player = (p: (typeof placed)[number]): PlayerFull => ({ id: p.player_id, name: fullName(p), city: p.city });
    const byName = (a: PlayerFull, b: PlayerFull) => collator.compare(a.name, b.name);
    const texts = [...new Set(placed.filter((p) => p.place_text).map((p) => p.place_text!))].sort(collator.compare);
    return {
      id: d.id,
      name: d.name,
      groupName: d.group_name,
      hasTable: rows.length > 0,
      rows: rows.map((r) => ({ ...r, players: placed.filter((p) => p.points_row_id === r.id).map(player).sort(byName) })),
      places: rows.length ? [] : texts.map((place) => ({ place, players: placed.filter((p) => p.place_text === place).map(player).sort(byName) })),
      anyPlacements: placed.length > 0,
    };
  });
  return { tournament, today, days: daysBetween(tournament.startDate, tournament.endDate), matches, results };
}

export function livePage(db: Db, now = new Date()): LivePage {
  const today = moscowDay(now);
  const rows = matchRows(
    db,
    "m.state = 'running' OR m.day = ? OR (m.state = 'finished' AND m.manual_winner IS NULL AND m.finished_at >= ?)",
    today,
    moscowDayStart(today),
  );
  // Latest first: by the judge's last point, or by when the manual result was entered.
  const ends = new Map(
    all<{ id: number; end: string | null }>(
      db,
      "SELECT id, COALESCE(finished_at, manual_at) AS end FROM matches WHERE id IN (SELECT value FROM json_each(?))",
      JSON.stringify(rows.map((r) => r.id)),
    ).map((r) => [r.id, r.end ?? ""]),
  );
  const ended = (r: (typeof rows)[number]) => ends.get(r.id) ?? "";
  return {
    today,
    updatedAt: moscowTime(now),
    running: rows.filter((r) => r.state === "running").sort(byCourt),
    upcoming: rows.filter((r) => r.state === "not_started" && r.day === today).sort(byTime),
    finished: rows.filter((r) => r.state === "finished").sort((a, b) => ended(b).localeCompare(ended(a))),
  };
}

export function ratingPage(db: Db, groupParam: string | null): RatingPage {
  const groups = groupRows(db);
  const wanted = groupParam && /^\d+$/.test(groupParam) ? Number(groupParam) : null;
  const group = groups.find((g) => g.id === wanted) ?? groups[0] ?? null;
  return { groups, groupId: group?.id ?? null, rows: group ? groupRating(db, group.id) : [] };
}

export function playerPage(db: Db, id: number): PlayerPage {
  const p = notFoundUnless(get<{ id: number; first_name: string; last_name: string; city: string }>(db, "SELECT id, first_name, last_name, city FROM players WHERE id = ?", id));
  const groups = groupRows(db)
    .map((g) => {
      const row = groupRating(db, g.id).find((r) => r.player.id === id);
      return row ? { id: g.id, name: g.name, points: row.points, place: row.place } : null;
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);
  const results = all<{
    tournament_id: number;
    tournament_name: string;
    start_date: string;
    end_date: string;
    regulation_file_id: string | null;
    division_id: number;
    division_name: string;
    row_name: string | null;
    points: number | null;
    place_text: string | null;
  }>(
    db,
    `SELECT t.id AS tournament_id, t.name AS tournament_name, t.start_date, t.end_date, t.regulation_file_id,
            d.id AS division_id, d.name AS division_name, r.name AS row_name, r.points, pl.place_text
     FROM placements pl
     JOIN divisions d ON d.id = pl.division_id
     JOIN tournaments t ON t.id = d.tournament_id
     LEFT JOIN points_rows r ON r.id = pl.points_row_id
     WHERE pl.player_id = ?
     ORDER BY t.start_date DESC, t.id DESC, d.id`,
    id,
  ).map((r) => ({
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name,
    startDate: r.start_date,
    endDate: r.end_date,
    divisionId: r.division_id,
    divisionName: r.division_name,
    place: r.row_name ?? r.place_text ?? "",
    points: r.row_name !== null ? r.points : null,
    regulation: fileInfo(db, r.regulation_file_id),
  }));
  return { player: { id: p.id, name: fullName(p), city: p.city }, groups, results };
}

export function protocol(db: Db, id: number): Protocol {
  const m = notFoundUnless(loadMatches(db, "m.id = ?", id)[0]);
  const points = countedPoints(actionsFor(db, [id]).get(id) ?? []);
  const score = replay(points.map((p) => p.side));
  const manual = m.manual_winner !== null;
  const first = points[0]?.at ?? null;
  const last = points.at(-1)?.at ?? null;
  const finished = manual || score.finished;
  const winner = manual ? m.manual_winner : score.winner;
  const sets = manual ? manualSets(m.manual_sets) : score.sets;
  return {
    id: m.id,
    tournamentId: m.tournament_id,
    tournamentName: m.tournament_name,
    divisionName: m.division_name,
    round: m.round,
    court: m.court,
    day: m.day,
    time: m.time,
    judges: manual ? [] : protocolJudges(db, id, m.judge_id),
    a: { id: m.player_a, name: fullName({ first_name: m.a_first, last_name: m.a_last }), city: m.a_city },
    b: { id: m.player_b, name: fullName({ first_name: m.b_first, last_name: m.b_last }), city: m.b_city },
    state: manual ? "finished" : !points.length ? "not_started" : score.finished ? "finished" : "running",
    manual,
    manualNote: manual ? m.manual_note : "",
    winner,
    startedTime: manual || !first ? null : moscowTime(first),
    finishedTime: !manual && score.finished && last ? moscowTime(last) : null,
    durationText: !manual && score.finished && first && last ? durationText(first, last) : null,
    setsText: sets.length ? setsText(sets, finished && winner ? winner : "a") : "",
    progression: manual ? [] : progressionRows(score),
  };
}
