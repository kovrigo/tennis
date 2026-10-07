import men from "../images/league-men.webp";
import women from "../images/league-women.webp";
import youth from "../images/league-youth.webp";

// League illustrations: men, juniors, women. Chosen from a rating group or division name;
// a name that fits none gets no picture.

export type League = "men" | "youth" | "women";

const ART: Record<League, string> = { men, youth, women };

/** "Юноши до 15 лет" → youth, "Женщины, одиночный" → women, "Мужчины" → men. Age words win over sex. */
export function leagueOf(name: string): League | null {
  const s = name.toLowerCase();
  if (/юнош|девуш|юниор|дет|до \d+ лет/.test(s)) return "youth";
  if (/женщ/.test(s)) return "women";
  if (/мужч/.test(s)) return "men";
  return null;
}

/** The first league among the names: a tournament's divisions. */
export const firstLeague = (names: string[]): League | null =>
  names.map(leagueOf).find((l) => l !== null) ?? null;

/** Decorative picture; the text beside it says the same. */
export function LeagueArt({ league, className = "" }: { league: League; className?: string }) {
  return (
    <img
      className={`league-art ${league} ${className}`.trim()}
      src={ART[league]}
      alt=""
      aria-hidden="true"
      width={1376}
      height={768}
      decoding="async"
    />
  );
}
