import type { RatingRow } from "../../src/api-types.ts";
import { type Db, all } from "../db.ts";
import { collator, fullName } from "../services/common.ts";

// Rating of a group: the plain sum of a player's points over the group's divisions,
// all time. Equal sums share a place, names in alphabetical order, next place skipped: 1, 2, 2, 4.

export function groupRating(db: Db, groupId: number): RatingRow[] {
  const rows = all<{ id: number; first_name: string; last_name: string; city: string; points: number; tournaments: number }>(
    db,
    `SELECT p.id, p.first_name, p.last_name, p.city, SUM(r.points) AS points, COUNT(DISTINCT d.tournament_id) AS tournaments
     FROM placements pl
     JOIN points_rows r ON r.id = pl.points_row_id
     JOIN divisions d ON d.id = pl.division_id
     JOIN players p ON p.id = pl.player_id
     WHERE d.group_id = ? AND r.points > 0
     GROUP BY p.id`,
    groupId,
  )
    .map((r) => ({ player: { id: r.id, name: fullName(r), city: r.city }, points: r.points, tournaments: r.tournaments }))
    .sort((a, b) => b.points - a.points || collator.compare(a.player.name, b.player.name) || a.player.id - b.player.id);
  let place = 0;
  return rows.map((r, i) => {
    if (i === 0 || rows[i - 1].points !== r.points) place = i + 1;
    return { place, ...r };
  });
}
