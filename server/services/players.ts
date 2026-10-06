import type { AdminPlayerRow, NewPlayer } from "../../src/api-types.ts";
import { type Db, all, get, run, tx } from "../db.ts";
import { ApiError, fail } from "../http.ts";
import { type Fields, check, collator, createOnce, createdBefore, fullName, normalize, notFoundUnless, obj, str } from "./common.ts";

// Players: one shared list for every tournament. Namesakes are allowed after a warning.

interface PlayerDb {
  id: number;
  first_name: string;
  last_name: string;
  city: string;
  match_count: number;
}

const SELECT = `
  SELECT p.id, p.first_name, p.last_name, p.city,
         (SELECT COUNT(*) FROM matches m WHERE m.player_a = p.id OR m.player_b = p.id) AS match_count
  FROM players p`;

const toRow = (p: PlayerDb): AdminPlayerRow => ({
  id: p.id,
  firstName: p.first_name,
  lastName: p.last_name,
  city: p.city,
  name: fullName(p),
  matchCount: p.match_count,
});

export function playerRow(db: Db, id: number): AdminPlayerRow {
  return toRow(notFoundUnless(get<PlayerDb>(db, `${SELECT} WHERE p.id = ?`, id)));
}

/** All players by last name, then first name. */
export function playerRows(db: Db): AdminPlayerRow[] {
  return all<PlayerDb>(db, SELECT)
    .map(toRow)
    .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.city, b.city));
}

export function validatePlayer(p: NewPlayer): Fields {
  const errs: Fields = {};
  if (!p.firstName) errs.firstName = "Укажите имя";
  if (!p.lastName) errs.lastName = "Укажите фамилию";
  if (!p.city) errs.city = "Укажите город";
  return errs;
}

/** Players with the same first name, last name and city: case-insensitive, "ё" equals "е". */
export function findDuplicates(db: Db, p: NewPlayer, exceptId?: number): AdminPlayerRow[] {
  const key = [p.firstName, p.lastName, p.city].map(normalize).join("|");
  return all<PlayerDb>(db, SELECT)
    .filter((r) => r.id !== exceptId && [r.first_name, r.last_name, r.city].map(normalize).join("|") === key)
    .map(toRow);
}

export function createPlayer(db: Db, p: NewPlayer): number {
  return run(
    db,
    "INSERT INTO players (first_name, last_name, city, created_at) VALUES (?, ?, ?, ?)",
    p.firstName,
    p.lastName,
    p.city,
    new Date().toISOString(),
  ).lastId;
}

export function savePlayer(db: Db, body: unknown, id?: number): AdminPlayerRow {
  const b = obj(body);
  const p: NewPlayer = { firstName: str(b.firstName, 100), lastName: str(b.lastName, 100), city: str(b.city, 100) };
  check(validatePlayer(p));
  return tx(db, () => {
    if (id !== undefined) notFoundUnless(get(db, "SELECT 1 FROM players WHERE id = ?", id));
    // A repeated create returns the first record before the namesake check finds it.
    const repeated = id === undefined ? createdBefore(db, b.requestId, "player") : undefined;
    if (repeated) return playerRow(db, repeated);
    if (b.confirmDuplicate !== true) {
      const dups = findDuplicates(db, p, id);
      if (dups.length) {
        const d = dups[0];
        throw new ApiError(409, "duplicate", `Такой игрок уже есть: ${d.name}, ${d.city}, матчей: ${d.matchCount}`, { duplicates: dups });
      }
    }
    if (id === undefined) return playerRow(db, createOnce(db, b.requestId, "player", () => createPlayer(db, p)));
    run(db, "UPDATE players SET first_name = ?, last_name = ?, city = ? WHERE id = ?", p.firstName, p.lastName, p.city, id);
    return playerRow(db, id);
  });
}

export function deletePlayer(db: Db, id: number): void {
  tx(db, () => {
    const p = playerRow(db, id);
    if (p.matchCount > 0) throw fail.inUse("Игрока с матчами удалить нельзя");
    run(db, "DELETE FROM placements WHERE player_id = ?", id);
    run(db, "DELETE FROM players WHERE id = ?", id);
  });
}
