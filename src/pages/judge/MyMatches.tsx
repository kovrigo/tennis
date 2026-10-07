import { useApi } from "../../api.ts";
import type { JudgeMatchesPage, MatchRow } from "../../api-types.ts";
import { stateText, whereText } from "../../components/MatchRow.tsx";
import { Empty, PageData } from "../../components/states.tsx";
import { addDays, dayLong } from "../../format.ts";
import { logout } from "../../layout/Layout.tsx";
import { Link } from "../../router.tsx";
import { useSite, useTitle } from "../../site.tsx";
import "../../styles/judge.css";
import { Games } from "./Games.tsx";
import { Relogin } from "./LoginForm.tsx";

// "Мои матчи": the judge's matches grouped as unfinished past days, today, tomorrow,
// later dates. The whole row opens the scoring screen.

interface Group {
  key: string;
  title: string;
  past: boolean;
  rows: MatchRow[];
}

function groups(page: JudgeMatchesPage): Group[] {
  const { today } = page;
  const tomorrow = addDays(today, 1);
  const byKey = new Map<string, Group>();
  // The server sends them by day and time, matches without time last in their day.
  for (const m of page.matches) {
    // A past-day match is listed only while unfinished, or when it was finished today.
    const past = m.day < today && m.state !== "finished";
    const key = past ? "past" : m.day < today ? today : m.day;
    let g = byKey.get(key);
    if (!g) {
      const title = past
        ? "Не завершены"
        : key === today
          ? `Сегодня, ${dayLong(today)}`
          : key === tomorrow
            ? "Завтра"
            : dayLong(key);
      g = { key, title, past, rows: [] };
      byKey.set(key, g);
    }
    g.rows.push(m);
  }
  return [...byKey.values()].sort((x, y) => (x.past ? -1 : y.past ? 1 : x.key.localeCompare(y.key)));
}

function Row({ m, past }: { m: MatchRow; past: boolean }) {
  const running = m.state === "running";
  const finished = m.state === "finished";
  return (
    <li>
      <Link className="j-row" to={`/judge/matches/${m.id}`}>
        <span className="j-row-h">
          <span className="j-row-where">
            {past && `${dayLong(m.day)} · `}
            {whereText(m)}
          </span>
          <span className="j-row-st">
            {running && <span className="live-dot" aria-hidden="true" />}
            {stateText(m)}
          </span>
        </span>
        <span className="j-row-t">{[m.tournamentName, m.divisionName, m.round].filter(Boolean).join(" · ")}</span>
        {(["a", "b"] as const).map((side) => (
          <span key={side} className={finished && m.winner === side ? "j-row-pl win" : "j-row-pl"}>
            <span className="j-row-name">{m[side].name}</span>
            {m.manual && m.sets.length === 0
              ? m.winner === side && <span className="j-row-word">победа</span>
              : m.state !== "not_started" && <Games sets={m.sets} game={m.game} side={side} running={running} />}
          </span>
        ))}
      </Link>
    </li>
  );
}

export function MyMatches(_props: { id?: string }) {
  useTitle("Мои матчи");
  const loaded = useApi<JudgeMatchesPage>("/api/judge/matches");
  const { reload } = useSite();
  if (loaded.error?.status === 401) {
    return (
      <div className="j-screen">
        <div className="wrap j-wrap">
          <Relogin
            onDone={() => {
              reload();
              loaded.reload();
            }}
          />
        </div>
      </div>
    );
  }
  return (
    <PageData loaded={loaded}>
      {(page) => {
        const list = groups(page);
        return (
          <div className="j-screen">
            <div className="wrap j-wrap">
              <h1 className="sr-only">Мои матчи</h1>
              <div className="j-top">
                <p className="j-who">Судья: {page.judgeName}</p>
                <button type="button" className="btn btn-o j-logout" onClick={() => void logout(reload)}>
                  Выйти
                </button>
              </div>
              {list.length === 0 && (
                <Empty>Матчей на сегодня и следующие дни нет. Если вас назначили, а матча нет, сообщите организатору</Empty>
              )}
              {list.map((g) => (
                <section key={g.key} className="j-group" aria-labelledby={`j-group-${g.key}`}>
                  <h2 id={`j-group-${g.key}`}>{g.title}</h2>
                  <ul className="j-list">
                    {g.rows.map((m) => (
                      <Row key={m.id} m={m} past={g.past} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        );
      }}
    </PageData>
  );
}
