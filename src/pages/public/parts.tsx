import { Fragment, type ReactNode } from "react";
import type { FileInfo, NewsCard as Card, PlayerFull, TournamentCard } from "../../api-types.ts";
import { KindTag, placeText } from "../../components/TournamentCard.tsx";
import { dateRange, dayFull, fileKind, fileSize } from "../../format.ts";
import { Link } from "../../router.tsx";

// Pieces shared by the public pages.

export const fileHref = (f: FileInfo) => `/api/files/${f.id}`;

/** "Положение, PDF, 1,2 МБ". */
export const regulationText = (f: FileInfo) => `Положение, ${fileKind(f.type)}, ${fileSize(f.size)}`;

/** Big tournament block: home hero and the tournament page header. Blue for РТТ, red for amateur. */
export function TournamentHead({
  t,
  withYear,
  finishedTag,
  children,
}: {
  t: TournamentCard;
  withYear?: boolean;
  /** Tournament page: "Завершён" tag for a finished tournament. */
  finishedTag?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`sl ${t.kind}`}>
      <div className="kicker">
        <span className="dates num">{dateRange(t.startDate, t.endDate, withYear)}</span>
        <KindTag kind={t.kind} />
        {t.status === "running" && <span className="tag tag-live">Идёт</span>}
        {finishedTag && t.status === "finished" && <span className="tag tag-done">Завершён</span>}
      </div>
      <h1>{t.name}</h1>
      <dl className="facts">
        <div>
          <dt>Место</dt>
          <dd>{placeText(t)}</dd>
        </div>
        {t.category && (
          <div>
            <dt>Категория</dt>
            <dd>{t.category}</dd>
          </div>
        )}
        {t.divisions.length > 0 && (
          <div>
            <dt>Разряды</dt>
            <dd>{t.divisions.join(", ")}</dd>
          </div>
        )}
      </dl>
      <div className="acts">{children}</div>
    </div>
  );
}

/** News card: date, title, two lines of text, "Читать". The whole card is one link. */
export function NewsCardLink({ n, h: H = "h3" }: { n: Card; h?: "h2" | "h3" }) {
  return (
    <Link className="nc" to={`/news/${n.id}`}>
      <span className="dt num">{dayFull(n.date)}</span>
      <H>{n.title}</H>
      {n.excerpt && <p className="ex">{n.excerpt}</p>}
      <span className="rd">Читать</span>
    </Link>
  );
}

/** "Нет связи" banner of the online score; screen readers hear only its appearing and going. */
export function StaleBanner({ stale, at }: { stale: boolean; at: string | null }) {
  return (
    <div role="status" aria-live="polite" aria-relevant="additions removals">
      {stale && at && (
        <p className="note">Нет связи с сайтом. Счёт на {at}. Страница обновится сама, когда связь вернётся</p>
      )}
    </div>
  );
}

/** Player names as links, comma separated; none — a dash. */
export function PlayerLinks({ players }: { players: PlayerFull[] }) {
  if (players.length === 0) return <>—</>;
  return (
    <>
      {players.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && ", "}
          <Link className="plink" to={`/players/${p.id}`}>
            {p.name}
          </Link>
        </Fragment>
      ))}
    </>
  );
}
