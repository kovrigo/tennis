import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Side } from "../../src/api-types.ts";
import { hashPasswordSync } from "../auth.ts";
import { type Db, run } from "../db.ts";
import type { SeedContext } from "../seed.ts";
import { saveDivision, saveGroup, savePlacements } from "../services/divisions.ts";
import { applyAction, saveMatch, setManualResult } from "../services/matches.ts";
import { saveContacts, saveJudge, saveNews } from "../services/people.ts";
import { createPlayer } from "../services/players.ts";
import { saveRegulation, saveTournament } from "../services/tournaments.ts";
import { addDays, moscowDay } from "../time.ts";
import { pointsFor } from "./points.ts";

// Samples the scope asks for, dated from the Moscow day of the first run:
//   running RTT tournament without a points table (yesterday – tomorrow), with matches
//     today: one running, one finished, one manual result («отказ»), the rest not started;
//   upcoming amateur tournament (in 14–16 days) with a points table and a schedule;
//   finished amateur tournament (21–19 days ago): men and boys with tables, places and
//     points, women without a table with places as text; one match 7:6, 6:7, 7:6;
//   two rating groups, 18 players, three news, sample contacts;
//   accounts organizer / tennis-org, judge1 / tennis-judge1, judge2 / tennis-judge2;
//   the sample regulation PDF, a copy for each tournament.
// Everything goes through the same save functions as the forms and the judge's action,
// so no sample holds an impossible score.

const REGULATION = join(import.meta.dirname, "files", "sample-regulation.pdf");
const REGULATION_NAME = "Образец положения.pdf";

