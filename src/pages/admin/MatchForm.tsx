import { type FormEvent, useState } from "react";
import { api, useApi } from "../../api.ts";
import type { AdminMatch as Match, AdminPlayerRow, MatchFormContext, MatchInput } from "../../api-types.ts";
import { DeleteControl, Field, FormFooter, fieldProps, setFlash, useForm, useRequestId } from "../../components/form.tsx";
import { Empty, NotFound, PageData } from "../../components/states.tsx";
import { Link, useLocation } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb, DuplicateWarning, TextField, duplicatesOf, go, openCreated, useJustCreated } from "./common.tsx";
import { NO_PLAYER, type PickedPlayer, PlayerPicker, playerLabel } from "./PlayerPicker.tsx";

// Match: division, round, day, time, court, judge and two players. A new player typed in
// here is saved with the match (newA/newB); a namesake asks first.

interface Values {
  divisionId: string;
  round: string;
  day: string;
  time: string;
  court: string;
  judgeId: string;
  a: PickedPlayer;
  b: PickedPlayer;
}

const ROUNDS = ["1-й круг", "1/8 финала", "1/4 финала", "1/2 финала", "финал"];

const toValues = (m: Match): Values => ({
  divisionId: String(m.divisionId),
  round: m.round,
  day: m.day,
  time: m.time ?? "",
  court: m.court,
  judgeId: m.judgeId === null ? "" : String(m.judgeId),
  a: { ...NO_PLAYER, id: m.playerA, text: playerLabel(m.a) },
  b: { ...NO_PLAYER, id: m.playerB, text: playerLabel(m.b) },
});

export function AdminMatch({ id }: { id?: string }) {
  const tid = useLocation().query.get("tournament");
  const match = useApi<Match>(id ? `/api/admin/matches/${id}` : null);
  const ctxTid = id ? (match.data?.tournamentId ?? null) : tid;
  const ctx = useApi<MatchFormContext>(ctxTid ? `/api/admin/match-form?tournament=${ctxTid}` : null);
  if (!id && !tid) return <NotFound />;
  if (!id) return <PageData loaded={ctx}>{(c) => <MatchPage match={null} ctx={c} />}</PageData>;
  return (
    <PageData loaded={match}>{(m) => <PageData loaded={ctx}>{(c) => <MatchPage match={m} ctx={c} />}</PageData>}</PageData>
  );
}

