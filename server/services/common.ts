import { type Db, get, run } from "../db.ts";
import { ApiError, fail } from "../http.ts";

// Shared by every save function: field checks with Russian texts, names, create-once.

export type Fields = Record<string, string>;

export const collator = new Intl.Collator("ru", { numeric: true });

/** Trimmed string, or "" for anything that is not a string. */
export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** Like str() but keeps line breaks (news text). */
export function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}

export function required(errs: Fields, key: string, v: unknown, message: string, max = 200): string {
  const s = str(v, max);
  if (!s) errs[key] = message;
  return s;
}

export function intOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export function check(errs: Fields): void {
  if (Object.keys(errs).length) throw fail.validation(errs);
}

export function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw fail.badRequest();
  return v as Record<string, unknown>;
}

/** Route param ":id" as a positive integer, else 404. */
export function idParam(v: string | undefined): number {
  if (!v || !/^\d{1,12}$/.test(v)) throw fail.notFound();
  return Number(v);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs create() once per requestId: a repeated "Сохранить" after a lost answer
 * returns the record made the first time. Call inside a transaction.
 */
export function createOnce(db: Db, requestId: unknown, entity: string, create: () => number): number {
  if (requestId === undefined || requestId === null) return create();
  if (typeof requestId !== "string" || !UUID.test(requestId)) throw fail.badRequest("Неверный номер запроса");
  const done = get<{ entity: string; entity_id: number }>(
    db,
    "SELECT entity, entity_id FROM create_requests WHERE request_id = ?",
    requestId,
  );
  if (done) {
    if (done.entity !== entity) throw fail.badRequest("Неверный номер запроса");
    return done.entity_id;
  }
  const id = create();
  run(db, "INSERT INTO create_requests (request_id, entity, entity_id, created_at) VALUES (?, ?, ?, ?)", requestId, entity, id, new Date().toISOString());
  return id;
}

// ---------- names ----------

export interface NameRow {
  first_name: string;
  last_name: string;
}

/** "Морозов Артём". */
export const fullName = (p: NameRow) => `${p.last_name} ${p.first_name}`;

/** "Морозов А.". */
export const shortName = (p: NameRow) => `${p.last_name} ${p.first_name.slice(0, 1)}.`;

/** Names for the two players of one match: short, or full for both when the short ones coincide. */
export function matchNames(a: NameRow, b: NameRow): [string, string] {
  const sa = shortName(a);
  const sb = shortName(b);
  return sa === sb ? [fullName(a), fullName(b)] : [sa, sb];
}

/** For duplicate checks: case-insensitive, "ё" equals "е", single spaces. */
export const normalize = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export function notFoundUnless<T>(row: T | undefined): T {
  if (!row) throw fail.notFound();
  return row;
}

export { ApiError };
