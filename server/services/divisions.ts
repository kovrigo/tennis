import type { AdminDivision, GroupRow, PlacementsForm } from "../../src/api-types.ts";
import { type Db, all, get, run, tx } from "../db.ts";
import { fail } from "../http.ts";
import { type Fields, check, collator, createOnce, fullName, intOrNull, notFoundUnless, obj, required, str } from "./common.ts";

// Divisions with their points table, placements, rating groups.

interface RowInput {
  id: number | null;
  name: string;
  points: number;
}

export function saveDivision(db: Db, body: unknown, id?: number): AdminDivision {
  const b = obj(body);
  const errs: Fields = {};
  const name = required(errs, "name", b.name, "Укажите название");
  const noGroup = b.groupId === null || b.groupId === undefined || b.groupId === "";
  const groupId = noGroup ? null : intOrNull(b.groupId);
  if (!noGroup && groupId === null) errs.groupId = "Выберите рейтинговую группу";
  // The whole table comes with every save: a body without it must not wipe the table.
  if (!Array.isArray(b.rows)) throw fail.badRequest("Нет таблицы очков в запросе");
  const rawRows: unknown[] = b.rows;
  if (rawRows.length > 50) errs.rows = "Не больше 50 строк в таблице очков";
  const rows: RowInput[] = rawRows.slice(0, 50).map((r, i) => {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const rowName = str(o.name, 100);
    const points = intOrNull(o.points);
    if (!rowName) errs[`rows.${i}.name`] = "Укажите место";
    if (points === null || points < 0 || points > 100000) errs[`rows.${i}.points`] = "Укажите очки числом";
    return { id: intOrNull(o.id), name: rowName, points: points ?? 0 };
  });

  return tx(db, () => {
    const tournamentId = id === undefined ? intOrNull(b.tournamentId) : get<{ tournament_id: number }>(db, "SELECT tournament_id FROM divisions WHERE id = ?", id)?.tournament_id;
    if (id !== undefined && !tournamentId) throw fail.notFound();
    const t = tournamentId ? get<{ regulation_file_id: string | null }>(db, "SELECT regulation_file_id FROM tournaments WHERE id = ?", tournamentId) : undefined;
    if (!t) throw fail.notFound();
    if (groupId !== null && !get(db, "SELECT 1 FROM rating_groups WHERE id = ?", groupId)) errs.groupId = "Выберите рейтинговую группу";
    if (rows.length && groupId === null) errs.groupId = "Выберите рейтинговую группу";
    if (rows.length && !t.regulation_file_id) errs.rows = "Таблицу очков можно внести после того, как к турниру приложено положение";
    check(errs);

    let divisionId: number;
    let hadTable = false;
    if (id === undefined) {
      divisionId = createOnce(db, b.requestId, "division", () =>
        run(db, "INSERT INTO divisions (tournament_id, name, group_id, created_at) VALUES (?, ?, ?, ?)", tournamentId, name, groupId, new Date().toISOString()).lastId,
      );
      hadTable = !!get(db, "SELECT 1 FROM points_rows WHERE division_id = ?", divisionId);
      if (hadTable) return adminDivision(db, divisionId); // repeated create
    } else {
      divisionId = id;
      hadTable = !!get(db, "SELECT 1 FROM points_rows WHERE division_id = ?", id);
      run(db, "UPDATE divisions SET name = ?, group_id = ? WHERE id = ?", name, groupId, id);
    }

    // Rows with an id are updated, without one created, missing ones removed.
    const existing = new Set(all<{ id: number }>(db, "SELECT id FROM points_rows WHERE division_id = ?", divisionId).map((r) => r.id));
    for (const [i, r] of rows.entries()) {
      if (r.id !== null && !existing.has(r.id)) throw fail.validation({ [`rows.${i}.name`]: "Строка таблицы не найдена. Обновите страницу" });
    }
    const kept = new Set(rows.map((r) => r.id).filter((x): x is number => x !== null));
    for (const rowId of existing) {
      if (kept.has(rowId)) continue;
      const placed = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM placements WHERE points_row_id = ?", rowId)!.n;
      if (placed) throw fail.inUse(`Это место отмечено у игроков: ${placed}. Сначала снимите его в «Местах»`, { placed });
      run(db, "DELETE FROM points_rows WHERE id = ?", rowId);
    }
    rows.forEach((r, position) => {
      if (r.id !== null) run(db, "UPDATE points_rows SET name = ?, points = ?, position = ? WHERE id = ?", r.name, r.points, position, r.id);
      else run(db, "INSERT INTO points_rows (division_id, name, points, position) VALUES (?, ?, ?, ?)", divisionId, r.name, r.points, position);
    });
    // A table appeared: places typed as text give way to places from its rows.
    if (!hadTable && rows.length) run(db, "DELETE FROM placements WHERE division_id = ? AND place_text IS NOT NULL", divisionId);
    return adminDivision(db, divisionId);
  });
}

