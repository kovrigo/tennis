import { useApi } from "../../api.ts";
import type { RatingPage } from "../../api-types.ts";
import { LeagueArt, leagueOf } from "../../components/League.tsx";
import { Empty, PageData } from "../../components/states.tsx";
import { initials, points } from "../../format.ts";
import { Link, useLocation } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import "../../styles/public.css";

export function Rating(_props: { id?: string }) {
  useTitle("Рейтинг");
  const group = useLocation().query.get("group");
  const path = group ? `/api/rating?group=${encodeURIComponent(group)}` : "/api/rating";
  return <PageData loaded={useApi<RatingPage>(path)}>{(data) => <RatingView data={data} />}</PageData>;
}

function RatingView({ data }: { data: RatingPage }) {
  const group = data.groups.find((g) => g.id === data.groupId);
  const league = group ? leagueOf(group.name) : null;
  return (
    <section className="wrap section">
      <div className="sec-h">
        <h1>Рейтинг</h1>
      </div>
      <p className="note">Простая сумма очков, не правило федерации</p>
      {data.groups.length === 0 ? (
        <Empty>Рейтинга пока нет</Empty>
      ) : (
        <>
          <nav className="pills" aria-label="Группы рейтинга">
            {data.groups.map((g) => (
              <Link
                key={g.id}
                className="pill"
                to={`/rating?group=${g.id}`}
                aria-current={g.id === data.groupId ? "true" : undefined}
              >
                {g.name}
              </Link>
            ))}
          </nav>
          {group && (
            <div className={`league-band${league ? "" : " plain"}`} aria-hidden="true">
              {league && <LeagueArt league={league} />}
              <span className="lb-name">{group.name}</span>
            </div>
          )}
          {data.rows.length === 0 ? (
            <Empty>В этой группе пока нет очков. Они появятся, когда организатор отметит места в турнире</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data rt">
                <thead>
                  <tr>
                    <th scope="col">Место</th>
                    <th scope="col">Игрок</th>
                    <th scope="col" className="col-t">
                      Турниров
                    </th>
                    <th scope="col">Очки</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.player.id}>
                      <td className={`medal num${r.place <= 3 ? ` m${r.place}` : ""}`}>{r.place}</td>
                      <td>
                        <span className="pl-cell">
                          <span className="av" aria-hidden="true">
                            {initials(r.player.name)}
                          </span>
                          <span className="who">
                            <Link className="nm" to={`/players/${r.player.id}`}>
                              {r.player.name}
                            </Link>
                            <span className="sub">
                              {r.player.city}
                              <span className="t-phone">
                                {r.player.city && " · "}турниров: {r.tournaments}
                              </span>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="num col-t">{r.tournaments}</td>
                      <td>
                        <span className="pts-big num">{points(r.points)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
