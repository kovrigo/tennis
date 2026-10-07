import { useApi } from "../../api.ts";
import type { TournamentCard as Card, TournamentsPage } from "../../api-types.ts";
import { Empty, PageData } from "../../components/states.tsx";
import { TournamentCard } from "../../components/TournamentCard.tsx";
import { useTitle } from "../../site.tsx";
import "../../styles/public.css";

export function Tournaments(_props: { id?: string }) {
  useTitle("Турниры");
  return (
    <PageData loaded={useApi<TournamentsPage>("/api/tournaments")}>
      {(data) => (
        <section className="wrap section">
          <div className="sec-h">
            <h1>Турниры</h1>
          </div>
          {data.running.length > 0 && <Group title="Идут сейчас" list={data.running} />}
          <Group title="Предстоящие" list={data.upcoming} empty="Предстоящих турниров пока нет" />
          <Group title="Завершённые" list={data.finished} empty="Завершённых турниров пока нет" />
        </section>
      )}
    </PageData>
  );
}

function Group({ title, list, empty }: { title: string; list: Card[]; empty?: string }) {
  return (
    <div className="grp">
      <h2 className="sub-h">{title}</h2>
      {list.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="cards">
          {list.map((t) => (
            <TournamentCard key={t.id} t={t} withYear />
          ))}
        </div>
      )}
    </div>
  );
}
