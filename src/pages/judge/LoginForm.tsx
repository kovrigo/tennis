import { type FormEvent, useRef, useState } from "react";
import { ApiFailure, api } from "../../api.ts";
import type { LoginRequest, LoginResponse } from "../../api-types.ts";
import { Field, fieldProps } from "../../components/form.tsx";

// "Логин", "Пароль", "Войти" with the design's refusals. Used by the login page and,
// when the sign-in has expired, inline on the judge screens.

function errorText(e: unknown): string {
  if (!(e instanceof ApiFailure) || e.kind === "network") return "Сайт не ответил. Попробуйте ещё раз";
  if (e.code === "bad_credentials") return "Неверный логин или пароль";
  if (e.code === "too_many_attempts" && e.body?.minutes != null) {
    return `Слишком много попыток. Попробуйте через ${e.body.minutes} мин.`;
  }
  return e.message;
}

export function LoginForm({ onDone }: { onDone: (res: LoginResponse) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const body: LoginRequest = { login: login.trim(), password };
      onDone(await api<LoginResponse>("/api/login", { method: "POST", body }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <form className="j-login-form" onSubmit={submit}>
      <Field label="Логин" name="login">
        <input
          {...fieldProps("login")}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
      </Field>
      <Field label="Пароль" name="password">
        <input
          {...fieldProps("password")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && (
        <div className="note-error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn-p j-login-btn" disabled={busy}>
        Войти
      </button>
    </form>
  );
}

/** Expired sign-in on a judge screen: the form in place, the page stays as it is. */
export function Relogin({ onDone }: { onDone: (res: LoginResponse) => void }) {
  return (
    <div className="j-relogin">
      <p className="j-relogin-h">Вход истёк</p>
      <LoginForm onDone={onDone} />
    </div>
  );
}
