import { type InputHTMLAttributes, type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { ApiFailure, useApi } from "../../api.ts";
import type { AdminPlayerRow } from "../../api-types.ts";
import { Empty, PageData } from "../../components/states.tsx";
import { Field, type FormState, fieldProps, useFlash } from "../../components/form.tsx";
import { Link, navigate, setLeaveGuard } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import "../../styles/admin.css";

// Shared parts of the organizer screens: lists, row links, the saved state after a
// create, the duplicate player warning.

/** Leave without the unsaved-changes question: after a save or a delete. */
export function go(to: string, replace = false): void {
  setLeaveGuard(null);
  navigate(to, { replace });
}

let carried: { path: string; fileError: string } | null = null;

/** After a create: open the new record's address; its form shows "Сохранено". */
export function openCreated(path: string, fileError = ""): void {
  carried = { path, fileError };
  go(path, true);
}

function takeCarried() {
  const c = carried && carried.path === window.location.pathname ? carried : null;
  carried = null;
  return c;
}

/** On the page opened by openCreated: "Сохранено" until the first change, and a file error if any. */
export function useJustCreated(dirty: boolean): { saved: boolean; fileError: string } {
  const [c] = useState(takeCarried);
  const [fresh, setFresh] = useState(c !== null);
  useEffect(() => {
    if (dirty) setFresh(false);
  }, [dirty]);
  return { saved: fresh && !dirty, fileError: c?.fileError ?? "" };
}

/** A table row that opens `to`. The first cell holds the real link for keyboard and new tabs. */
export function rowOpen(to: string) {
  return {
    onClick: (e: MouseEvent<HTMLTableRowElement>) => {
      if ((e.target as Element).closest("a, button, input, select, textarea, label")) return;
      navigate(to);
    },
  };
}

/** "← Кубок области": back to the tournament page. */
export function Crumb({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="crumb link" to={to}>
      ← {children}
    </Link>
  );
}

export interface Column<T> {
  head: string;
  cell: (row: T) => ReactNode;
  num?: boolean;
}

/** List page: title, "Добавить…" above the table, flash "Удалено: …", rows open the form. */
export function AdminList<T extends { id: number }>({
  title,
  addLabel,
  base,
  api: path,
  empty,
  columns,
  order,
}: {
  title: string;
  addLabel: string;
  /** "/admin/players": the form is base/new and base/:id. */
  base: string;
  api: string;
  empty: string;
  columns: Column<T>[];
  order?: (rows: T[]) => T[];
}) {
  useTitle(title);
  const flash = useFlash();
  const loaded = useApi<T[]>(path);
  return (
    <PageData loaded={loaded}>
      {(data) => {
        const rows = order ? order(data) : data;
        return (
          <div className="wrap admin">
            <div className="admin-bar">
              <h1>{title}</h1>
              <Link className="btn btn-p" to={`${base}/new`}>
                {addLabel}
              </Link>
            </div>
            {flash && (
              <p className="flash" role="status">
                {flash}
              </p>
            )}
            {rows.length === 0 ? (
              <Empty>{empty}</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data rows">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c.head} className={c.num ? "r" : undefined}>
                          {c.head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} {...rowOpen(`${base}/${r.id}`)}>
                        {columns.map((c, i) => (
                          <td key={c.head} className={c.num ? "r num" : undefined}>
                            {i === 0 ? (
                              <Link className="row-link" to={`${base}/${r.id}`}>
                                {c.cell(r)}
                              </Link>
                            ) : (
                              c.cell(r)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      }}
    </PageData>
  );
}

/** Sort by "Фамилия Имя" as Russian readers expect. */
export const byName = new Intl.Collator("ru").compare;

/** Players with the same first name, last name and city, from a 409 `duplicate`; else null. */
export function duplicatesOf(e: unknown): AdminPlayerRow[] | null {
  if (e instanceof ApiFailure && e.code === "duplicate") return e.body?.duplicates ?? [];
  return null;
}

/** «Такой игрок уже есть: Морозов Артём, Всеволожск, матчей: 3» with "Всё равно добавить" and "Отмена". */
export function DuplicateWarning({
  players,
  busy,
  onConfirm,
  onCancel,
}: {
  players: AdminPlayerRow[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const list = players.map((p) => `${p.name}, ${p.city}, матчей: ${p.matchCount}`).join("; ");
  return (
    <div className="note dup" role="alert">
      <p>Такой игрок уже есть: {list}</p>
      <div className="form-btns">
        <button type="button" className="btn btn-p btn-sm" disabled={busy} onClick={onConfirm}>
          Всё равно добавить
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

/** A radio group with the field look: legend above, error below. */
export function RadioField({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={error ? "field invalid" : "field"}
      aria-describedby={error ? `${name}-err` : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="label">{label}</legend>
      <div className="radios">{children}</div>
      {error && (
        <div className="err" id={`${name}-err`}>
          {error}
        </div>
      )}
    </fieldset>
  );
}

type StringKey<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T] & string;

/** Text input bound to a form value, with label, hint and the error under it. */
export function TextField<T>({
  form,
  name,
  label,
  type = "text",
  optional,
  hint,
  ...rest
}: {
  form: FormState<T>;
  name: StringKey<T>;
  label: string;
  type?: string;
  optional?: boolean;
  hint?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "form" | "name" | "type" | "value" | "onChange">) {
  const error = form.errors[name];
  return (
    <Field label={label} name={name} optional={optional} hint={hint} error={error}>
      <input
        type={type}
        value={String(form.values[name])}
        onChange={(e) => form.set(name, e.target.value as T[StringKey<T>])}
        {...fieldProps(name, error)}
        {...rest}
      />
    </Field>
  );
}
