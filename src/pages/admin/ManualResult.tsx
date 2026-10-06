import { type FormEvent, useState } from "react";
import { api, useApi } from "../../api.ts";
import type { AdminMatch, ManualResultInput, Side } from "../../api-types.ts";
import { type Failure, FailureMessage, FormFooter, failureOf, setFlash, useForm } from "../../components/form.tsx";
import { PageData } from "../../components/states.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb, RadioField, TextField, go } from "./common.tsx";

// Manual result: winner (required), up to three sets in the players' order, a note.
// The same form corrects it; "Снять итог" gives the match back to the judge's score.

interface Values {
  winner: Side | "";
  /** Three [a, b] pairs as typed; empty pairs are not sent. */
  sets: [string, string][];
  note: string;
}

const toValues = (m: AdminMatch): Values => {
  const sets: [string, string][] = (m.manual?.sets ?? []).map(([a, b]) => [String(a), String(b)]);
  while (sets.length < 3) sets.push(["", ""]);
  return { winner: m.manual?.winner ?? "", sets, note: m.manual?.note ?? "" };
};

export function AdminManualResult({ id }: { id?: string }) {
  const loaded = useApi<AdminMatch>(`/api/admin/matches/${id}`);
  return <PageData loaded={loaded}>{(m) => <ResultPage m={m} />}</PageData>;
}

function ResultPage({ m }: { m: AdminMatch }) {
  useTitle(`Итог вручную: ${m.a.name} — ${m.b.name}`);
  const form = useForm<Values>(toValues(m));
  const [hasResult, setHasResult] = useState(m.manual !== null);
  const v = form.values;
  const back = `/admin/tournaments/${m.tournamentId}`;
  const names = { a: m.a.name, b: m.b.name };
  // The sets error marks the half-filled sets, else every filled one; an empty set is never wrong.
  const half = (p: [string, string]) => !p[0].trim() !== !p[1].trim();
  const anyHalf = v.sets.some(half);
  const badSet = (p: [string, string]) => Boolean(form.errors.sets) && (anyHalf ? half(p) : Boolean(p[0].trim() || p[1].trim()));

  const setScore = (set: number, side: 0 | 1, text: string) =>
    form.set(
      "sets",
      v.sets.map((p, i) => (i === set ? ((side === 0 ? [text, p[1]] : [p[0], text]) as [string, string]) : p)),
    );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await form.submit(async (values) => {
      const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
      const body: ManualResultInput = {
        winner: values.winner as Side,
        // A half-filled pair goes with null on the empty side, so the server names it.
        sets: values.sets.filter(([a, b]) => a.trim() || b.trim()).map(([a, b]) => [num(a), num(b)]),
        note: values.note,
      };
      await api(`/api/admin/matches/${m.id}/result`, { method: "PUT", body });
    });
    if (ok) setHasResult(true);
  };

  return (
    <div className="wrap admin">
      <Crumb to={back}>К турниру</Crumb>
      <h1>Итог вручную</h1>
      <p className="lead">
        {m.a.name} — {m.b.name}
      </p>
      {m.pointsCount > 0 && (
        <p className="note">Итог заменит счёт судьи на сайте и в протоколе. Судья больше не сможет вести этот матч</p>
      )}

      <form className="form" onSubmit={onSubmit} noValidate>
        <RadioField label="Победитель" name="winner" error={form.errors.winner}>
          {(["a", "b"] as const).map((s) => (
            <label key={s}>
              <input type="radio" name="winner" checked={v.winner === s} onChange={() => form.set("winner", s)} />
              {names[s]}
            </label>
          ))}
        </RadioField>

        <fieldset className="field">
          <legend className="label">
            Счёт по сетам<span className="opt"> (необязательно)</span>
          </legend>
          <table className="sets-grid">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Игрок</span>
                </th>
                {[1, 2, 3].map((n) => (
                  <th key={n} scope="col">
                    {n}-й сет
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["a", "b"] as const).map((s, side) => (
                <tr key={s}>
                  <th scope="row">{names[s]}</th>
                  {v.sets.map((pair, i) => (
                    <td key={i}>
                      <input
                        className="input set-input"
                        type="number"
                        min={0}
                        max={7}
                        inputMode="numeric"
                        aria-label={`${names[s]}, ${i + 1}-й сет`}
                        aria-invalid={badSet(pair) ? true : undefined}
                        value={pair[side]}
                        onChange={(e) => setScore(i, side as 0 | 1, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {form.errors.sets && <div className="err">{form.errors.sets}</div>}
        </fieldset>

        <TextField form={form} name="note" label="Пометка" optional hint="Например, «отказ» или «неявка»" />

        <FormFooter form={form} cancelTo={back} />
        {hasResult && (
          <div className="delete-zone">
            <RemoveResult m={m} back={back} />
          </div>
        )}
      </form>
    </div>
  );
}

/** "Снять итог", then a confirmation in place of the button. */
function RemoveResult({ m, back }: { m: AdminMatch; back: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  if (!asking)
    return (
      <button type="button" className="btn btn-danger" onClick={() => setAsking(true)}>
        Снять итог
      </button>
    );
  return (
    <div className="delete-ask">
      <span>Снять итог? Матч вернётся к счёту судьи</span>
      <button
        type="button"
        className="btn btn-danger-solid btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/admin/matches/${m.id}/result`, { method: "DELETE" });
            setFlash(`Итог снят: ${m.a.name} — ${m.b.name}`);
            go(back);
          } catch (e) {
            setError(failureOf(e).failure);
            setBusy(false);
          }
        }}
      >
        Да, снять итог
      </button>
      <button type="button" className="btn btn-o btn-sm" onClick={() => setAsking(false)}>
        Отмена
      </button>
      <FailureMessage failure={error} />
    </div>
  );
}
