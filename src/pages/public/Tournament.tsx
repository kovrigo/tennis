import { useEffect } from "react";
import { useApi } from "../../api.ts";
import type { DivisionResults, MatchRow as Row, TournamentPage } from "../../api-types.ts";
import { LeagueFace, leagueOf } from "../../components/League.tsx";
import { MatchRow } from "../../components/MatchRow.tsx";
import { Empty, PageData } from "../../components/states.tsx";
import { dayLong, weekday } from "../../format.ts";
import { Link, navigate, useLocation } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { PlayerLinks, TournamentHead, fileHref, regulationText } from "./parts.tsx";
import "../../styles/public.css";

const collator = new Intl.Collator("ru", { numeric: true });

export function Tournament({ id }: { id?: string }) {
  return (
    <PageData loaded={useApi<TournamentPage>(`/api/tournaments/${encodeURIComponent(id ?? "")}`)}>
      {(data) => <TournamentView data={data} />}
    </PageData>
  );
}

/** Today during the tournament; before it the first day, after it the last. */
function defaultDay(days: string[], today: string): string {
  if (days.includes(today)) return today;
  return today < days[0] ? days[0] : days[days.length - 1];
}

/** Courts in natural order ("Корт 2" before "Корт 10"), matches by time (none last); no court last. */
function byCourt(matches: Row[]): { court: string; matches: Row[] }[] {
  const map = new Map<string, Row[]>();
  for (const m of matches) map.set(m.court, [...(map.get(m.court) ?? []), m]);
  const courts = [...map.keys()].filter(Boolean).sort(collator.compare);
  if (map.has("")) courts.push("");
  const byTime = (x: Row, y: Row) =>
    x.time === y.time ? x.id - y.id : x.time === null ? 1 : y.time === null ? -1 : x.time < y.time ? -1 : 1;
  return courts.map((court) => ({ court, matches: map.get(court)!.sort(byTime) }));
}

function TournamentView({ data }: { data: TournamentPage }) {
  const t = data.tournament;
  useTitle(t.name);
  const { path, query } = useLocation();
  const asked = query.get("day");
  const hasDays = data.matches.length > 0 && data.days.length > 0;
  const day = hasDays ? (asked && data.days.includes(asked) ? asked : defaultDay(data.days, data.today)) : "";

  // An unknown ?day= is replaced by the default one.
  useEffect(() => {
    if (hasDays && asked && asked !== day) navigate(`${path}?day=${day}${window.location.hash}`, { replace: true });
  }, [hasDays, asked, day, path]);

  // A link "таблица очков" from a player page opens a results block.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView();
  }, []);

  const dayMatches = data.matches.filter((m) => m.day === day);

  return (
    <>
      <div className={`sl-page ${t.kind}`}>
        <div className="wrap">
          <TournamentHead t={t} withYear finishedTag>
            {t.regulation ? (
              <a className="btn btn-w" href={fileHref(t.regulation)} download>
                {regulationText(t.regulation)}
              </a>
            ) : (
              <p className="no-reg">Положение не приложено</p>
            )}
          </TournamentHead>
        </div>
      </div>

      <section className="wrap section">
        <div className="sec-h">
          <h2>Матчи</h2>
        </div>
        {!hasDays ? (
          <Empty>Расписание матчей ещё не опубликовано</Empty>
        ) : (
          <>
            <nav className="days" aria-label="Дни турнира">
              {data.days.map((d) => (
                <Link
                  key={d}
                  to={`${path}?day=${d}`}
                  replace
                  aria-current={d === day ? "true" : undefined}
                  aria-label={`${weekday(d)}, ${dayLong(d)}`}
                >
                  <small>{weekday(d)}</small>
                  <b className="num">{Number(d.slice(8))}</b>
                </Link>
              ))}
            </nav>
            {dayMatches.length === 0 ? (
              <Empty>На этот день матчей нет</Empty>
            ) : (
              byCourt(dayMatches).map((g) => (
                <div key={g.court} className="court">
                  <h3 className="court-h">{g.court || "Корт уточняется"}</h3>
                  {g.matches.map((m) => (
                    <MatchRow key={m.id} m={m} today={data.today} hideTournament liveLink />
                  ))}
                </div>
              ))
            )}
          </>
        )}
      </section>

      {data.results.length > 0 && (
        <section className="wrap section">
          <div className="sec-h">
            <h2>Итоги</h2>
          </div>
          {data.results.map((r) => (
            <Results key={r.id} r={r} t={t} />
          ))}
        </section>
      )}
    </>
  );
}

function Results({ r, t }: { r: DivisionResults; t: TournamentPage["tournament"] }) {
  const league = leagueOf(r.name);
  return (
    <section className="res" id={`division-${r.id}`} aria-labelledby={`division-${r.id}-h`}>
      <div className="res-h">
        {league && (
          <span className="res-av">
            <LeagueFace league={league} />
          </span>
        )}
        <h3 id={`division-${r.id}-h`}>{r.name}</h3>
        {r.groupName && <span className="muted">Рейтинг · {r.groupName}</span>}
      </div>
      {r.hasTable ? (
        <>
          <p className="note">Образец, не положение</p>
          {!r.anyPlacements && <Empty>Места ещё не отмечены</Empty>}
          <div className="table-wrap rk-panel">
            <table className="data res-table rk-table">
              <thead>
                <tr>
                  <th scope="col">Место</th>
                  <th scope="col">Очки</th>
                  <th scope="col">Игроки</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row, i) => (
                  <tr key={row.id} className={`rk-cells${i < 3 ? ` m${i + 1}` : ""}`}>
                    <td>{row.name}</td>
                    <td className="num pts">{row.points}</td>
                    <td>
                      <PlayerLinks players={row.players} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="res-foot">
            Очки — по таблице из положения турнира
            {t.regulation && (
              <>
                {" · "}
                <a className="link" href={fileHref(t.regulation)} download>
                  {regulationText(t.regulation)}
                </a>
              </>
            )}
          </p>
        </>
      ) : (
        <>
          {r.anyPlacements ? (
            <ul className="places rk-panel">
              {r.places.map((p, i) => (
                <li key={p.place} className={`rk-row${i < 3 ? ` m${i + 1}` : ""}`}>
                  <b>{p.place}</b> — <PlayerLinks players={p.players} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Места ещё не отмечены</Empty>
          )}
          <p className="res-foot">Очки за этот разряд сайт не начисляет</p>
        </>
      )}
    </section>
  );
}
