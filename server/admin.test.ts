import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { get, run } from "./db.ts";
import { ApiError } from "./http.ts";
import { saveDivision } from "./services/divisions.ts";
import { applyAction, deleteMatch, saveMatch } from "./services/matches.ts";
import { contacts, deleteNews, judgePassword, newsRows, saveContacts, saveJudge, saveNews } from "./services/people.ts";
import { createPlayer, deletePlayer, savePlayer } from "./services/players.ts";
import { deleteTournament, saveTournament } from "./services/tournaments.ts";
import { type TestApp, PDF, action, addJudge, addMatchSetup, addOrganizer, memoryDb, startApp, tmpDir } from "./testkit.ts";
import { newsPage } from "./views/public.ts";

// Organizer screens: S3.2, S6.2–S6.4, S6.7, S7.3, S8.1, the organizer flow S6.1 over HTTP.

const files = tmpDir("admin");

function refused(f: () => unknown): ApiError {
  try {
    f();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("not refused");
}

const count = (db: ReturnType<typeof memoryDb>, table: string) => get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`)!.n;

describe("a repeated save after a lost answer makes no second record", () => {
  test("tournament, player, judge, news, match with a new player", () => {
    const db = memoryDb();
    const t = { name: "Кубок", startDate: "2026-10-01", endDate: "2026-10-03", city: "Тосно", venue: "", kind: "amateur", category: "" };
    const tid = randomUUID();
    expect(saveTournament(db, { ...t, requestId: tid })).toBe(saveTournament(db, { ...t, requestId: tid }));
    const p = { firstName: "Иван", lastName: "Петров", city: "Луга", requestId: randomUUID() };
    expect(savePlayer(db, p).id).toBe(savePlayer(db, p).id);
    const j = { firstName: "Олег", lastName: "Кузнецов", login: "judge2", requestId: randomUUID() };
    expect(saveJudge(db, j, "hash").id).toBe(saveJudge(db, j, "hash").id);
    const n = { title: "Итоги", date: "2026-10-03", body: "Текст", requestId: randomUUID() };
    expect(saveNews(db, n).id).toBe(saveNews(db, n).id);

    const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-01" });
    const m = { divisionId: s.divisionId, round: "Финал", day: "2026-10-02", time: null, court: "", playerA: s.a, playerB: 0, newB: { firstName: "Лев", lastName: "Гусев", city: "Кириши" }, judgeId: null, requestId: randomUUID() };
    expect(saveMatch(db, m).id).toBe(saveMatch(db, m).id);
    expect([count(db, "tournaments"), count(db, "players"), count(db, "users"), count(db, "news"), count(db, "matches")]).toEqual([2, 4, 1, 1, 2]);
  });

  test("a requestId used for another kind of record is refused", () => {
    const db = memoryDb();
    const requestId = randomUUID();
    saveNews(db, { title: "Итоги", date: "2026-10-03", body: "Текст", requestId });
    expect(refused(() => saveTournament(db, { name: "Кубок", startDate: "2026-10-01", endDate: "2026-10-01", city: "Тосно", kind: "rtt", requestId })).code).toBe("bad_request");
  });
});

describe("players", () => {
  test("a namesake from the same city is a warning, case and ё ignored; confirmed, both stay", () => {
    const db = memoryDb();
    createPlayer(db, { firstName: "Артём", lastName: "Морозов", city: "Всеволожск" });
    const e = refused(() => savePlayer(db, { firstName: "артем", lastName: "МОРОЗОВ", city: " всеволожск " }));
    expect(e.status).toBe(409);
    expect(e.code).toBe("duplicate");
    expect(e.message).toBe("Такой игрок уже есть: Морозов Артём, Всеволожск, матчей: 0");
    savePlayer(db, { firstName: "Артём", lastName: "Морозов", city: "Всеволожск", confirmDuplicate: true });
    expect(count(db, "players")).toBe(2);
    // Another city is no namesake.
    savePlayer(db, { firstName: "Артём", lastName: "Морозов", city: "Гатчина" });
  });

  test("a new player in the match form gets the same warning, with the side", () => {
    const db = memoryDb();
    const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-01" });
    const e = refused(() =>
      saveMatch(db, { divisionId: s.divisionId, round: "Финал", day: "2026-10-02", time: null, court: "", playerA: s.a, playerB: 0, newB: { firstName: "Денис", lastName: "Кравцов", city: "Гатчина" }, judgeId: null }),
    );
    expect([e.code, e.extra?.side]).toEqual(["duplicate", "b"]);
    expect(count(db, "players")).toBe(2);
  });

  test("required fields have Russian messages", () => {
    const e = refused(() => savePlayer(memoryDb(), { firstName: "", lastName: "Петров" }));
    expect(e.extra?.fields).toEqual({ firstName: "Укажите имя", city: "Укажите город" });
  });
});

describe("matches and tournament dates", () => {
  test("a match needs a round, a day inside the tournament and two different players", () => {
    const db = memoryDb();
    const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-01" });
    const m = { divisionId: s.divisionId, round: "Финал", day: "2026-10-02", time: null, court: "", playerA: s.a, playerB: s.b, judgeId: null };
    expect(refused(() => saveMatch(db, { ...m, day: "2026-09-30" })).extra?.fields).toEqual({ day: "День должен быть в датах турнира" });
    expect(refused(() => saveMatch(db, { ...m, day: "2026-10-04" })).extra?.fields).toEqual({ day: "День должен быть в датах турнира" });
    expect(refused(() => saveMatch(db, { ...m, playerB: s.a })).extra?.fields).toEqual({ playerB: "Выберите двух разных игроков" });
    expect(refused(() => saveMatch(db, { ...m, round: " " })).extra?.fields).toEqual({ round: "Укажите круг" });
    expect(count(db, "matches")).toBe(1);
  });

  test("a partial or junk body does not clear the table, the group or the judge", () => {
    const db = memoryDb();
    const judge = addJudge(db);
    const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-02", judgeId: judge, filesDir: files, table: [["Победитель", 10]] });
    expect(refused(() => saveDivision(db, { tournamentId: s.tournamentId, name: "Мужчины", groupId: s.division.groupId }, s.divisionId)).code).toBe("bad_request");
    const rows = s.division.rows.map((r) => ({ id: r.id, name: r.name, points: r.points }));
    expect(refused(() => saveDivision(db, { tournamentId: s.tournamentId, name: "Мужчины", groupId: "abc", rows }, s.divisionId)).extra?.fields).toEqual({
      groupId: "Выберите рейтинговую группу",
    });
    const m = { divisionId: s.divisionId, round: "Финал", day: "2026-10-02", time: null, court: "", playerA: s.a, playerB: s.b };
    expect(refused(() => saveMatch(db, { ...m, judgeId: 1.5 }, s.matchId)).extra?.fields).toEqual({ judgeId: "Выберите судью" });
    expect(count(db, "points_rows")).toBe(1);
    expect(get(db, "SELECT judge_id FROM matches WHERE id = ?", s.matchId)).toEqual({ judge_id: judge });
  });

  test("new tournament dates must still cover its matches", () => {
    const db = memoryDb();
    const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-02" });
    const t = { name: "Турнир", startDate: "2026-10-01", endDate: "2026-10-01", city: "Тосно", venue: "", kind: "amateur", category: "" };
    expect(refused(() => saveTournament(db, t, s.tournamentId)).extra?.fields).toEqual({ endDate: "Есть матчи вне этих дат. Сначала перенесите их" });
    saveTournament(db, { ...t, endDate: "2026-10-02" }, s.tournamentId);
  });

  test("a tournament lasts at most 400 days, so its page shows every day", () => {
    const db = memoryDb();
    const t = { name: "Турнир", startDate: "2026-10-01", endDate: "2027-11-04", city: "Тосно", venue: "", kind: "amateur", category: "" };
    expect(saveTournament(db, t)).toBeGreaterThan(0);
    expect(refused(() => saveTournament(db, { ...t, endDate: "2027-11-05" })).extra?.fields).toEqual({ endDate: "Турнир не длиннее 400 дней" });
  });
});

describe("delete rules", () => {
  test("a tournament or player with matches stays; a match with points stays; the rest go", () => {
    const db = memoryDb();
    const judge = addJudge(db);
    const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-01", judgeId: judge, filesDir: files, table: [["Победитель", 10]] });
    expect(refused(() => deleteTournament(db, files, s.tournamentId)).message).toBe("Турнир с матчами удалить нельзя");
    // The schema refuses too: a slip past the check cannot wipe matches.
    expect(() => run(db, "DELETE FROM tournaments WHERE id = ?", s.tournamentId)).toThrow(/FOREIGN KEY/);
    expect(refused(() => deletePlayer(db, s.a)).message).toBe("Игрока с матчами удалить нельзя");
    applyAction(db, s.matchId, judge, action("point", 0, "a"), new Date("2026-10-01T08:00:00Z"));
    const e = refused(() => deleteMatch(db, s.matchId));
    expect([e.status, e.code, e.message]).toEqual([409, "in_use", "Матч с очками удалить нельзя"]);

    applyAction(db, s.matchId, judge, action("undo", 1), new Date("2026-10-01T08:01:00Z"));
    deleteMatch(db, s.matchId);
    deletePlayer(db, s.a);
    deleteTournament(db, files, s.tournamentId);
    expect([count(db, "tournaments"), count(db, "divisions"), count(db, "points_rows"), count(db, "files")]).toEqual([0, 0, 0, 0]);
  });

  test("news is deleted at once", () => {
    const db = memoryDb();
    const n = saveNews(db, { title: "Итоги", date: "2026-10-03", body: "Текст" });
    deleteNews(db, n.id);
    expect(newsRows(db)).toEqual([]);
  });
});

describe("judges, news, contacts", () => {
  test("a login is unique, case-insensitive; a password is required for a new judge and has 8 characters or more", () => {
    const db = memoryDb();
    addJudge(db, "judge1");
    const e = refused(() => saveJudge(db, { firstName: "Олег", lastName: "Кузнецов", login: "Judge1" }, "hash"));
    expect([e.status, e.code, e.extra?.fields]).toEqual([409, "login_taken", { login: "Такой логин уже есть" }]);
    expect(refused(() => saveJudge(db, { firstName: "Олег", lastName: "Кузнецов", login: "ab" }, "hash")).extra?.fields).toHaveProperty("login");
    expect(refused(() => judgePassword({ password: "" }, true)).extra?.fields).toEqual({ password: "Укажите пароль" });
    expect(refused(() => judgePassword({ password: "1234567" }, true)).extra?.fields).toEqual({ password: "Пароль — не короче 8 знаков" });
    expect(refused(() => judgePassword({ password: "1234567" }, false)).extra?.fields).toEqual({ password: "Пароль — не короче 8 знаков" });
    expect(judgePassword({ password: "" }, false)).toBeNull();
    expect(judgePassword({ password: "12345678" }, true)).toBe("12345678");
  });

  test("news by date, newest first; same date, later first; empty date is today", () => {
    const db = memoryDb();
    const a = saveNews(db, { title: "Старая", date: "2026-09-01", body: "Текст" });
    const b = saveNews(db, { title: "Новая", date: "2026-10-01", body: "Текст" });
    const c = saveNews(db, { title: "Тоже новая", date: "2026-10-01", body: "Текст\n\nвторой абзац" });
    expect(newsRows(db).map((n) => n.id)).toEqual([c.id, b.id, a.id]);
    expect(newsPage(db).map((n) => n.id)).toEqual([c.id, b.id, a.id]);
    expect(c.body).toBe("Текст\n\nвторой абзац");
    expect(saveNews(db, { title: "Сегодня", date: "", body: "Текст" }).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("contacts are saved; a wrong email is refused", () => {
    const db = memoryDb();
    expect(saveContacts(db, { address: "Тосно, ул. Ленина, 1", phone: "+7 812 000-00-00", email: "info@example.org" })).toEqual({
      address: "Тосно, ул. Ленина, 1",
      phone: "+7 812 000-00-00",
      email: "info@example.org",
    });
    expect(refused(() => saveContacts(db, { address: "", phone: "", email: "не почта" })).extra?.fields).toEqual({ email: "Проверьте адрес почты" });
    expect(contacts(db).email).toBe("info@example.org");
  });
});

describe("organizer flow over HTTP", () => {
  let app: TestApp;
  let org: string;
  beforeAll(async () => {
    const db = memoryDb();
    addOrganizer(db);
    app = await startApp(db);
    org = await app.login("organizer", "tennis-org");
  });
  afterAll(() => app.close());

  const post = async (path: string, body: unknown, method = "POST") => {
    const r = await app.call(method, path, { cookie: org, body });
    if (r.status !== 200) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  test("tournament, regulation, division with a table, 8 players, 7 matches, places, news: all on the public site", async () => {
    const t = await post("/api/admin/tournaments", { name: "Кубок Тосно", startDate: "2026-09-10", endDate: "2026-09-12", city: "Тосно", venue: "Теннисный центр", kind: "amateur", category: "Мастерс 200" });
    const up = await app.call("PUT", `/api/admin/tournaments/${t.id}/regulation?name=${encodeURIComponent("Положение.pdf")}`, {
      cookie: org,
      body: PDF,
      headers: { "content-type": "application/octet-stream" },
    });
    expect(up.status).toBe(200);
    const g = await post("/api/admin/groups", { name: "Мужчины" });
    const d = await post("/api/admin/divisions", { tournamentId: t.id, name: "Мужчины", groupId: g.id, rows: [{ name: "Победитель", points: 100 }, { name: "Финалист", points: 70 }, { name: "Полуфинал", points: 40 }] });
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) ids.push((await post("/api/admin/players", { firstName: `Игрок${i}`, lastName: `Фамилия${i}`, city: "Тосно" })).id);
    const match = (round: string, day: string, a: number, b: number) => post("/api/admin/matches", { divisionId: d.id, round, day, time: "10:00", court: "Корт 1", playerA: a, playerB: b, judgeId: null });
    for (let i = 0; i < 8; i += 2) await match("1/4 финала", "2026-09-10", ids[i], ids[i + 1]);
    await match("1/2 финала", "2026-09-11", ids[0], ids[2]);
    await match("1/2 финала", "2026-09-11", ids[4], ids[6]);
    const final = await match("Финал", "2026-09-12", ids[0], ids[4]);
    await post(`/api/admin/matches/${final.id}/result`, { winner: "a", sets: [[6, 4], [6, 3]], note: "" }, "PUT");
    const [win, fin, semi] = d.rows.map((r: { id: number }) => r.id);
    await post(`/api/admin/divisions/${d.id}/placements`, [
      { playerId: ids[0], pointsRowId: win },
      { playerId: ids[4], pointsRowId: fin },
      { playerId: ids[2], pointsRowId: semi },
      { playerId: ids[6], pointsRowId: semi },
    ], "PUT");
    await post("/api/admin/news", { title: "Итоги Кубка Тосно", date: "2026-09-12", body: "Победил Фамилия0 Игрок0." });

    const admin = await post(`/api/admin/tournaments/${t.id}`, undefined, "GET");
    expect([admin.matchCount, admin.hasPointsTables, admin.divisions[0].placementsCount]).toEqual([7, true, 4]);
    const page = await (await app.call("GET", `/api/tournaments/${t.id}`)).json();
    expect(page.matches).toHaveLength(7);
    expect(page.tournament.regulation.name).toBe("Положение.pdf");
    const rating = await (await app.call("GET", `/api/rating?group=${g.id}`)).json();
    expect(rating.rows.map((r: { place: number; points: number }) => [r.place, r.points])).toEqual([[1, 100], [2, 70], [3, 40], [3, 40]]);
    const protocol = await (await app.call("GET", `/api/matches/${final.id}`)).json();
    expect(protocol).toMatchObject({ manual: true, winner: "a", setsText: "6:4, 6:3" });
    const news = await (await app.call("GET", "/api/news")).json();
    expect(news[0].title).toBe("Итоги Кубка Тосно");
  });
});
