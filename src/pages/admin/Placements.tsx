import type { FormEvent } from "react";
import { api, useApi } from "../../api.ts";
import type { PlacementInput, PlacementsForm } from "../../api-types.ts";
import { FormFooter, useForm } from "../../components/form.tsx";
import { Empty, PageData } from "../../components/states.tsx";
import { points } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb } from "./common.tsx";

// Places of the division's players: a row of the points table, or text without a table.
// One place may go to several players; an empty choice means no place.

export function AdminPlacements({ id }: { id?: string }) {
  const loaded = useApi<PlacementsForm>(`/api/admin/divisions/${id}/placements`);
  return <PageData loaded={loaded}>{(p) => <PlacementsPage p={p} />}</PageData>;
}

/** Player id → points row id (with a table) or place text (without). */
type Values = Record<string, string>;

function PlacementsPage({ p }: { p: PlacementsForm }) {
  useTitle(`Места: ${p.divisionName}`);
  const form = useForm<Values>(
    Object.fromEntries(
      p.players.map((pl) => [String(pl.id), p.hasTable ? (pl.pointsRowId?.toString() ?? "") : pl.placeText]),
    ),
    Object.fromEntries(p.players.map((pl) => [String(pl.id), [`player.${pl.id}`]])),
  );
  const back = `/admin/tournaments/${p.tournamentId}`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await form.submit(async (values) => {
      const list: PlacementInput[] = [];
      for (const pl of p.players) {
        const value = (values[String(pl.id)] ?? "").trim();
        if (!value) continue;
        list.push(p.hasTable ? { playerId: pl.id, pointsRowId: Number(value) } : { playerId: pl.id, placeText: value });
      }
      await api(`/api/admin/divisions/${p.divisionId}/placements`, { method: "PUT", body: list });
    });
  };

  return (
    <div className="wrap admin">
      <Crumb to={back}>{p.tournamentName}</Crumb>
      <div className="admin-bar">
        <h1>Места: {p.divisionName}</h1>
        <Link className="btn btn-o" to={`/admin/divisions/${p.divisionId}`}>
          Разряд
        </Link>
      </div>
      {p.players.length === 0 ? (
        <>
          <Empty>Места отмечаются игрокам из матчей разряда. Сначала добавьте матчи</Empty>
          <p className="after-empty">
            <Link className="btn btn-p" to={`/admin/matches/new?tournament=${p.tournamentId}`}>
              Добавить матч
            </Link>
          </p>
        </>
      ) : (
        <form className="form form-wide" onSubmit={onSubmit} noValidate>
          <div className="table-wrap">
            <table className="data places">
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>Город</th>
                  <th>Место</th>
                  {p.hasTable && <th className="r">Очки</th>}
                </tr>
              </thead>
              <tbody>
                {p.players.map((pl) => {
                  const key = String(pl.id);
                  const value = form.values[key] ?? "";
                  const row = p.hasTable ? p.rows.find((r) => String(r.id) === value) : undefined;
                  const err = form.errors[`player.${pl.id}`];
                  const errId = `place-${pl.id}-err`;
                  return (
                    <tr key={pl.id}>
                      <td>{pl.name}</td>
                      <td>{pl.city}</td>
                      <td className={err ? "field invalid" : undefined}>
                        {p.hasTable ? (
                          <select
                            className="input"
                            aria-label={`Место: ${pl.name}`}
                            aria-invalid={err ? true : undefined}
                            aria-describedby={err ? errId : undefined}
                            value={value}
                            onChange={(e) => form.set(key, e.target.value)}
                          >
                            <option value="">—</option>
                            {p.rows.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="input"
                            type="text"
                            aria-label={`Место: ${pl.name}`}
                            aria-invalid={err ? true : undefined}
                            aria-describedby={err ? errId : undefined}
                            value={value}
                            onChange={(e) => form.set(key, e.target.value)}
                          />
                        )}
                        {err && (
                          <div className="err" id={errId}>
                            {err}
                          </div>
                        )}
                      </td>
                      {p.hasTable && <td className="r num">{row ? points(row.points) : ""}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <FormFooter form={form} cancelTo={back} />
        </form>
      )}
    </div>
  );
}
