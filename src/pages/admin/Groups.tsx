import type { GroupRow } from "../../api-types.ts";
import { AdminList } from "./common.tsx";

export function AdminGroups(_props: { id?: string }) {
  return (
    <AdminList<GroupRow>
      title="Группы"
      addLabel="Добавить группу"
      base="/admin/groups"
      api="/api/admin/groups"
      empty="Групп пока нет"
      columns={[{ head: "Название", cell: (g) => g.name }]}
    />
  );
}
