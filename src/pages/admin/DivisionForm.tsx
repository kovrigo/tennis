import { type FormEvent, useState } from "react";
import { api, useApi } from "../../api.ts";
import type { AdminDivision as Division, AdminTournament, DivisionInput, GroupRow } from "../../api-types.ts";
import { Field, FormFooter, fieldProps, useForm, useRequestId } from "../../components/form.tsx";
import { NotFound, PageData } from "../../components/states.tsx";
import { Link, useLocation } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb, TextField, openCreated, useJustCreated } from "./common.tsx";

// Division: name, rating group and the points table "место — очки".

interface Row {
  id?: number;
  name: string;
  points: string;
  placedCount: number;
}

interface Values {
  name: string;
  groupId: string;
  rows: Row[];
}

interface Context {
  tournamentId: number;
  tournamentName: string;
  hasRegulation: boolean;
}

const toValues = (d: Division): Values => ({
  name: d.name,
  groupId: d.groupId === null ? "" : String(d.groupId),
  rows: d.rows.map((r) => ({ id: r.id, name: r.name, points: String(r.points), placedCount: r.placedCount })),
});

export function AdminDivision({ id }: { id?: string }) {
  const tid = useLocation().query.get("tournament");
  const groups = useApi<GroupRow[]>("/api/admin/groups");
  const division = useApi<Division>(id ? `/api/admin/divisions/${id}` : null);
  const tournament = useApi<AdminTournament>(!id && tid ? `/api/admin/tournaments/${tid}` : null);
  if (!id && !tid) return <NotFound />;
  return (
    <PageData loaded={groups}>
      {(g) =>
        id ? (
          <PageData loaded={division}>{(d) => <DivisionPage division={d} ctx={d} groups={g} />}</PageData>
        ) : (
          <PageData loaded={tournament}>
            {(t) => (
              <DivisionPage
                division={null}
                ctx={{ tournamentId: t.id, tournamentName: t.name, hasRegulation: t.regulation !== null }}
                groups={g}
              />
            )}
          </PageData>
        )
      }
    </PageData>
  );
}

function DivisionPage({ division, ctx, groups }: { division: Division | null; ctx: Context; groups: GroupRow[] }) {
  const [d, setD] = useState(division);
  const form = useForm<Values>(d ? toValues(d) : { name: "", groupId: "", rows: [] });
  const created = useJustCreated(form.dirty);
  const requestId = useRequestId();
  useTitle(d ? d.name : "Новый разряд");
  const v = form.values;
  const back = `/admin/tournaments/${ctx.tournamentId}`;

  const setRow = (i: number, patch: Partial<Row>) =>
    form.set(
      "rows",
      v.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const out: { saved: Division | null } = { saved: null };
    const ok = await form.submit(async (values) => {
      const body: DivisionInput = {
        tournamentId: ctx.tournamentId,
        name: values.name,
        groupId: values.groupId ? Number(values.groupId) : null,
        // An empty points field goes as null so the server names the field.
        rows: values.rows.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          name: r.name,
          points: r.points.trim() === "" ? Number.NaN : Number(r.points),
        })),
      };
      out.saved = d
        ? await api<Division>(`/api/admin/divisions/${d.id}`, { method: "PUT", body })
        : await api<Division>("/api/admin/divisions", { method: "POST", body: { ...body, requestId } });
    });
    if (!ok || !out.saved) return;
    if (!d) return openCreated(`/admin/divisions/${out.saved.id}`);
    // New rows got ids: the next save must update them, not create them again.
    setD(out.saved);
    form.reset(toValues(out.saved));
  };

  const rowError = (i: number) =>
    form.errors[`rows.${i}.name`] ?? form.errors[`rows.${i}.points`] ?? form.errors[`rows.${i}`];

  return (
    <div className="wrap admin">
      <Crumb to={back}>{ctx.tournamentName}</Crumb>
      <div className="admin-bar">
        <h1>{d ? d.name : "Новый разряд"}</h1>
        {d && (
          <Link className="btn btn-o" to={`/admin/divisions/${d.id}/placements`}>
            Места
          </Link>
        )}
      </div>

      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField form={form} name="name" label="Название" />

        {groups.length === 0 ? (
          <div className="field">
            <span className="label">Рейтинговая группа</span>
            <p className="muted">Сначала добавьте рейтинговую группу</p>
            <Link className="link" to="/admin/groups/new">
              Добавить группу
            </Link>
            {form.errors.groupId && <div className="err">{form.errors.groupId}</div>}
          </div>
        ) : (
          <Field label="Рейтинговая группа" name="groupId" error={form.errors.groupId}>
            <select
              value={v.groupId}
              onChange={(e) => form.set("groupId", e.target.value)}
              {...fieldProps("groupId", form.errors.groupId)}
            >
              <option value="">Без группы</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className={form.errors.rows ? "field invalid" : "field"}>
          <span className="label">Таблица очков</span>
          {!ctx.hasRegulation ? (
            <div className="note">
              <p>Таблицу очков можно внести после того, как к турниру приложено положение</p>
              <Link className="link" to={`${back}#regulation`}>
                Приложить положение
              </Link>
            </div>
          ) : (
            <>
              {v.rows.length > 0 && (
                <div className="inline-rows points-rows">
                  <div className="inline-row points-head muted small" aria-hidden="true">
                    <span className="col-place">Место</span>
                    <span className="col-points">Очки</span>
                  </div>
                  {v.rows.map((r, i) => {
                    const err = rowError(i);
                    return (
                      <div key={r.id ?? `new-${i}`} className="points-row">
                        <div className="inline-row">
                          <input
                            className="input col-place"
                            type="text"
                            aria-label={`Место, строка ${i + 1}`}
                            aria-invalid={err ? true : undefined}
                            value={r.name}
                            onChange={(e) => setRow(i, { name: e.target.value })}
                          />
                          <input
                            className="input short col-points"
                            type="number"
                            min={0}
                            inputMode="numeric"
                            aria-label={`Очки, строка ${i + 1}`}
                            aria-invalid={err ? true : undefined}
                            value={r.points}
                            onChange={(e) => setRow(i, { points: e.target.value })}
                          />
                          {r.placedCount > 0 ? (
                            <span className="muted small">
                              Это место отмечено у игроков: {r.placedCount}. Сначала снимите его в{" "}
                              {d ? <Link to={`/admin/divisions/${d.id}/placements`}>«Местах»</Link> : "«Местах»"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                form.set(
                                  "rows",
                                  v.rows.filter((_, j) => j !== i),
                                )
                              }
                            >
                              Убрать
                            </button>
                          )}
                        </div>
                        {err && <div className="err">{err}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                className="btn btn-o btn-sm"
                onClick={() => form.set("rows", [...v.rows, { name: "", points: "", placedCount: 0 }])}
              >
                Добавить строку
              </button>
            </>
          )}
          {form.errors.rows && <div className="err">{form.errors.rows}</div>}
        </div>

        <FormFooter form={{ ...form, saved: form.saved || created.saved }} cancelTo={back} />
      </form>
    </div>
  );
}