function MatchPage({ match, ctx }: { match: Match | null; ctx: MatchFormContext }) {
  const [m, setM] = useState(match);
  const t = ctx.tournament;
  const back = `/admin/tournaments/${t.id}`;
  const empty: Values = {
    divisionId: ctx.divisions.length === 1 ? String(ctx.divisions[0].id) : "",
    round: "",
    day: t.startDate === t.endDate ? t.startDate : "",
    time: "",
    court: "",
    judgeId: "",
    a: NO_PLAYER,
    b: NO_PLAYER,
  };
  const form = useForm<Values>(m ? toValues(m) : empty);
  const created = useJustCreated(form.dirty);
  const requestId = useRequestId();
  const [dups, setDups] = useState<AdminPlayerRow[] | null>(null);
  useTitle(m ? `Матч: ${m.a.name} — ${m.b.name}` : "Новый матч");
  const v = form.values;

  if (ctx.divisions.length === 0)
    return (
      <div className="wrap admin">
        <Crumb to={back}>{t.name}</Crumb>
        <h1>Новый матч</h1>
        <Empty>Сначала добавьте разряд</Empty>
        <p className="after-empty">
          <Link className="btn btn-p" to={`/admin/divisions/new?tournament=${t.id}`}>
            Добавить разряд
          </Link>
        </p>
      </div>
    );

  const started = m !== null && (m.state !== "not_started" || m.pointsCount > 0);
  const judgeChanged = m !== null && m.pointsCount > 0 && v.judgeId !== "" && v.judgeId !== String(m.judgeId ?? "");

  const save = async (confirmDuplicate: boolean) => {
    setDups(null);
    const out: { saved: Match | null } = { saved: null };
    const ok = await form.submit(async (values) => {
      const side = (p: PickedPlayer) =>
        p.isNew ? { id: 0, np: { firstName: p.firstName, lastName: p.lastName, city: p.city } } : { id: p.id, np: undefined };
      const a = side(values.a);
      const b = side(values.b);
      const body: MatchInput = {
        divisionId: Number(values.divisionId) || 0,
        round: values.round,
        day: values.day,
        time: values.time || null,
        court: values.court,
        playerA: a.id,
        playerB: b.id,
        newA: a.np,
        newB: b.np,
        confirmDuplicate: confirmDuplicate || undefined,
        judgeId: values.judgeId ? Number(values.judgeId) : null,
      };
      try {
        out.saved = m
          ? await api<Match>(`/api/admin/matches/${m.id}`, { method: "PUT", body })
          : await api<Match>("/api/admin/matches", { method: "POST", body: { ...body, requestId } });
      } catch (e) {
        setDups(duplicatesOf(e));
        throw e;
      }
    });
    if (!ok || !out.saved) return;
    if (!m) return openCreated(`/admin/matches/${out.saved.id}`);
    // New players now have ids: the next save must not add them again.
    setM(out.saved);
    form.reset(toValues(out.saved));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  return (
    <div className="wrap admin">
      <Crumb to={back}>{t.name}</Crumb>
      <div className="admin-bar">
        <h1>{m ? `${m.a.name} — ${m.b.name}` : "Новый матч"}</h1>
        {m && (
          <span className="bar-links">
            <Link className="btn btn-o" to={`/admin/matches/${m.id}/result`}>
              Итог вручную
            </Link>
            <Link className="btn btn-o" to={`/matches/${m.id}`}>
              Протокол
            </Link>
          </span>
        )}
      </div>
      {started && <p className="note">Матч уже начат. Счёт сохранится при любых исправлениях</p>}

      <form className="form" onSubmit={onSubmit} noValidate>
        <Field label="Разряд" name="divisionId" error={form.errors.divisionId}>
          <select
            value={v.divisionId}
            onChange={(e) => form.set("divisionId", e.target.value)}
            {...fieldProps("divisionId", form.errors.divisionId)}
          >
            {v.divisionId === "" && <option value="">Выберите разряд</option>}
            {ctx.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <TextField form={form} name="round" label="Круг" list="rounds" autoComplete="off" />
        <datalist id="rounds">
          {ROUNDS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="field-row">
          <TextField form={form} name="day" label="День" type="date" min={t.startDate} max={t.endDate} />
          <TextField form={form} name="time" label="Время" type="time" optional />
          <TextField form={form} name="court" label="Корт" optional />
        </div>
        <Field
          label="Судья"
          name="judgeId"
          optional
          error={form.errors.judgeId}
          hint={judgeChanged ? "Новый судья продолжит с текущего счёта" : undefined}
        >
          <select
            value={v.judgeId}
            onChange={(e) => form.set("judgeId", e.target.value)}
            {...fieldProps("judgeId", form.errors.judgeId)}
          >
            <option value="">Не назначен</option>
            {ctx.judges.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </Field>
        <PlayerPicker
          name="playerA"
          label="Игрок 1"
          value={v.a}
          players={ctx.players}
          errors={form.errors}
          onChange={(p) => form.set("a", p)}
        />
        <PlayerPicker
          name="playerB"
          label="Игрок 2"
          value={v.b}
          players={ctx.players}
          errors={form.errors}
          onChange={(p) => form.set("b", p)}
        />

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
          cancelTo={back}
        />
        {m && (
          <div className="delete-zone">
            <DeleteControl
              name={`${m.a.name} — ${m.b.name}`}
              reason={m.pointsCount > 0 ? "Матч с очками удалить нельзя" : null}
              onDelete={async () => {
                await api(`/api/admin/matches/${m.id}`, { method: "DELETE" });
                setFlash(`Удалено: ${m.a.name} — ${m.b.name}`);
                go(back);
              }}
            />
          </div>
        )}
      </form>
    </div>
  );
}
