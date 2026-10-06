import { useEffect, useState } from "react";
import type { MatchRow as Row } from "../../api-types.ts";
import { MatchRow } from "../../components/MatchRow.tsx";
import { Empty, LoadError, Loading } from "../../components/states.tsx";
import { dayLong } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { useLive } from "../../useLive.ts";
import { StaleBanner } from "./parts.tsx";
import "../../styles/public.css";

export function Live(_props: { id?: string }) {
  useTitle("Онлайн-счёт");
  const live = useLive();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 500);
    return () => clearTimeout(t);
  }, []);

  const data = live.data;
  if (!data) return live.failed ? <LoadError onRetry={live.retry} /> : <Loading show={slow} />;
  const none = data.running.length + data.upcoming.length + data.finished.length === 0;

  return (
    <section className="wrap section">
      <div className="sec-h">
        <h1>Онлайн-счёт</h1>
        <span className="live-day">Сегодня, {dayLong(data.today)}</span>
      </div>
      <p className="live-status">
        <span className={live.stale ? "live-dot off" : "live-dot"} aria-hidden="true" />
        Идущих матчей: {data.running.length} · обновлено в {data.updatedAt}
      </p>
      <StaleBanner stale={live.stale} at={data.updatedAt} />
      {none ? (
        <>
          <Empty>Сегодня матчей нет</Empty>
          <p className="after-empty">
            <Link className="btn btn-o" to="/tournaments">
              Календарь турниров
            </Link>
          </p>
        </>
      ) : (
        <>
          <Group title="Идут сейчас" list={data.running} today={data.today} />
          <Group title="Ещё не начались" list={data.upcoming} today={data.today} />
          <Group title="Завершены сегодня" list={data.finished} today={data.today} />
        </>
      )}
    </section>
  );
}

function Group({ title, list, today }: { title: string; list: Row[]; today: string }) {
  if (list.length === 0) return null;
  return (
    <div className="grp">
      <h2 className="sub-h">{title}</h2>
      {list.map((m) => (
        <MatchRow key={m.id} m={m} today={today} />
      ))}
    </div>
  );
}
