import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { ApiFailure, api, useApi } from "../../api.ts";
import type {
  AdminMatchRow,
  AdminTournament as Tournament,
  FileInfo,
  TournamentInput,
  TournamentKind,
} from "../../api-types.ts";
import {
  DeleteControl,
  Field,
  FormFooter,
  fieldProps,
  setFlash,
  useFlash,
  useForm,
  useRequestId,
} from "../../components/form.tsx";
import { Empty, PageData } from "../../components/states.tsx";
import { dayShort, fileKind, fileSize, weekday } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb, RadioField, TextField, go, openCreated, rowOpen, useJustCreated } from "./common.tsx";

// Tournament: details with the regulation file, then its divisions and matches.
// A new tournament shows divisions and matches after the first save.

interface Values {
  name: string;
  startDate: string;
  endDate: string;
  city: string;
  venue: string;
  kind: TournamentKind;
  category: string;
  /** Regulation change waiting for "Сохранить": "", "remove", or "file:<name>:<size>:<time>". */
  file: string;
}

const EMPTY: Values = { name: "", startDate: "", endDate: "", city: "", venue: "", kind: "rtt", category: "", file: "" };

const toValues = (t: Tournament): Values => ({
  name: t.name,
  startDate: t.startDate,
  endDate: t.endDate,
  city: t.city,
  venue: t.venue,
  kind: t.kind,
  category: t.category,
  file: "",
});

const MAX_FILE = 20 * 1024 * 1024;
const BAD_TYPE = "Нужен файл PDF или Word";
const TOO_LARGE = "Файл больше 20 МБ";
const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function AdminTournament({ id }: { id?: string }) {
  const flash = useFlash();
  const loaded = useApi<Tournament>(id ? `/api/admin/tournaments/${id}` : null);
  if (!id) return <TournamentPage initial={null} flash={null} />;
  return <PageData loaded={loaded}>{(t) => <TournamentPage initial={t} flash={flash} />}</PageData>;
}

