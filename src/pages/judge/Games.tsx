import type { SetScore, Side } from "../../api-types.ts";
import { GameCall } from "../../components/MatchRow.tsx";

// Games per set for one player, as in the match row: the current set red, a won set
// dark, a lost one grey, the tiebreak loser's points small; the current game on lime.

export function Games({
  sets,
  game,
  side,
  running,
}: {
  sets: SetScore[];
  game: { a: string; b: string } | null;
  side: Side;
  running: boolean;
}) {
  const other: Side = side === "a" ? "b" : "a";
  return (
    <span className="j-games num">
      {sets.map((s, i) => {
        const current = running && i === sets.length - 1;
        const tbLoser = s.tb && s[side] < s[other] ? s.tb[side] : null;
        return (
          <span key={i} className={current ? "cur" : s[side] > s[other] ? "w" : undefined}>
            {s[side]}
            {tbLoser !== null && <sup>{tbLoser}</sup>}
          </span>
        );
      })}
      {running && game && (
        <span className="game">
          <GameCall value={game[side]} />
        </span>
      )}
    </span>
  );
}
