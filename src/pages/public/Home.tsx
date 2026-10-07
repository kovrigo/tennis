import { useState } from "react";
import { useApi } from "../../api.ts";
import type { HomePage } from "../../api-types.ts";
import { MatchRow } from "../../components/MatchRow.tsx";
import { Empty, PageData } from "../../components/states.tsx";
import { TournamentCard } from "../../components/TournamentCard.tsx";
import { initials, points } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { useLive } from "../../useLive.ts";
import { NewsCardLink, StaleBanner, TournamentHead, fileHref } from "./parts.tsx";
import "../../styles/public.css";

export function Home(_props: { id?: string }) {
  useTitle("Главная");
  return <PageData loaded={useApi<HomePage>("/api/home")}>{(data) => <HomeView data={data} />}</PageData>;
}

function HomeView({ data }: { data: HomePage }) {
  const t = data.hero;
  return (
    <>
      <div className="hero">
        {t ? (
          <TournamentHead t={t}>
            <Link className="btn btn-w" to={`/tournaments/${t.id}`}>
              Страница турнира
            </Link>
            {t.regulation && (
              <a className="btn btn-gh" href={fileHref(t.regulation)} download>
                Положение
              </a>
            )}
          </TournamentHead>
        ) : (
          <div className="sl none">
            <p className="sl-empty">Ближайших турниров пока нет</p>
            <div className="acts">
              <Link className="btn btn-w" to="/tournaments">
                Календарь турниров
              </Link>
            </div>
          </div>
        )}
        <HomeRating groups={data.rating} />
      </div>

      <LiveNow />

      {data.upcoming.length > 0 && (
        <section className="wrap section">
          <div className="sec-h">
            <h2>Ближайшие турниры</h2>
            <Link className="more" to="/tournaments">
              Календарь турниров
            </Link>
          </div>
          <div className="cards">
            {data.upcoming.map((c) => (
              <TournamentCard key={c.id} t={c} />
            ))}
          </div>
        </section>
      )}

      {data.news.length > 0 && (
        <section className="wrap section">
          <div className="sec-h">
            <h2>Новости</h2>
            <Link className="more" to="/news">
              Все новости
            </Link>
          </div>
          <div className="ncards">
            {data.news.map((n) => (
              <NewsCardLink key={n.id} n={n} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function HomeRating({ groups }: { groups: HomePage["rating"] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const group = groups.find((g) => g.id === picked) ?? groups[0];
  return (
    <aside className="aside" aria-labelledby="home-rating">
      <h2 id="home-rating">Рейтинг</h2>
      {groups.length > 1 && (
        <div className="pills">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="pill"
              aria-pressed={g.id === group?.id}
              onClick={() => setPicked(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
      {groups.length === 1 && <p className="grp-one">{groups[0].name}</p>}
      {!group || group.rows.length === 0 ? (
        <Empty>Рейтинга пока нет</Empty>
      ) : (
        <>
          <ol className="rk-list">
            {group.rows.slice(0, 5).map((r) => (
              <li key={r.player.id} className="rk">
                <span className={`pos medal num${r.place <= 3 ? ` m${r.place}` : ""}`}>{r.place}</span>
                <span className="av" aria-hidden="true">
                  {initials(r.player.name)}
                </span>
                <span className="who">
                  <Link className="nm" to={`/players/${r.player.id}`}>
                    {r.player.name}
                  </Link>
                  <span className="small muted">{r.player.city}</span>
                </span>
                <span className="pts num">{points(r.points)}</span>
              </li>
            ))}
          </ol>
          <p className="small muted rk-note">Простая сумма очков, не правило федерации</p>
        </>
      )}
      {group && (
        <Link className="btn btn-o rk-all" to={`/rating?group=${group.id}`}>
          Весь рейтинг
        </Link>
      )}
    </aside>
  );
}

/** "Сейчас на кортах": up to four running matches from the online score polling. */
function LiveNow() {
  const live = useLive();
  const data = live.data;
  const running = data?.running.slice(0, 4) ?? [];
  return (
    <section className="wrap section">
      <div className="sec-h hot">
        <h2>Сейчас на кортах</h2>
        <Link className="more" to="/live">
          Все матчи
        </Link>
      </div>
      <StaleBanner stale={live.stale} at={data?.updatedAt ?? null} />
      {live.failed && (
        <div className="empty" role="alert">
          <p>Не удалось загрузить страницу. Проверьте связь</p>
          <button type="button" className="btn btn-p" onClick={live.retry}>
            Обновить
          </button>
        </div>
      )}
      {data &&
        (running.length === 0 ? (
          <Empty>
            Сейчас матчей нет. Расписание на сегодня —{" "}
            <Link className="link" to="/live">
              в онлайн-счёте
            </Link>
          </Empty>
        ) : (
          running.map((m) => <MatchRow key={m.id} m={m} today={data.today} />)
        ))}
    </section>
  );
}