export function adminDivision(db: Db, id: number): AdminDivision {
  const d = notFoundUnless(
    get<{ id: number; tournament_id: number; tournament_name: string; regulation_file_id: string | null; name: string; group_id: number | null }>(
      db,
      "SELECT d.id, d.tournament_id, t.name AS tournament_name, t.regulation_file_id, d.name, d.group_id FROM divisions d JOIN tournaments t ON t.id = d.tournament_id WHERE d.id = ?",
      id,
    ),
  );
  return {
    id: d.id,
    tournamentId: d.tournament_id,
    tournamentName: d.tournament_name,
    hasRegulation: !!d.regulation_file_id,
    name: d.name,
    groupId: d.group_id,
    rows: all<{ id: number; name: string; points: number; placed: number }>(
      db,
      "SELECT r.id, r.name, r.points, (SELECT COUNT(*) FROM placements p WHERE p.points_row_id = r.id) AS placed FROM points_rows r WHERE r.division_id = ? ORDER BY r.position, r.id",
      id,
    ).map((r) => ({ id: r.id, name: r.name, points: r.points, placedCount: r.placed })),
  };
}

// ---------- placements ----------

export function placementsForm(db: Db, divisionId: number): PlacementsForm {
  const d = adminDivision(db, divisionId);
  const placed = new Map(
    all<{ player_id: number; points_row_id: number | null; place_text: string | null }>(
      db,
      "SELECT player_id, points_row_id, place_text FROM placements WHERE division_id = ?",
      divisionId,
    ).map((p) => [p.player_id, p]),
  );
  const players = all<{ id: number; first_name: string; last_name: string; city: string }>(
    db,
    `SELECT id, first_name, last_name, city FROM players WHERE id IN
       (SELECT player_a FROM matches WHERE division_id = ? UNION SELECT player_b FROM matches WHERE division_id = ?)`,
    divisionId,
    divisionId,
  )
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      city: p.city,
      pointsRowId: placed.get(p.id)?.points_row_id ?? null,
      placeText: placed.get(p.id)?.place_text ?? "",
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return {
    divisionId,
    divisionName: d.name,
    tournamentId: d.tournamentId,
    tournamentName: d.tournamentName,
    hasTable: d.rows.length > 0,
    rows: d.rows.map((r) => ({ id: r.id, name: r.name, points: r.points })),
    players,
  };
}

/** Replaces all places of the division. One place may go to several players. */
export function savePlacements(db: Db, divisionId: number, body: unknown): PlacementsForm {
  if (!Array.isArray(body)) throw fail.badRequest();
  return tx(db, () => {
    const form = placementsForm(db, divisionId);
    const inDivision = new Set(form.players.map((p) => p.id));
    const rowIds = new Set(form.rows.map((r) => r.id));
    const errs: Fields = {};
    const chosen: { playerId: number; rowId: number | null; text: string | null }[] = [];
    for (const item of body) {
      const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const playerId = intOrNull(o.playerId);
      if (playerId === null || !inDivision.has(playerId)) {
        errs[`player.${playerId}`] = "Игрок не играет в этом разряде";
        continue;
      }
      if (form.hasTable) {
        const rowId = intOrNull(o.pointsRowId);
        if (rowId === null) continue;
        if (!rowIds.has(rowId)) errs[`player.${playerId}`] = "Выберите место из таблицы очков";
        else chosen.push({ playerId, rowId, text: null });
      } else {
        const t = str(o.placeText, 100);
        if (t) chosen.push({ playerId, rowId: null, text: t });
      }
    }
    check(errs);
    run(db, "DELETE FROM placements WHERE division_id = ?", divisionId);
    for (const c of chosen) {
      run(db, "INSERT OR REPLACE INTO placements (division_id, player_id, points_row_id, place_text) VALUES (?, ?, ?, ?)", divisionId, c.playerId, c.rowId, c.text);
    }
    return placementsForm(db, divisionId);
  });
}

// ---------- rating groups ----------

export const groupRows = (db: Db): GroupRow[] => all<GroupRow>(db, "SELECT id, name FROM rating_groups ORDER BY position, id");

export function groupRow(db: Db, id: number): GroupRow {
  return notFoundUnless(get<GroupRow>(db, "SELECT id, name FROM rating_groups WHERE id = ?", id));
}

export function saveGroup(db: Db, body: unknown, id?: number): GroupRow {
  const b = obj(body);
  const errs: Fields = {};
  const name = required(errs, "name", b.name, "Укажите название", 100);
  check(errs);
  return tx(db, () => {
    if (id === undefined) {
      const newId = createOnce(db, b.requestId, "group", () => {
        const pos = get<{ p: number }>(db, "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM rating_groups")!.p;
        return run(db, "INSERT INTO rating_groups (name, position) VALUES (?, ?)", name, pos).lastId;
      });
      return groupRow(db, newId);
    }
    groupRow(db, id);
    run(db, "UPDATE rating_groups SET name = ? WHERE id = ?", name, id);
    return groupRow(db, id);
  });
}
