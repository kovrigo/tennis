import type { AdminJudgeRow, AdminNewsRow, Contacts, NewsItem } from "../../src/api-types.ts";
import { type Db, all, get, run, tx } from "../db.ts";
import { ApiError, fail } from "../http.ts";
import { isDay, moscowDay } from "../time.ts";
import { type Fields, check, collator, createOnce, notFoundUnless, obj, required, str, text } from "./common.ts";

// Judges' accounts, news and footer contacts.

export const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;

const JUDGE_SELECT = `
  SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.login,
         (SELECT COUNT(*) FROM matches m WHERE m.judge_id = u.id AND m.day = ?) AS todayMatches
  FROM users u WHERE u.role = 'judge'`;

export function judgeRows(db: Db): AdminJudgeRow[] {
  return all<AdminJudgeRow>(db, JUDGE_SELECT, moscowDay()).sort(
    (a, b) => collator.compare(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`),
  );
}

export function judgeRow(db: Db, id: number): AdminJudgeRow {
  return notFoundUnless(get<AdminJudgeRow>(db, `${JUDGE_SELECT} AND u.id = ?`, moscowDay(), id));
}

/** Checks a password typed in a form: required for a new judge, optional on edit. Returns it or null. */
export function judgePassword(body: unknown, creating: boolean): string | null {
  const v = (body as Record<string, unknown>)?.password;
  const pw = typeof v === "string" ? v : "";
  if (!pw && !creating) return null;
  if (!pw) throw fail.validation({ password: "Укажите пароль" });
  if (pw.length < 8) throw fail.validation({ password: "Пароль — не короче 8 знаков" });
  if (pw.length > 200) throw fail.validation({ password: "Слишком длинный пароль" });
  return pw;
}

/** Saves a judge. The password is hashed by the caller before the transaction. A new password ends the judge's sessions. */
export function saveJudge(db: Db, body: unknown, passwordHash: string | null, id?: number): AdminJudgeRow {
  const b = obj(body);
  const errs: Fields = {};
  const firstName = required(errs, "firstName", b.firstName, "Укажите имя", 100);
  const lastName = required(errs, "lastName", b.lastName, "Укажите фамилию", 100);
  const login = str(b.login, 64).toLowerCase();
  if (!LOGIN_RE.test(login)) errs.login = "Логин — от 3 до 32 латинских букв, цифр, точек, дефисов или подчёркиваний";
  if (id === undefined && !passwordHash) errs.password = "Укажите пароль";
  check(errs);
  return tx(db, () => {
    const taken = get<{ id: number }>(db, "SELECT id FROM users WHERE login = ?", login);
    if (id === undefined) {
      const repeated =
        typeof b.requestId === "string"
          ? get<{ entity_id: number }>(db, "SELECT entity_id FROM create_requests WHERE request_id = ? AND entity = 'judge'", b.requestId)
          : undefined;
      if (repeated) return judgeRow(db, repeated.entity_id);
      if (taken) throw loginTaken();
      const newId = createOnce(db, b.requestId, "judge", () =>
        run(
          db,
          "INSERT INTO users (role, first_name, last_name, login, password_hash, created_at) VALUES ('judge', ?, ?, ?, ?, ?)",
          firstName,
          lastName,
          login,
          passwordHash,
          new Date().toISOString(),
        ).lastId,
      );
      return judgeRow(db, newId);
    }
    judgeRow(db, id);
    if (taken && taken.id !== id) throw loginTaken();
    run(db, "UPDATE users SET first_name = ?, last_name = ?, login = ? WHERE id = ?", firstName, lastName, login, id);
    if (passwordHash) {
      run(db, "UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, id);
      run(db, "DELETE FROM sessions WHERE user_id = ?", id);
    }
    return judgeRow(db, id);
  });
}

const loginTaken = () => new ApiError(409, "login_taken", "Такой логин уже есть", { fields: { login: "Такой логин уже есть" } });

// ---------- news ----------

export function newsRows(db: Db): AdminNewsRow[] {
  return all<AdminNewsRow>(db, "SELECT id, title, date FROM news ORDER BY date DESC, id DESC");
}

export function newsItem(db: Db, id: number): NewsItem {
  return notFoundUnless(get<NewsItem>(db, "SELECT id, title, date, body FROM news WHERE id = ?", id));
}

export function saveNews(db: Db, body: unknown, id?: number): NewsItem {
  const b = obj(body);
  const errs: Fields = {};
  const title = required(errs, "title", b.title, "Укажите заголовок");
  const date = str(b.date, 10) || moscowDay();
  if (!isDay(date)) errs.date = "Укажите дату";
  const content = text(b.body, 20000);
  if (!content) errs.body = "Напишите текст новости";
  check(errs);
  return tx(db, () => {
    if (id === undefined) {
      const newId = createOnce(db, b.requestId, "news", () =>
        run(db, "INSERT INTO news (title, date, body, created_at) VALUES (?, ?, ?, ?)", title, date, content, new Date().toISOString()).lastId,
      );
      return newsItem(db, newId);
    }
    newsItem(db, id);
    run(db, "UPDATE news SET title = ?, date = ?, body = ? WHERE id = ?", title, date, content, id);
    return newsItem(db, id);
  });
}

export function deleteNews(db: Db, id: number): void {
  tx(db, () => {
    newsItem(db, id);
    run(db, "DELETE FROM news WHERE id = ?", id);
  });
}

// ---------- contacts ----------

export function contacts(db: Db): Contacts {
  return get<Contacts>(db, "SELECT address, phone, email FROM contacts WHERE id = 1") ?? { address: "", phone: "", email: "" };
}

export function saveContacts(db: Db, body: unknown): Contacts {
  const b = obj(body);
  const c: Contacts = { address: str(b.address, 300), phone: str(b.phone, 50), email: str(b.email, 100) };
  if (c.email && !/^[^\s@]+@[^\s@]+$/.test(c.email)) throw fail.validation({ email: "Проверьте адрес почты" });
  run(db, "UPDATE contacts SET address = ?, phone = ?, email = ? WHERE id = 1", c.address, c.phone, c.email);
  return contacts(db);
}
