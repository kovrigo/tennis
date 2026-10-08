import type { TournamentCard as Card, TournamentKind } from "../api-types.ts";
import { dateLines } from "../format.ts";
import { Icon } from "../layout/icons.tsx";
import { Link } from "../router.tsx";

export function KindTag({ kind }: { kind: TournamentKind }) {
  return kind === "rtt" ? <span className="tag tag-rtt">РТТ</span> : <span className="tag tag-am">Любительский</span>;
}

/** "Тосно · Теннисная академия" */
export const placeText = (t: { city: string; venue: string }) => [t.city, t.venue].filter(Boolean).join(" · ");

/** Tournament card of the design: the whole card is one link, no buttons inside. */
export function TournamentCard({ t, withYear }: { t: Card; withYear?: boolean }) {
  return (
    <Link className={`tc ${t.kind}`} to={`/tournaments/${t.id}`}>
      <div className="tc-d">
        <span className="d num">
          {dateLines(t.startDate, t.endDate, withYear).map((line) => (
            <span key={line} className={line.length > 5 ? "long" : undefined}>
              {line}
            </span>
          ))}
        </span>
      </div>
      <div className="tc-b">
        <div className="city">
          <Icon id="i-pin" size={16} />
          <span>{placeText(t)}</span>
        </div>
        <h3>{t.name}</h3>
        <div className="tags">
          <KindTag kind={t.kind} />
          {t.status === "running" && <span className="tag tag-live">Идёт</span>}
          {t.category && <span className="cat">{t.category}</span>}
        </div>
        {t.divisions.length > 0 && <div className="divs">{t.divisions.join(", ")}</div>}
      </div>
    </Link>
  );
}
