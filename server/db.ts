import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// The only file that talks to node:sqlite (experimental in Node 22).
// node:sqlite throws on undefined and booleans, so every value goes through bind().

export type Db = DatabaseSync;
export type Row = Record<string, unknown>;
type Param = string | number | bigint | boolean | null | undefined | Uint8Array;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

function bind(params: Param[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

export function all<T = Row>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...bind(params)) as T[];
}

export function get<T = Row>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...bind(params)) as T | undefined;
}

export function run(db: Db, sql: string, ...params: Param[]): { changes: number; lastId: number } {
  const r = db.prepare(sql).run(...bind(params));
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}

let savepoint = 0;

/**
 * Runs fn in a transaction: BEGIN IMMEDIATE outside, a SAVEPOINT when nested
 * (seeds call the same save functions as the forms). Rolls back on error.
 * fn must be synchronous.
 */
export function tx<T>(db: Db, fn: () => T): T {
  const nested = db.isTransaction;
  const name = `sp${++savepoint}`;
  db.exec(nested ? `SAVEPOINT ${name}` : "BEGIN IMMEDIATE");
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error("tx: fn must be synchronous");
    db.exec(nested ? `RELEASE ${name}` : "COMMIT");
    return result;
  } catch (e) {
    db.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : "ROLLBACK");
    throw e;
  }
}
