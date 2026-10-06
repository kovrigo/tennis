import type { AdminPlayerRow } from "../../api-types.ts";
import { AdminList, byName } from "./common.tsx";

export function AdminPlayers(_props: { id?: string }) {
  return (
    <AdminList<AdminPlayerRow>
      title="Игроки"
      addLabel="Добавить игрока"
      base="/admin/players"
      api="/api/admin/players"
      empty="Игроков пока нет"
      order={(rows) => [...rows].sort((a, b) => byName(a.name, b.name))}
      columns={[
        { head: "Фамилия и имя", cell: (p) => p.name },
        { head: "Город", cell: (p) => p.city },
        { head: "Матчей", cell: (p) => p.matchCount, num: true },
      ]}
    />
  );
}
