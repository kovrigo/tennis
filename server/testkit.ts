import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { type AppStatus, createApp } from "./app.ts";
import { LoginLimiter, hashPasswordSync } from "./auth.ts";
import { type Db, openDb, run } from "./db.ts";
import { migrate } from "./migrate.ts";
import { saveDivision, saveGroup } from "./services/divisions.ts";
import { saveMatch } from "./services/matches.ts";
import { saveJudge } from "./services/people.ts";
import { createPlayer } from "./services/players.ts";
import { saveRegulation, saveTournament } from "./services/tournaments.ts";

// Test helpers (not a test file): databases, a running app, sample records.

export const MIGRATIONS = join(import.meta.dirname, "migrations");
const ROOT = join(import.meta.dirname, "..");

/** New folder under the repo's tmp/ for tests that need real files. */
export function tmpDir(prefix: string): string {
  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  return mkdtempSync(join(ROOT, "tmp", `${prefix}-`));
}

/** In-memory database with every migration and no samples. */
export function memoryDb(): Db {
  const db = openDb(":memory:");
  migrate(db, MIGRATIONS, null);
  return db;
}

export const okStatus = (): AppStatus => ({
  commit: "test",
  migration: { latest: "001_init", pending: 0, drift: [] },
  seed: { latest: "001_samples", pending: 0 },
  error: null,
  fatal: false,
});

export interface TestApp {
  db: Db;
  base: string;
  filesDir: string;
  status: AppStatus;
  server: Server;
  close: () => Promise<void>;
  /** fetch with an optional session cookie; bodies are JSON unless a Buffer is given. */
  call: (method: string, path: string, opts?: { body?: unknown; cookie?: string; headers?: Record<string, string> }) => Promise<Response>;
  login: (login: string, password: string) => Promise<string>;
}

export async function startApp(db = memoryDb(), status = okStatus()): Promise<TestApp> {
  const filesDir = tmpDir("files");
  const handler = createApp({ db, filesDir, cookieName: "tennis_session_test", status, limiter: new LoginLimiter() });
  const server = createServer(async (req, res) => {
    if (!(await handler(req, res))) res.writeHead(418).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call: TestApp["call"] = (method, path, opts = {}) => {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.cookie) headers.cookie = opts.cookie;
    let body: BodyInit | undefined;
    if (opts.body instanceof Buffer) body = new Uint8Array(opts.body);
    else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers["content-type"] ??= "application/json";
    }
    return fetch(`${base}${path}`, { method, headers, body });
  };
  const login = async (l: string, password: string) => {
    const r = await call("POST", "/api/login", { body: { login: l, password } });
    if (r.status !== 200) throw new Error(`login ${l}: ${r.status} ${await r.text()}`);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  return {
    db,
    base,
    filesDir,
    status,
    server,
    call,
    login,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ---------- records ----------

export function addOrganizer(db: Db, login = "organizer", password = "tennis-org"): number {
  return run(
    db,
    "INSERT INTO users (role, first_name, last_name, login, password_hash, created_at) VALUES ('organizer', 'Анна', 'Смирнова', ?, ?, ?)",
    login,
    hashPasswordSync(password),
    new Date().toISOString(),
  ).lastId;
}

export function addJudge(db: Db, login = "judge1", password = "tennis-judge1", lastName = "Иванов"): number {
  return saveJudge(db, { firstName: "Пётр", lastName, login }, hashPasswordSync(password)).id;
}

export const PDF = Buffer.from("%PDF-1.4\n% test\n");

/** Tournament over the given days, a division, two players and one match on `day`. */
export function addMatchSetup(
  db: Db,
  opts: { start: string; end: string; day: string; judgeId?: number | null; filesDir?: string; table?: [string, number][]; groupId?: number | null },
) {
  const tournamentId = saveTournament(db, { name: "Турнир", startDate: opts.start, endDate: opts.end, city: "Тосно", venue: "", kind: "amateur", category: "" });
  if (opts.table?.length) saveRegulation(db, opts.filesDir ?? tmpDir("files"), tournamentId, "Положение.pdf", PDF);
  const division = saveDivision(db, {
    tournamentId,
    name: "Мужчины",
    groupId: opts.groupId ?? (opts.table?.length ? saveGroup(db, { name: "Мужчины" }).id : null),
    rows: (opts.table ?? []).map(([name, points]) => ({ name, points })),
  });
  const a = createPlayer(db, { firstName: "Артём", lastName: "Морозов", city: "Всеволожск" });
  const b = createPlayer(db, { firstName: "Денис", lastName: "Кравцов", city: "Гатчина" });
  const match = saveMatch(db, { divisionId: division.id, round: "Финал", day: opts.day, time: "10:00", court: "Корт 1", playerA: a, playerB: b, judgeId: opts.judgeId ?? null });
  return { tournamentId, divisionId: division.id, division, a, b, matchId: match.id };
}

export const action = (type: "point" | "undo", expectedSeq: number, side?: "a" | "b", requestId = randomUUID()) => ({
  requestId,
  type,
  side,
  expectedSeq,
});
