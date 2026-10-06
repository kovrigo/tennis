import { useApi } from "../../api.ts";
import type { PlayerPage } from "../../api-types.ts";
import { Empty, PageData } from "../../components/states.tsx";
import { dateRange, points } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { fileHref } from "./parts.tsx";
import "../../styles/public.css";

export function Player({ id }: { id?: string }) {
  return (
    <PageData loaded={useApi<PlayerPage>(`/api/players/${encodeURIComponent(id ?? "")}`)}>
      {(data) => <PlayerView data={data} />}
    </PageData>
  );
}

function PlayerView({ data }: { data: PlayerPage }) {
  const p = data.player;
  useTitle(p.name);
  return (
    <>
      <section className="wrap section player-h">
        <h1>{p.name}</h1>
        {p.city && <p className="muted">{p.city}</p>}
      </section>

      <section className="wrap section">
        <div className="sec-h">
          <h2>Очки</h2>
        </div>
        {data.groups.length === 0 ? (
          <Empty>Очков пока нет</Empty>
        ) : (
          <div className="pgroups">
            {data.groups.map((g) => (
              <Link key={g.id} className="pg" to={`/rating?group=${g.id}`}>
                <span className="pg-name">{g.name}</span>
                <span className="pts-big num">{points(g.points)}</span>
                <span className="muted">место: {g.place}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="wrap section">
        <div className="sec-h">
          <h2>Турниры</h2>
        </div>
        {data.results.length === 0 ? (
          <Empty>У игрока пока нет мест в турнирах</Empty>
        ) : (
          <ul className="pres">
            {data.results.map((r) => (
              <li key={`${r.tournamentId}-${r.divisionId}`}>
                <span className="d num">{dateRange(r.startDate, r.endDate, true)}</span>
                <Link className="pres-t" to={`/tournaments/${r.tournamentId}`}>
                  {r.tournamentName}
                </Link>
                <span className="pres-m">
                  {r.divisionName} · {r.place} · {r.points === null ? "очки не начисляются" : `очки: ${r.points}`}
                </span>
                <span className="pres-l">
                  {r.points !== null && (
                    <Link to={`/tournaments/${r.tournamentId}#division-${r.divisionId}`}>таблица очков</Link>
                  )}
                  {r.regulation && (
                    <a href={fileHref(r.regulation)} download>
                      положение
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
