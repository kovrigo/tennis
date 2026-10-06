import { copyFileSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { all, get, openDb, run } from "./db.ts";
import { StartupError, migrate, migrationStatus } from "./migrate.ts";
import { type Seed, runSeeds, seedStatus } from "./seed.ts";
import { saveRegulation, saveTournament } from "./services/tournaments.ts";
import { MIGRATIONS, PDF, addMatchSetup, tmpDir } from "./testkit.ts";

// Database updates and run-once seeds on real files.

function workspace() {
  const dir = tmpDir("migrate");
  const migrations = join(dir, "migrations");
  const backups = join(dir, "backups");
  for (const d of [migrations, backups]) mkdirSync(d);
  copyFileSync(join(MIGRATIONS, "001_init.sql"), join(migrations, "001_init.sql"));
  return { dir, migrations, backups, dbPath: join(dir, "tennis.sqlite") };
}

describe("migrations", () => {
  test("an empty database reaches the latest file; a second start applies nothing", () => {
    const w = workspace();
    const db = openDb(w.dbPath);
    expect(migrate(db, w.migrations, w.backups)).toEqual({ latest: "001_init", pending: 0, drift: [] });
    expect(all(db, "SELECT name FROM schema_migrations")).toEqual([{ name: "001_init" }]);
    expect(migrate(db, w.migrations, w.backups).latest).toBe("001_init");
    expect(readdirSync(w.backups)).toEqual([]); // nothing to copy before the first file
  });

  test("a failing file rolls back and is reported; the fixed file applies after a copy of the database", () => {
    const w = workspace();
    const db = openDb(w.dbPath);
    migrate(db, w.migrations, w.backups);
    writeFileSync(join(w.migrations, "002_news_author.sql"), "ALTER TABLE news ADD COLUMN author TEXT NOT NULL DEFAULT '';\nTHIS IS NOT SQL;");
    let err: unknown;
    try {
      migrate(db, w.migrations, w.backups);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StartupError);
    expect((err as StartupError).step).toBe("migration");
    expect((err as StartupError).message).toMatch(/^002_news_author: /);
    expect(all(db, "PRAGMA table_info(news)").some((c) => (c as { name: string }).name === "author")).toBe(false);
    expect(migrationStatus(db, w.migrations)).toMatchObject({ latest: "002_news_author", pending: 1 });

    writeFileSync(join(w.migrations, "002_news_author.sql"), "ALTER TABLE news ADD COLUMN author TEXT NOT NULL DEFAULT '';");
    migrate(db, w.migrations, w.backups);
    expect(all(db, "PRAGMA table_info(news)").some((c) => (c as { name: string }).name === "author")).toBe(true);
    const copies = readdirSync(w.backups);
    expect(copies.some((f) => /^before-002_news_author-.+\.sqlite$/.test(f))).toBe(true);
    expect(copies.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  test("the copy keeps a fresh temp file of another starting process and removes an old one", () => {
    const w = workspace();
    const db = openDb(w.dbPath);
    migrate(db, w.migrations, w.backups);
    writeFileSync(join(w.backups, "fresh.sqlite.tmp"), "");
    writeFileSync(join(w.backups, "old.sqlite.tmp"), "");
    const hourAgo = new Date(Date.now() - 3600_000);
    utimesSync(join(w.backups, "old.sqlite.tmp"), hourAgo, hourAgo);
    writeFileSync(join(w.migrations, "002_x.sql"), "CREATE TABLE x (id INTEGER PRIMARY KEY);");
    migrate(db, w.migrations, w.backups);
    const left = readdirSync(w.backups);
    expect(left).toContain("fresh.sqlite.tmp");
    expect(left).not.toContain("old.sqlite.tmp");
  });

  test("a changed applied file is reported as drift; new files still apply", () => {
    const w = workspace();
    const db = openDb(w.dbPath);
    migrate(db, w.migrations, w.backups);
    writeFileSync(join(w.migrations, "001_init.sql"), `-- edited\n${readFileSync(join(MIGRATIONS, "001_init.sql"), "utf8")}`);
    writeFileSync(join(w.migrations, "002_x.sql"), "CREATE TABLE x (id INTEGER PRIMARY KEY);");
    const s = migrate(db, w.migrations, w.backups);
    expect(s.drift).toEqual(["001_init"]);
    expect(get(db, "SELECT name FROM schema_migrations WHERE name = '002_x'")).toEqual({ name: "002_x" });
  });

  test("rebuilding a table keeps rows that refer to it", () => {
    const w = workspace();
    const db = openDb(w.dbPath);
    migrate(db, w.migrations, w.backups);
    const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-02", filesDir: tmpDir("files"), table: [["Победитель", 10]] });
    run(db, "INSERT INTO placements (division_id, player_id, points_row_id) VALUES (?, ?, ?)", s.divisionId, s.a, s.division.rows[0].id);
    // The SQLite way to change a column: new table, copy, drop, rename. Divisions cascade from tournaments.
    writeFileSync(
      join(w.migrations, "002_rebuild_tournaments.sql"),
      `CREATE TABLE tournaments_new (
         id INTEGER PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
         city TEXT NOT NULL, venue TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK (kind IN ('rtt', 'amateur')),
         category TEXT NOT NULL DEFAULT '', regulation_file_id TEXT REFERENCES files (id), created_at TEXT NOT NULL,
         note TEXT NOT NULL DEFAULT '');
       INSERT INTO tournaments_new (id, name, start_date, end_date, city, venue, kind, category, regulation_file_id, created_at)
         SELECT id, name, start_date, end_date, city, venue, kind, category, regulation_file_id, created_at FROM tournaments;
       DROP TABLE tournaments;
       ALTER TABLE tournaments_new RENAME TO tournaments;`,
    );
    migrate(db, w.migrations, w.backups);
    expect(get(db, "SELECT COUNT(*) AS n FROM divisions")).toEqual({ n: 1 });
    expect(get(db, "SELECT COUNT(*) AS n FROM matches")).toEqual({ n: 1 });
    expect(get(db, "SELECT COUNT(*) AS n FROM placements")).toEqual({ n: 1 });
    expect(get(db, "PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
  });
});

describe("seeds", () => {
  const sample: Seed = {
    name: "001_test",
    run: (db) => {
      run(db, "INSERT INTO news (title, date, body, created_at) VALUES ('Образец', '2026-10-06', 'Текст', 'x')");
    },
  };

  test("a seed runs once; a deleted sample does not come back", () => {
    const w = workspace();
    const db = openDb(w.dbPath);
    migrate(db, w.migrations, w.backups);
    expect(runSeeds(db, [sample], { now: new Date(), filesDir: w.dir })).toEqual({ latest: "001_test", pending: 0 });
    run(db, "DELETE FROM news");
    runSeeds(db, [sample], { now: new Date(), filesDir: w.dir });
    expect(get(db, "SELECT COUNT(*) AS n FROM news")).toEqual({ n: 0 });
  });

  test("a failing seed rolls back, leaves no files and is reported with its name", () => {
    const w = workspace();
    const files = tmpDir("files");
    const db = openDb(w.dbPath);
    migrate(db, w.migrations, w.backups);
    const broken: Seed = {
      name: "002_broken",
      run: (d, ctx) => {
        run(d, "INSERT INTO news (title, date, body, created_at) VALUES ('x', '2026-10-06', 'y', 'z')");
        const t = saveTournament(d, { name: "Образец", startDate: "2026-10-06", endDate: "2026-10-06", city: "Тосно", venue: "", kind: "amateur", category: "" });
        saveRegulation(d, ctx.filesDir, t, "Положение.pdf", PDF);
        throw new Error("boom");
      },
    };
    expect(() => runSeeds(db, [sample, broken], { now: new Date(), filesDir: files })).toThrow(/^002_broken: boom$/);
    expect(get(db, "SELECT COUNT(*) AS n FROM news")).toEqual({ n: 1 });
    expect(get(db, "SELECT COUNT(*) AS n FROM files")).toEqual({ n: 0 });
    expect(readdirSync(files)).toEqual([]);
    expect(seedStatus(db, [sample, broken])).toEqual({ latest: "002_broken", pending: 1 });
  });
});
