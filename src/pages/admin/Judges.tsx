import type { AdminJudgeRow } from "../../api-types.ts";
import { AdminList } from "./common.tsx";

export function AdminJudges(_props: { id?: string }) {
  return (
    <AdminList<AdminJudgeRow>
      title="Судьи"
      addLabel="Добавить судью"
      base="/admin/judges"
      api="/api/admin/judges"
      empty="Судей пока нет"
      columns={[
        { head: "Фамилия и имя", cell: (j) => `${j.lastName} ${j.firstName}` },
        { head: "Логин", cell: (j) => j.login },
        { head: "Матчей сегодня", cell: (j) => j.todayMatches, num: true },
      ]}
    />
  );
}
