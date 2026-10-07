import { type FormEvent, useState } from "react";
import { api, useApi } from "../../api.ts";
import type { AdminPlayerRow, PlayerInput } from "../../api-types.ts";
import { DeleteControl, FormFooter, setFlash, useForm, useRequestId } from "../../components/form.tsx";
import { PageData } from "../../components/states.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb, DuplicateWarning, TextField, duplicatesOf, go, openCreated, useJustCreated } from "./common.tsx";

// Player: first name, last name, city. A namesake from the same city asks first.

interface Values {
  firstName: string;
  lastName: string;
  city: string;
}

export function AdminPlayer({ id }: { id?: string }) {
  const loaded = useApi<AdminPlayerRow>(id ? `/api/admin/players/${id}` : null);
  if (!id) return <PlayerPage player={null} />;
  return <PageData loaded={loaded}>{(p) => <PlayerPage player={p} />}</PageData>;
}

function PlayerPage({ player }: { player: AdminPlayerRow | null }) {
  const [p, setP] = useState(player);
  const form = useForm<Values>(
    p ? { firstName: p.firstName, lastName: p.lastName, city: p.city } : { firstName: "", lastName: "", city: "" },
  );
  const created = useJustCreated(form.dirty);
  const requestId = useRequestId();
  const [dups, setDups] = useState<AdminPlayerRow[] | null>(null);
  useTitle(p ? p.name : "Новый игрок");

  const save = async (confirmDuplicate: boolean) => {
    setDups(null);
    const out: { saved: AdminPlayerRow | null } = { saved: null };
    const ok = await form.submit(async (values) => {
      const body: PlayerInput = { ...values, confirmDuplicate: confirmDuplicate || undefined };
      try {
        out.saved = p
          ? await api<AdminPlayerRow>(`/api/admin/players/${p.id}`, { method: "PUT", body })
          : await api<AdminPlayerRow>("/api/admin/players", { method: "POST", body: { ...body, requestId } });
      } catch (e) {
        setDups(duplicatesOf(e));
        throw e;
      }
    });
    if (!ok || !out.saved) return;
    if (!p) return openCreated(`/admin/players/${out.saved.id}`);
    setP(out.saved);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  return (
    <div className="wrap admin">
      <Crumb to="/admin/players">Игроки</Crumb>
      <h1>{p ? p.name : "Новый игрок"}</h1>
      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField form={form} name="firstName" label="Имя" />
        <TextField form={form} name="lastName" label="Фамилия" />
        <TextField form={form} name="city" label="Город" />
        {dups && (
          <DuplicateWarning
            players={dups}
            busy={form.saving}
            onConfirm={() => void save(true)}
            onCancel={() => setDups(null)}
          />
        )}
        <FormFooter
          form={{ saving: form.saving, saved: form.saved || created.saved, failure: dups ? null : form.failure }}
          cancelTo="/admin/players"
          siteLink={p ? `/players/${p.id}` : undefined}
        />
        {p && (
          <div className="delete-zone">
            <DeleteControl
              name={p.name}
              reason={p.matchCount > 0 ? "Игрока с матчами удалить нельзя" : null}
              onDelete={async () => {
                await api(`/api/admin/players/${p.id}`, { method: "DELETE" });
                setFlash(`Удалено: ${p.name}`);
                go("/admin/players");
              }}
            />
          </div>
        )}
      </form>
    </div>
  );
}