function TournamentPage({ initial, flash }: { initial: Tournament | null; flash: string | null }) {
  const [t, setT] = useState(initial);
  const form = useForm<Values>(initial ? toValues(initial) : EMPTY);
  const created = useJustCreated(form.dirty);
  const requestId = useRequestId();
  const createdId = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [fileError, setFileError] = useState(created.fileError);
  const v = form.values;
  useTitle(t ? t.name : "Новый турнир");

  // "/admin/tournaments/5#regulation" from the division form opens at the file field.
  useEffect(() => {
    if (window.location.hash === "#regulation") document.getElementById("regulation")?.scrollIntoView();
  }, []);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const err = !/\.(pdf|docx?)$/i.test(f.name) ? BAD_TYPE : f.size > MAX_FILE ? TOO_LARGE : "";
    setFileError(err);
    if (err) return;
    setPending(f);
    form.set("file", `file:${f.name}:${f.size}:${f.lastModified}`);
  };

  /** Sends the regulation change after the fields are saved. Returns the text for the file field. */
  const applyFile = async (id: number, values: Values): Promise<string> => {
    try {
      if (values.file === "remove") {
        await api(`/api/admin/tournaments/${id}/regulation`, { method: "DELETE" });
        setT((cur) => cur && { ...cur, regulation: null });
      } else if (values.file && pending) {
        const info = await api<FileInfo>(
          `/api/admin/tournaments/${id}/regulation?name=${encodeURIComponent(pending.name)}`,
          { method: "PUT", body: pending, timeoutMs: 120000 },
        );
        setT((cur) => cur && { ...cur, regulation: info });
      }
      return "";
    } catch (e) {
      // No answer or expired login: the whole save reports it and "Сохранить" tries again.
      if (!(e instanceof ApiFailure) || e.kind === "network" || e.code === "unauthorized") throw e;
      if (e.code === "too_large") return TOO_LARGE;
      if (e.code === "bad_file_type") return BAD_TYPE;
      return e.body?.fields?.file ?? e.body?.message ?? "";
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const out = { id: 0, fileError: "", sent: EMPTY };
    const ok = await form.submit(async (values) => {
      out.sent = values;
      const body: TournamentInput = {
        name: values.name,
        startDate: values.startDate,
        endDate: values.endDate,
        city: values.city,
        venue: values.venue,
        kind: values.kind,
        category: values.category,
      };
      // Fields first, then the file with the tournament's id.
      const known = t?.id ?? createdId.current;
      if (known) {
        const saved = await api<Tournament>(`/api/admin/tournaments/${known}`, { method: "PUT", body });
        if (t) setT(saved);
        out.id = known;
      } else {
        const saved = await api<Tournament>("/api/admin/tournaments", { method: "POST", body: { ...body, requestId } });
        out.id = createdId.current = saved.id;
      }
      out.fileError = await applyFile(out.id, values);
    });
    if (!ok) return;
    if (!t) return openCreated(`/admin/tournaments/${out.id}`, out.fileError);
    form.reset({ ...out.sent, file: "" });
    setPending(null);
    if (out.sent.file) setFileError(out.fileError);
  };

  const removeFile = () => {
    if (pending) {
      setPending(null);
      form.set("file", "");
    } else form.set("file", "remove");
  };

  const reg = t?.regulation ?? null;
  const shown =
    pending && v.file
      ? { name: pending.name, size: fileSize(pending.size), href: null }
      : reg && v.file !== "remove"
        ? { name: reg.name, size: `${fileKind(reg.type)}, ${fileSize(reg.size)}`, href: `/api/files/${reg.id}` }
        : null;
  const removeReason =
    !pending && t?.hasPointsTables ? "Положение нельзя убрать, пока у разрядов есть таблицы очков" : null;
  const fileErr = fileError || form.errors.file;

  return (
    <div className="wrap admin">
      <Crumb to="/admin/tournaments">Турниры</Crumb>
      <h1>{t ? t.name : "Новый турнир"}</h1>
      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField form={form} name="name" label="Название" />
        <div className="field-row">
          <TextField form={form} name="startDate" label="Дата начала" type="date" />
          <TextField form={form} name="endDate" label="Дата окончания" type="date" min={v.startDate || undefined} />
        </div>
        <div className="field-row">
          <TextField form={form} name="city" label="Город" />
          <TextField form={form} name="venue" label="Место" optional />
        </div>
        <RadioField label="Тип" name="kind" error={form.errors.kind}>
          <label>
            <input type="radio" name="kind" checked={v.kind === "rtt"} onChange={() => form.set("kind", "rtt")} />
            РТТ
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              checked={v.kind === "amateur"}
              onChange={() => form.set("kind", "amateur")}
            />
            любительский
          </label>
        </RadioField>
        <TextField form={form} name="category" label="Категория, как в положении" optional />

        <div id="regulation" className="regulation">
          <Field
            label="Положение"
            name="file"
            optional
            error={fileErr}
            hint={
              <>
                PDF или Word, до 20 МБ
                <br />
                Если таблица очков — в общем положении о рейтинге, приложите его
              </>
            }
          >
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              hidden={shown !== null}
              onChange={pick}
              {...fieldProps("file", fileErr)}
            />
            {shown && (
              <div className="file-row">
                {shown.href ? (
                  <a className="link" href={shown.href}>
                    {shown.name}
                  </a>
                ) : (
                  <span className="file-name">{shown.name}</span>
                )}
                <span className="muted">{shown.size}</span>
                <button type="button" className="btn btn-o btn-sm" onClick={() => fileInput.current?.click()}>
                  Заменить
                </button>
                {removeReason ? (
                  <span className="muted small">{removeReason}</span>
                ) : (
                  <button type="button" className="btn btn-danger btn-sm" onClick={removeFile}>
                    Убрать
                  </button>
                )}
              </div>
            )}
          </Field>
        </div>

        <FormFooter
          form={{ ...form, saved: form.saved || created.saved }}
          cancelTo="/admin/tournaments"
          siteLink={t ? `/tournaments/${t.id}` : undefined}
        />
        {t && (
          <div className="delete-zone">
            <DeleteControl
              name={t.name}
              reason={t.matchCount > 0 ? "Турнир с матчами удалить нельзя" : null}
              onDelete={async () => {
                await api(`/api/admin/tournaments/${t.id}`, { method: "DELETE" });
                setFlash(`Удалено: ${t.name}`);
                go("/admin/tournaments");
              }}
            />
          </div>
        )}
      </form>

      {t && <Divisions t={t} />}
      {t && <Matches t={t} />}
    </div>
  );
}

