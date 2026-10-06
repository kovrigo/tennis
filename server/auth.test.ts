import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { routes } from "./app.ts";
import { LoginLimiter, createSession, readSession } from "./auth.ts";
import { get } from "./db.ts";
import { type TestApp, addJudge, addOrganizer, memoryDb, startApp } from "./testkit.ts";

// Sign-in, sessions and roles: S6.9, S9.1, S9.12.

let app: TestApp;
let organizer: string;
let judge: string;

beforeAll(async () => {
  const db = memoryDb();
  addOrganizer(db);
  addJudge(db);
  addJudge(db, "judge9", "tennis-judge9", "Петров");
  addJudge(db, "judge7", "tennis-judge7", "Сидоров");
  app = await startApp(db);
  organizer = await app.login("organizer", "tennis-org");
  judge = await app.login("judge1", "tennis-judge1");
});
afterAll(() => app.close());

const path = (template: string) => template.replace(/:\w+/g, "1");
const sample = (method: string) => (method === "POST" || method === "PUT" ? { body: {} } : {});

describe("roles on every route", () => {
  const closed = routes.filter(([, , access]) => access !== "public");

  test.each(closed.map(([m, p, a]) => [m, p, a]))("%s %s (%s): 401 without a session", async (method, template) => {
    const r = await app.call(method, path(template), sample(method));
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("unauthorized");
  });

  test.each(closed.map(([m, p, a]) => [m, p, a]))("%s %s (%s): 403 for the other role", async (method, template, access) => {
    const cookie = access === "organizer" ? judge : organizer;
    const r = await app.call(method, path(template), { ...sample(method), cookie });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("forbidden");
  });

  test("public routes only read, except sign-in and sign-out", () => {
    const writes = routes.filter(([m, , a]) => a === "public" && m !== "GET").map(([m, p]) => `${m} ${p}`);
    expect(writes).toEqual(["POST /api/login", "POST /api/logout"]);
  });
});

describe("sign-in", () => {
  test("wrong password and unknown login give bad_credentials", async () => {
    for (const body of [{ login: "judge1", password: "nope-nope" }, { login: "ghost", password: "whatever1" }]) {
      const r = await app.call("POST", "/api/login", { body });
      expect(r.status).toBe(401);
      expect(await r.json()).toMatchObject({ error: "bad_credentials", message: "Неверный логин или пароль" });
    }
  });

  test("login is case-insensitive; the cookie is HttpOnly, SameSite=Lax, a day long", async () => {
    const r = await app.call("POST", "/api/login", { body: { login: " Judge9 ", password: "tennis-judge9" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ role: "judge", name: "Петров П." });
    expect(r.headers.get("set-cookie")).toMatch(/^tennis_session_test=[\w-]+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=86400$/);
  });

  test("five wrong passwords close the login for 15 minutes, existing or not", async () => {
    // Own logins: a closed login must not leak into other tests of this app.
    for (const login of ["judge7", "nobody"]) {
      for (let i = 0; i < 5; i++) expect((await app.call("POST", "/api/login", { body: { login, password: "wrong-pass" } })).status).toBe(401);
      const r = await app.call("POST", "/api/login", { body: { login, password: "tennis-judge7" } });
      expect(r.status).toBe(429);
      expect(await r.json()).toMatchObject({ error: "too_many_attempts", minutes: 15, message: "Слишком много попыток. Попробуйте через 15 мин." });
    }
  });

  test("twenty parallel wrong passwords: only five reach the password check", async () => {
    const db = memoryDb();
    addJudge(db, "judge5", "tennis-judge5");
    const fresh = await startApp(db);
    const answers = await Promise.all(
      Array.from({ length: 20 }, () => fresh.call("POST", "/api/login", { body: { login: "judge5", password: "wrong-pass" } })),
    );
    const codes = answers.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(15);
    await fresh.close();
  });

  test("a right password clears the counter", () => {
    const l = new LoginLimiter();
    for (let i = 0; i < 4; i++) l.failure("a");
    l.success("a");
    for (let i = 0; i < 4; i++) l.failure("a");
    expect(l.lockedMinutes("a")).toBe(0);
    l.failure("a");
    expect(l.lockedMinutes("a")).toBe(15);
    expect(l.lockedMinutes("a", Date.now() + 15 * 60000 + 1)).toBe(0);
  });

  test("failures older than 15 minutes are forgotten", () => {
    const l = new LoginLimiter();
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) l.failure("a", t0);
    l.failure("a", t0 + 15 * 60000);
    expect(l.lockedMinutes("a", t0 + 15 * 60000)).toBe(0);
  });

  test("writes accept JSON only", async () => {
    const r = await app.call("POST", "/api/login", {
      body: Buffer.from("login=judge1&password=tennis-judge1"),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(r.status).toBe(400);
    const put = await app.call("PUT", "/api/admin/contacts", { cookie: organizer, body: Buffer.from("{}"), headers: { "content-type": "text/plain" } });
    expect(put.status).toBe(400);
  });

  test("sign-out ends the session", async () => {
    const db = memoryDb();
    addJudge(db, "judge7", "tennis-judge7");
    const fresh = await startApp(db);
    const c = await fresh.login("judge7", "tennis-judge7");
    expect((await fresh.call("GET", "/api/judge/matches", { cookie: c })).status).toBe(200);
    expect((await fresh.call("POST", "/api/logout", { cookie: c, body: {} })).status).toBe(200);
    expect((await fresh.call("GET", "/api/judge/matches", { cookie: c })).status).toBe(401);
    await fresh.close();
  });
});

describe("sessions", () => {
  test("a session lasts 24 hours after the last request and is renewed at most hourly", () => {
    const db = memoryDb();
    const id = addJudge(db);
    const t0 = new Date("2026-10-06T06:00:00Z");
    const token = createSession(db, id, t0);
    expect(readSession(db, token, new Date("2026-10-06T06:30:00Z"))?.refreshed).toBe(false);
    expect(readSession(db, token, new Date("2026-10-06T07:00:01Z"))?.refreshed).toBe(true);
    // Renewed at 07:00:01, so it is still valid next morning at 06:30.
    expect(readSession(db, token, new Date("2026-10-07T06:30:00Z"))?.user.login).toBe("judge1");
    expect(readSession(db, token, new Date("2026-10-08T07:30:00Z"))).toBeNull();
    expect(get(db, "SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 0 });
  });

  test("a new judge password ends the judge's sessions", async () => {
    const db = memoryDb();
    addOrganizer(db);
    const judgeId = addJudge(db, "judge3", "tennis-judge3");
    const fresh = await startApp(db);
    const org = await fresh.login("organizer", "tennis-org");
    const c = await fresh.login("judge3", "tennis-judge3");
    const r = await fresh.call("PUT", `/api/admin/judges/${judgeId}`, {
      cookie: org,
      body: { firstName: "Пётр", lastName: "Иванов", login: "judge3", password: "new-password" },
    });
    expect(r.status).toBe(200);
    expect((await fresh.call("GET", "/api/judge/matches", { cookie: c })).status).toBe(401);
    expect(await fresh.login("judge3", "new-password")).toMatch(/^tennis_session_test=/);
    await fresh.close();
  });
});
