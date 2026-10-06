import type { AdminTournamentRow, TournamentStatus } from "../../api-types.ts";
import { KindTag } from "../../components/TournamentCard.tsx";
import { dateRange } from "../../format.ts";
import { AdminList } from "./common.tsx";

const STATUS: Record<TournamentStatus, string> = { running: "идёт", upcoming: "предстоит", finished: "завершён" };
const RANK: Record<TournamentStatus, number> = { running: 0, upcoming: 1, finished: 2 };

export function AdminTournaments(_props: { id?: string }) {
  return (
    <AdminList<AdminTournamentRow>
      title="Турниры"
      addLabel="Добавить турнир"
      base="/admin/tournaments"
      api="/api/admin/tournaments"
      empty="Турниров пока нет"
      // Running and upcoming first; the server's order inside each group stays.
      order={(rows) => [...rows].sort((a, b) => RANK[a.status] - RANK[b.status])}
      columns={[
        { head: "Даты", cell: (t) => <span className="num">{dateRange(t.startDate, t.endDate, true)}</span> },
        { head: "Название", cell: (t) => t.name },
        { head: "Тип", cell: (t) => <KindTag kind={t.kind} /> },
        { head: "Город", cell: (t) => t.city },
        { head: "Состояние", cell: (t) => STATUS[t.status] },
        { head: "Матчей", cell: (t) => t.matchCount, num: true },
      ]}
    />
  );
}