function Divisions({ t }: { t: Tournament }) {
  return (
    <section aria-labelledby="divisions-h">
      <div className="admin-bar sec-bar">
        <h2 id="divisions-h">Разряды</h2>
        <Link className="btn btn-p" to={`/admin/divisions/new?tournament=${t.id}`}>
          Добавить разряд
        </Link>
      </div>
      {t.divisions.length === 0 ? (
        <Empty>Разрядов пока нет</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data rows">
            <thead>
              <tr>
                <th>Название</th>
                <th>Группа</th>
                <th className="r">Строк в таблице</th>
                <th className="r">Мест отмечено</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {t.divisions.map((d) => (
                <tr key={d.id} {...rowOpen(`/admin/divisions/${d.id}`)}>
                  <td>{d.name}</td>
                  <td>{d.groupName ?? "—"}</td>
                  <td className="r num">{d.rowsCount}</td>
                  <td className="r num">{d.placementsCount}</td>
                  <td className="actions">
                    <Link to={`/admin/divisions/${d.id}`}>Изменить</Link>
                    <Link to={`/admin/divisions/${d.id}/placements`}>Места</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function scoreCell(m: AdminMatchRow): string {
  if (m.manual) return m.scoreText;
  if (m.state === "running") return m.scoreText ? `идёт · ${m.scoreText}` : "идёт";
  if (m.state === "finished") return m.scoreText || "завершён";
  return "не начат";
}

function Matches({ t }: { t: Tournament }) {
  return (
    <section aria-labelledby="matches-h">
      <div className="admin-bar sec-bar">
        <h2 id="matches-h">Матчи</h2>
        <Link className="btn btn-p" to={`/admin/matches/new?tournament=${t.id}`}>
          Добавить матч
        </Link>
      </div>
      {t.matches.length === 0 ? (
        <Empty>Матчей пока нет</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data rows matches">
            <thead>
              <tr>
                <th>День</th>
                <th>Время</th>
                <th>Корт</th>
                <th>Разряд</th>
                <th>Круг</th>
                <th>Игроки</th>
                <th>Судья</th>
                <th>Счёт</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {t.matches.map((m, i) => {
                const first = i === 0 || t.matches[i - 1].day !== m.day;
                return (
                  <tr key={m.id} className={first && i > 0 ? "day-first" : undefined} {...rowOpen(`/admin/matches/${m.id}`)}>
                    <td className="num nowrap">{first ? `${dayShort(m.day)}, ${weekday(m.day)}` : ""}</td>
                    <td className="num">{m.time ?? "—"}</td>
                    <td>{m.court || "—"}</td>
                    <td>{m.divisionName}</td>
                    <td>{m.round}</td>
                    <td>
                      {m.a.name} — {m.b.name}
                    </td>
                    <td>{m.judgeName ?? "—"}</td>
                    <td className="num">{scoreCell(m)}</td>
                    <td className="actions">
                      <Link to={`/admin/matches/${m.id}`}>Изменить</Link>
                      <Link to={`/admin/matches/${m.id}/result`}>Итог вручную</Link>
                      <Link to={`/matches/${m.id}`}>Протокол</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
