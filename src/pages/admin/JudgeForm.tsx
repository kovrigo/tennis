import { type FormEvent, useState } from "react";
import { ApiFailure, api, useApi } from "../../api.ts";
import type { AdminJudgeRow, JudgeInput } from "../../api-types.ts";
import { Field, FormFooter, fieldProps, useForm, useRequestId } from "../../components/form.tsx";
import { PageData } from "../../components/states.tsx";
import { useTitle } from "../../site.tsx";
import { Crumb, TextField, openCreated, useJustCreated } from "./common.tsx";

// Judge: first name, last name, login, password. An existing judge keeps the password
// when "Новый пароль" is left empty. No delete.

interface Values {
  firstName: string;
  lastName: string;
  login: string;
  password: string;
}

const LOGIN_TAKEN = "Такой логин уже есть";

export function AdminJudge({ id }: { id?: string }) {
  const loaded = useApi<AdminJudgeRow>(id ? `/api/admin/judges/${id}` : null);
  if (!id) return <JudgePage judge={null} />;
  return <PageData loaded={loaded}>{(j) => <JudgePage judge={j} />}</PageData>;
}

function JudgePage({ judge }: { judge: AdminJudgeRow | null }) {
  const [j, setJ] = useState(judge);
  const form = useForm<Values>(
    j
      ? { firstName: j.firstName, lastName: j.lastName, login: j.login, password: "" }
      : { firstName: "", lastName: "", login: "", password: "" },
  );
  const created = useJustCreated(form.dirty);
  const requestId = useRequestId();
  const [show, setShow] = useState(false);
  const name = j ? `${j.lastName} ${j.firstName}` : "Новый судья";
  useTitle(name);
  const pwError = form.errors.password;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const out: { saved: AdminJudgeRow | null; sent: Values | null } = { saved: null, sent: null };
    const ok = await form.submit(async (values) => {
      out.sent = values;
      const body: JudgeInput = values;
      try {
        out.saved = j
          ? await api<AdminJudgeRow>(`/api/admin/judges/${j.id}`, { method: "PUT", body })
          : await api<AdminJudgeRow>("/api/admin/judges", { method: "POST", body: { ...body, requestId } });
      } catch (err) {
        // The login message belongs under the login field even if the server sent it alone.
        if (err instanceof ApiFailure && err.code === "login_taken" && !err.body?.fields?.login) {
          throw new ApiFailure("http", err.status, {
            error: "login_taken",
            message: err.body?.message ?? LOGIN_TAKEN,
            fields: { ...err.body?.fields, login: LOGIN_TAKEN },
          });
        }
        throw err;
      }
    });
    if (!ok || !out.saved || !out.sent) return;
    if (!j) return openCreated(`/admin/judges/${out.saved.id}`);
    setJ(out.saved);
    // The password is not shown again after it is saved.
    form.reset({ ...out.sent, password: "" });
  };

  return (
    <div className="wrap admin">
      <Crumb to="/admin/judges">Судьи</Crumb>
      <h1>{name}</h1>
      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField form={form} name="firstName" label="Имя" />
        <TextField form={form} name="lastName" label="Фамилия" />
        <TextField form={form} name="login" label="Логин" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <Field label={j ? "Новый пароль" : "Пароль"} name="password" optional={j !== null} error={pwError}>
          <div className="pass-row">
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={form.values.password}
              onChange={(e) => form.set("password", e.target.value)}
              {...fieldProps("password", pwError)}
            />
            <button type="button" className="btn btn-o btn-sm" aria-pressed={show} onClick={() => setShow(!show)}>
              Показать
            </button>
          </div>
        </Field>
        <FormFooter form={{ ...form, saved: form.saved || created.saved }} cancelTo="/admin/judges" />
      </form>
    </div>
  );
}