export function run001(db: Db, ctx: SeedContext): void {
  const today = moscowDay(ctx.now);
  const regulation = readFileSync(REGULATION);

  // ---------- accounts ----------
  run(
    db,
    "INSERT INTO users (role, first_name, last_name, login, password_hash, created_at) VALUES ('organizer', ?, ?, ?, ?, ?)",
    "Анна",
    "Смирнова",
    "organizer",
    hashPasswordSync("tennis-org"),
    ctx.now.toISOString(),
  );
  const judge1 = saveJudge(db, { firstName: "Пётр", lastName: "Иванов", login: "judge1" }, hashPasswordSync("tennis-judge1")).id;
  const judge2 = saveJudge(db, { firstName: "Олег", lastName: "Кузнецов", login: "judge2" }, hashPasswordSync("tennis-judge2")).id;

  // ---------- groups, players ----------
  const men = saveGroup(db, { name: "Мужчины" }).id;
  const boys = saveGroup(db, { name: "Юноши до 15 лет" }).id;

  const p = (lastName: string, firstName: string, city: string) => createPlayer(db, { firstName, lastName, city });
  const morozov = p("Морозов", "Артём", "Всеволожск");
  const kravtsov = p("Кравцов", "Денис", "Гатчина");
  const safonov = p("Сафонов", "Илья", "Выборг");
  const loginov = p("Логинов", "Максим", "Кириши");
  const zhukov = p("Жуков", "Павел", "Тосно");
  const nikitin = p("Никитин", "Роман", "Сосновый Бор");
  const belov = p("Белов", "Кирилл", "Луга");
  const orlov = p("Орлов", "Георгий", "Тихвин");
  const titov = p("Титов", "Матвей", "Всеволожск");
  const ershov = p("Ершов", "Тимофей", "Гатчина");
  const zakharov = p("Захаров", "Лев", "Кировск");
  const medvedev = p("Медведев", "Глеб", "Приозерск");
  const sokolov = p("Соколов", "Арсений", "Волхов");
  const fomin = p("Фомин", "Даниил", "Кингисепп");
  const belousova = p("Белоусова", "Надежда", "Гатчина");
  const sergeeva = p("Сергеева", "Полина", "Выборг");
  const zhukova = p("Жукова", "Анна", "Тосно");
  const titova = p("Титова", "Ксения", "Кириши");

  const tournament = (body: Record<string, string>) => {
    const id = saveTournament(db, body);
    saveRegulation(db, ctx.filesDir, id, REGULATION_NAME, regulation);
    return id;
  };
  const division = (tournamentId: number, name: string, groupId: number | null, rows: [string, number][]) =>
    saveDivision(db, { tournamentId, name, groupId, rows: rows.map(([n, points]) => ({ name: n, points })) });

  interface MatchSpec {
    division: number;
    round: string;
    day: string;
    time: string | null;
    court: string;
    a: number;
    b: number;
    judge: number | null;
  }
  const match = (m: MatchSpec) =>
    saveMatch(db, { divisionId: m.division, round: m.round, day: m.day, time: m.time, court: m.court, playerA: m.a, playerB: m.b, judgeId: m.judge }).id;

  // Points 30–90 s apart, deterministic. `start` is the moment of the first point.
  let tick = 7;
  const gaps = (n: number) =>
    Array.from({ length: n }, () => {
      tick = (tick * 1103515245 + 12345) % 2147483648;
      return 30 + (tick % 61);
    });
  const score = (matchId: number, judgeId: number, points: Side[], start: Date) => {
    const g = gaps(points.length);
    let at = start.getTime();
    points.forEach((side, i) => {
      applyAction(db, matchId, judgeId, { requestId: randomUUID(), type: "point", side, expectedSeq: i }, new Date(at));
      at += g[i] * 1000;
    });
  };
  /** Scores a match so that its last point falls `before` ms before now (never in the future). */
  const scoreEndingBefore = (matchId: number, judgeId: number, points: Side[], beforeMs: number) => {
    const saved = tick;
    const total = gaps(points.length).reduce((s, x) => s + x, 0) * 1000;
    tick = saved;
    score(matchId, judgeId, points, new Date(ctx.now.getTime() - beforeMs - total));
  };
  const at = (day: string, time: string) => new Date(`${day}T${time}:00+03:00`);

  // ---------- finished tournament ----------
  const f0 = addDays(today, -21);
  const f1 = addDays(today, -20);
  const f2 = addDays(today, -19);
  const cup = tournament({
    name: "Кубок Ленинградской области",
    startDate: f0,
    endDate: f2,
    city: "Тосно",
    venue: "Теннисная академия",
    kind: "amateur",
    category: "Мастерс 200",
  });
  const cupMen = division(cup, "Мужчины, одиночный", men, [
    ["Победитель", 100],
    ["Финалист", 70],
    ["Полуфинал", 40],
    ["Четвертьфинал", 20],
  ]);
  const cupBoys = division(cup, "Юноши до 15 лет, одиночный", boys, [
    ["Победитель", 60],
    ["Финалист", 40],
    ["Полуфинал", 25],
  ]);
  const cupWomen = division(cup, "Женщины, одиночный", null, []);

  const played: [MatchSpec, string][] = [
    [{ division: cupMen.id, round: "1/4 финала", day: f0, time: "10:00", court: "Корт 1", a: morozov, b: orlov, judge: judge1 }, "6:1, 6:2"],
    [{ division: cupMen.id, round: "1/4 финала", day: f0, time: "10:00", court: "Корт 2", a: safonov, b: belov, judge: judge2 }, "6:4, 7:5"],
    [{ division: cupMen.id, round: "1/4 финала", day: f0, time: "12:30", court: "Корт 1", a: kravtsov, b: nikitin, judge: judge1 }, "6:3, 3:6, 6:4"],
    [{ division: cupMen.id, round: "1/4 финала", day: f0, time: "12:30", court: "Корт 2", a: loginov, b: zhukov, judge: judge2 }, "7:6(4), 6:4"],
    [{ division: cupMen.id, round: "1/2 финала", day: f1, time: "11:00", court: "Корт 1", a: morozov, b: safonov, judge: judge1 }, "7:6(5), 6:7(4), 7:6(3)"],
    [{ division: cupMen.id, round: "1/2 финала", day: f1, time: "11:00", court: "Корт 2", a: kravtsov, b: loginov, judge: judge2 }, "6:2, 6:3"],
    [{ division: cupMen.id, round: "Финал", day: f2, time: "12:00", court: "Центральный", a: morozov, b: kravtsov, judge: judge1 }, "6:4, 7:5"],
    [{ division: cupBoys.id, round: "1/2 финала", day: f0, time: "15:00", court: "Корт 3", a: titov, b: ershov, judge: judge2 }, "6:4, 6:4"],
    [{ division: cupBoys.id, round: "Финал", day: f1, time: "15:00", court: "Корт 3", a: titov, b: zakharov, judge: judge2 }, "6:3, 6:4"],
  ];
  for (const [spec, result] of played) score(match(spec), spec.judge!, pointsFor(result), at(spec.day, spec.time!));

  const boysSemi = match({ division: cupBoys.id, round: "1/2 финала", day: f0, time: "15:00", court: "Корт 4", a: zakharov, b: medvedev, judge: null });
  setManualResult(db, boysSemi, { winner: "a", sets: [[4, 6], [6, 3], [6, 2]], note: "" });
  const womenFinal = match({ division: cupWomen.id, round: "Финал", day: f2, time: "10:00", court: "Корт 2", a: belousova, b: sergeeva, judge: null });
  setManualResult(db, womenFinal, { winner: "a", sets: [[6, 4], [6, 4]], note: "" });

  const row = (d: typeof cupMen, name: string) => d.rows.find((r) => r.name === name)!.id;
  savePlacements(db, cupMen.id, [
    { playerId: morozov, pointsRowId: row(cupMen, "Победитель") },
    { playerId: kravtsov, pointsRowId: row(cupMen, "Финалист") },
    { playerId: safonov, pointsRowId: row(cupMen, "Полуфинал") },
    { playerId: loginov, pointsRowId: row(cupMen, "Полуфинал") },
    ...[orlov, belov, nikitin, zhukov].map((playerId) => ({ playerId, pointsRowId: row(cupMen, "Четвертьфинал") })),
  ]);
  savePlacements(db, cupBoys.id, [
    { playerId: titov, pointsRowId: row(cupBoys, "Победитель") },
    { playerId: zakharov, pointsRowId: row(cupBoys, "Финалист") },
    { playerId: ershov, pointsRowId: row(cupBoys, "Полуфинал") },
    { playerId: medvedev, pointsRowId: row(cupBoys, "Полуфинал") },
  ]);
  savePlacements(db, cupWomen.id, [
    { playerId: belousova, placeText: "1 место" },
    { playerId: sergeeva, placeText: "2 место" },
  ]);

  // ---------- running tournament (RTT, no points table) ----------
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const open = tournament({
    name: "Первенство области до 15 лет",
    startDate: yesterday,
    endDate: tomorrow,
    city: "Выборг",
    venue: "СК «Фаворит»",
    kind: "rtt",
    category: "РТТ, 2 категория, до 15 лет",
  });
  const openBoys = division(open, "Юноши до 15 лет, одиночный", null, []).id;
  const openGirls = division(open, "Девушки до 15 лет, одиночный", null, []).id;

  for (const [spec, result] of [
    [{ division: openBoys, round: "1/4 финала", day: yesterday, time: "10:00", court: "Корт 1", a: titov, b: fomin, judge: judge1 }, "6:2, 6:4"],
    [{ division: openBoys, round: "1/4 финала", day: yesterday, time: "10:00", court: "Корт 2", a: zakharov, b: sokolov, judge: judge2 }, "7:5, 6:3"],
  ] as [MatchSpec, string][]) {
    score(match(spec), spec.judge!, pointsFor(result), at(spec.day, spec.time!));
  }

  const running = match({ division: openBoys, round: "1/2 финала", day: today, time: "10:00", court: "Корт 1", a: titov, b: zakharov, judge: judge1 });
  scoreEndingBefore(running, judge1, pointsFor("6:4", { games: [2, 1], game: [2, 1] }), 60_000);
  const doneToday = match({ division: openBoys, round: "1/2 финала", day: today, time: "10:00", court: "Корт 2", a: ershov, b: medvedev, judge: judge2 });
  scoreEndingBefore(doneToday, judge2, pointsFor("6:3, 6:2"), 20 * 60_000);
  const walkover = match({ division: openGirls, round: "1/2 финала", day: today, time: "09:00", court: "Корт 3", a: belousova, b: sergeeva, judge: null });
  setManualResult(db, walkover, { winner: "b", sets: [], note: "отказ" });
  match({ division: openGirls, round: "1/2 финала", day: today, time: "11:30", court: "Корт 3", a: zhukova, b: titova, judge: judge2 });
  match({ division: openBoys, round: "Утешительный круг", day: today, time: "12:00", court: "Корт 10", a: sokolov, b: fomin, judge: judge1 });
  match({ division: openBoys, round: "Финал", day: tomorrow, time: "12:00", court: "Корт 1", a: ershov, b: titov, judge: judge1 });
  match({ division: openGirls, round: "Утешительный круг", day: tomorrow, time: null, court: "", a: belousova, b: zhukova, judge: null });

  // ---------- upcoming tournament ----------
  const u0 = addDays(today, 14);
  const autumn = tournament({
    name: "Осенний кубок Гатчины",
    startDate: u0,
    endDate: addDays(today, 16),
    city: "Гатчина",
    venue: "ТЦ «Олимп»",
    kind: "amateur",
    category: "Тур 100",
  });
  const autumnMen = division(autumn, "Мужчины, одиночный", men, [
    ["Победитель", 50],
    ["Финалист", 35],
    ["Полуфинал", 20],
    ["Четвертьфинал", 10],
  ]).id;
  [
    [morozov, zhukov],
    [kravtsov, belov],
    [safonov, nikitin],
    [loginov, orlov],
  ].forEach(([a, b], i) => match({ division: autumnMen, round: "1/4 финала", day: u0, time: "10:00", court: `Корт ${i + 1}`, a, b, judge: null }));

  // ---------- news, contacts ----------
  saveNews(db, {
    title: "Морозов выиграл Кубок Ленинградской области",
    date: addDays(today, -18),
    body: "В финале Кубка Ленинградской области Артём Морозов обыграл Дениса Кравцова со счётом 6:4, 7:5.\n\nПолуфинал Морозова с Ильёй Сафоновым продолжался три сета, и каждый закончился тай-брейком. Протоколы всех матчей открыты на странице турнира.\n\nЭто образец новости тестового сайта.",
  });
  saveNews(db, {
    title: "Открыта запись на Осенний кубок Гатчины",
    date: addDays(today, -10),
    body: "Турнир пройдёт в ТЦ «Олимп». Расписание первого круга уже на странице турнира.\n\nЭто образец новости тестового сайта.",
  });
  saveNews(db, {
    title: "Первенство области до 15 лет: начался основной турнир",
    date: yesterday,
    body: "В Выборге начались матчи первенства области среди юношей и девушек до 15 лет. Счёт идущих матчей — в разделе «Онлайн-счёт».\n\nЭто образец новости тестового сайта.",
  });
  saveContacts(db, { address: "Ленинградская обл., г. Тосно, ул. Образцовая, 1 (образец)", phone: "+7 (800) 000-00-00", email: "info@example.org" });
}
