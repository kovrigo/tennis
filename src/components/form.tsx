import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ApiFailure, newRequestId } from "../api.ts";
import { Link, setLeaveGuard } from "../router.tsx";

// Organizer form kit, per the design ("Экраны организатора → Общее"):
//   labels above fields, "(необязательно)" on optional ones;
//   "Сохранить" shows "Сохраняем…" and cannot be pressed twice; after saving the
//   form stays open with "Сохранено";
//   failures: fields in red with text under them, or one message above the buttons;
//   expired login: the input stays, a link opens the login page in a new tab;
//   leaving with unsaved changes asks first (browser and in-site links);
//   delete asks inline, a record that cannot be deleted shows the reason instead.

export type Failure =
  | { kind: "fields"; message: string }
  | { kind: "network" }
  | { kind: "expired" }
  | { kind: "other"; message: string };

const LEAVE = "Изменения не сохранены. Уйти со страницы?";

export interface FormState<T> {
  values: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Replace values and mark them saved (after load or save). */
  reset: (values: T) => void;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  /** Field name → message under the field. */
  errors: Record<string, string>;
  failure: Failure | null;
  /** Runs a save; maps failures; on success marks the values saved. */
  submit: (save: (values: T) => Promise<unknown>) => Promise<boolean>;
  /** Show a failure from elsewhere, e.g. a file check before upload. */
  setErrors: (errors: Record<string, string>) => void;
}

export function failureOf(e: unknown): { failure: Failure; errors: Record<string, string> } {
  if (!(e instanceof ApiFailure) || e.kind === "network") return { failure: { kind: "network" }, errors: {} };
  if (e.code === "unauthorized") return { failure: { kind: "expired" }, errors: {} };
  const errors = e.body?.fields ?? {};
  if (e.code === "validation" || Object.keys(errors).length) {
    return { failure: { kind: "fields", message: "Не сохранено: проверьте поля, отмеченные красным" }, errors };
  }
  return { failure: { kind: "other", message: e.body?.message ?? "Не сохранено" }, errors: {} };
}

/**
 * `owns` maps a value to the error keys it clears when changed, e.g. { a: ["playerA", "newA"] }:
 * "newA" also clears "newA.city". By default a value clears its own key and "key.*".
 */
export function useForm<T>(initial: T, owns: Partial<Record<keyof T, string[]>> = {}): FormState<T> {
  const [values, setValues] = useState<T>(initial);
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrorsState] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const busy = useRef(false);
  const ownsRef = useRef(owns);
  const dirty = JSON.stringify(values) !== baseline;

  useEffect(() => {
    if (!dirty) return;
    setLeaveGuard(() => window.confirm(LEAVE));
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty]);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
    const prefixes = ownsRef.current[key] ?? [key as string];
    setErrorsState((errs) => {
      const rest = Object.fromEntries(Object.entries(errs).filter(([k]) => !prefixes.some((p) => k === p || k.startsWith(`${p}.`))));
      return Object.keys(rest).length === Object.keys(errs).length ? errs : rest;
    });
  }, []);

  const reset = useCallback((v: T) => {
    setValues(v);
    setBaseline(JSON.stringify(v));
  }, []);

  const submit = useCallback(
    async (save: (values: T) => Promise<unknown>) => {
      if (busy.current) return false;
      busy.current = true;
      setSaving(true);
      setSaved(false);
      setFailure(null);
      setErrorsState({});
      try {
        await save(values);
        setBaseline(JSON.stringify(values));
        setSaved(true);
        return true;
      } catch (e) {
        const f = failureOf(e);
        setFailure(f.failure);
        setErrorsState(f.errors);
        return false;
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    [values],
  );

  const setErrors = useCallback((errs: Record<string, string>) => {
    setErrorsState(errs);
    setFailure(Object.keys(errs).length ? { kind: "fields", message: "Не сохранено: проверьте поля, отмеченные красным" } : null);
  }, []);

  return { values, set, reset, dirty, saving, saved, errors, failure, submit, setErrors };
}

/** requestId for a create form, made once when the form opens. */
export function useRequestId(): string {
  const [id] = useState(newRequestId);
  return id;
}

let flash: string | null = null;

/** One-time message for the next list page: "Удалено: Кубок области". */
export function setFlash(text: string): void {
  flash = text;
}

export function useFlash(): string | null {
  const [text] = useState(() => {
    const t = flash;
    flash = null;
    return t;
  });
  return text;
}

export function Field({
  label,
  name,
  optional,
  hint,
  error,
  children,
}: {
  label: string;
  /** id of the control inside; the label points at it. */
  name: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={error ? "field invalid" : "field"}>
      <label htmlFor={name}>
        {label}
        {optional && <span className="opt"> (необязательно)</span>}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && (
        <div className="err" id={`${name}-err`}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Props for an input inside Field: id, invalid state, link to the error text. */
export const fieldProps = (name: string, error?: string) => ({
  id: name,
  name,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${name}-err` : undefined,
});

export function FailureMessage({ failure }: { failure: Failure | null }) {
  if (!failure) return null;
  let text: ReactNode;
  if (failure.kind === "network") text = "Не сохранено: сайт не ответил. Введённое осталось в форме. Нажмите «Сохранить» ещё раз";
  else if (failure.kind === "expired")
    text = (
      <>
        Вход истёк.{" "}
        <a href="/login" target="_blank" rel="noopener" className="link">
          Войдите в новой вкладке
        </a>{" "}
        и нажмите «Сохранить» ещё раз
      </>
    );
  else text = failure.message;
  return (
    <div className="note-error" role="alert">
      {text}
    </div>
  );
}

/** Message, "Сохранить", "Отмена", "Сохранено" and an optional "Открыть на сайте". */
export function FormFooter({
  form,
  cancelTo,
  siteLink,
  saveLabel = "Сохранить",
}: {
  form: Pick<FormState<unknown>, "saving" | "saved" | "failure">;
  cancelTo: string;
  siteLink?: string;
  saveLabel?: string;
}) {
  return (
    <div className="form-foot">
      <FailureMessage failure={form.failure} />
      <div className="form-btns">
        <button type="submit" className="btn btn-p" disabled={form.saving}>
          {form.saving ? "Сохраняем…" : saveLabel}
        </button>
        <Link className="btn btn-o" to={cancelTo}>
          Отмена
        </Link>
        <span className="saved" role="status">
          {form.saved && "Сохранено"}
        </span>
        {siteLink && (
          <Link className="link site-link" to={siteLink}>
            Открыть на сайте
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * "Удалить" in red; then «Удалить «name»?» with "Да, удалить" and "Отмена".
 * With `reason` the button is replaced by the reason why it cannot be deleted.
 */
export function DeleteControl({
  name,
  reason,
  onDelete,
}: {
  name: string;
  reason?: string | null;
  /** Throws on failure; the error is shown next to the control. */
  onDelete: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  if (reason) return <p className="muted delete-reason">{reason}</p>;
  if (!asking)
    return (
      <button type="button" className="btn btn-danger" onClick={() => setAsking(true)}>
        Удалить
      </button>
    );
  return (
    <div className="delete-ask">
      <span>Удалить «{name}»?</span>
      <button
        type="button"
        className="btn btn-danger-solid btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onDelete();
          } catch (e) {
            setError(failureOf(e).failure);
            setBusy(false);
          }
        }}
      >
        Да, удалить
      </button>
      <button type="button" className="btn btn-o btn-sm" onClick={() => setAsking(false)}>
        Отмена
      </button>
      <FailureMessage failure={error} />
    </div>
  );
}
