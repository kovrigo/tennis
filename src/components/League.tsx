import faceBoys from "../images/face-boys.webp";
import faceGirls from "../images/face-girls.webp";
import faceMen from "../images/face-men.webp";
import faceWomen from "../images/face-women.webp";
import boys from "../images/league-boys.webp";
import girls from "../images/league-girls.webp";
import men from "../images/league-men.webp";
import women from "../images/league-women.webp";

// League pictures from the site author: men, boys, girls, women. Chosen from a rating group
// or division name; a name that fits none gets no picture.

export type League = "men" | "boys" | "girls" | "women";

const ART: Record<League, string> = { men, boys, girls, women };
const FACE: Record<League, string> = { men: faceMen, boys: faceBoys, girls: faceGirls, women: faceWomen };

/** "Женщины до 18 лет", "Женский парный" → women, "Мужской парный" → men, "Юниорки" → girls,
 *  "Юноши до 15 лет" → boys. Sex words win over age; a junior name without sex gets the boy. */
export function leagueOf(name: string): League | null {
  const s = name.toLowerCase();
  if (/женщ|женск/.test(s)) return "women";
  if (/мужч|мужск/.test(s)) return "men";
  if (/девуш|девоч|юниорк/.test(s)) return "girls";
  if (/юнош|мальч|юниор|дет|до\s\d+\sлет/.test(s)) return "boys";
  return null;
}

/** The first league among the names: a tournament's divisions. */
export const firstLeague = (names: string[]): League | null =>
  names.map(leagueOf).find((l) => l !== null) ?? null;

/** Decorative wide picture, player right of centre; the text beside it says the same. */
export function LeagueArt({ league, className = "" }: { league: League; className?: string }) {
  return (
    <img
      className={`league-art ${league} ${className}`.trim()}
      src={ART[league]}
      alt=""
      aria-hidden="true"
      width={1560}
      height={650}
      decoding="async"
    />
  );
}

/** Decorative square crop of the same picture's face. */
export function LeagueFace({ league }: { league: League }) {
  return <img className="league-face" src={FACE[league]} alt="" aria-hidden="true" width={192} height={192} loading="lazy" decoding="async" />;
}
