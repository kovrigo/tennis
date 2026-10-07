import type { AdminNewsRow } from "../../api-types.ts";
import { dayFull } from "../../format.ts";
import { AdminList } from "./common.tsx";

export function AdminNewsList(_props: { id?: string }) {
  return (
    <AdminList<AdminNewsRow>
      title="Новости"
      addLabel="Добавить новость"
      base="/admin/news"
      api="/api/admin/news"
      empty="Новостей пока нет"
      columns={[
        { head: "Заголовок", cell: (n) => n.title },
        { head: "Дата", cell: (n) => <span className="num">{dayFull(n.date)}</span> },
      ]}
    />
  );
}
