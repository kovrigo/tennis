import { type FormEvent, useState } from "react";
import { api, useApi } from "../../api.ts";
import type { GroupInput, GroupRow } from "../../api-types.ts";
import { FormFooter, useForm, useRequestId } from "../../components/form.tsx";
import { PageData } from "../../components/states.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb, TextField, openCreated, useJustCreated } from "./common.tsx";

// Rating group: a name. Groups are not deleted.

export function AdminGroup({ id }: { id?: string }) {
  const loaded = useApi<GroupRow>(id ? `/api/admin/groups/${id}` : null);
  if (!id) return <GroupPage group={null} />;
  return <PageData loaded={loaded}>{(g) => <GroupPage group={g} />}</PageData>;
}

function GroupPage({ group }: { group: GroupRow | null }) {
  const [g, setG] = useState(group);
  const form = useForm<{ name: string }>({ name: g?.name ?? "" });
  const created = useJustCreated(form.dirty);
  const requestId = useRequestId();
  useTitle(g ? g.name : "Новая группа");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const out: { saved: GroupRow | null } = { saved: null };
    const ok = await form.submit(async (values) => {
      const body: GroupInput = values;
      out.saved = g
        ? await api<GroupRow>(`/api/admin/groups/${g.id}`, { method: "PUT", body })
        : await api<GroupRow>("/api/admin/groups", { method: "POST", body: { ...body, requestId } });
    });
    if (!ok || !out.saved) return;
    if (!g) return openCreated(`/admin/groups/${out.saved.id}`);
    setG(out.saved);
  };

  return (
    <div className="wrap admin">
      <Crumb to="/admin/groups">Группы</Crumb>
      <h1>{g ? g.name : "Новая группа"}</h1>
      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField form={form} name="name" label="Название" />
        <FormFooter form={{ ...form, saved: form.saved || created.saved }} cancelTo="/admin/groups" />
      </form>
    </div>
  );
}
