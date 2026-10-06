import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { type Db, all, get, run } from "./db.ts";

// Database updates: server/migrations/NNN_name.sql, applied at startup in name order.
//
//   copy the database (once, before the first new file)
//   for each new file:  foreign_keys OFF ─► BEGIN IMMEDIATE ─► file ─► foreign_key_check
//                       ─► schema_migrations row ─► COMMIT ─► foreign_keys ON
//
// foreign_keys must go OFF outside the transaction: inside it the pragma is a
// silent no-op, and a table rebuild would cascade-delete child rows.

export class StartupError extends Error {
  readonly step: "db" | "backup" | "migration" | "seed";

  constructor(step: StartupError["step"], message: string) {
    super(message);
    this.step = step;
  }
}

export interface MigrationStatus {
  latest: string | null;
  pending: number;
  drift: string[];
}

const checksum = (sql: string) => createHash("sha256").update(sql).digest("hex");

export function migrationFiles(dir: string): { name: string; sql: string }[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((f) => ({ name: f.replace(/\.sql$/, ""), sql: readFileSync(join(dir, f), "utf8") }));
}

/** Applies new files. backupsDir null (in-memory test databases) skips the copy. */
export function migrate(db: Db, dir: string, backupsDir: string | null): MigrationStatus {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const files = migrationFiles(dir);
  const applied = new Map(
    all<{ name: string; checksum: string }>(db, "SELECT name, checksum FROM schema_migrations").map((r) => [
      r.name,
      r.checksum,
    ]),
  );
  const drift = [...applied]
    .filter(([name, sum]) => {
      const file = files.find((f) => f.name === name);
      return !file || checksum(file.sql) !== sum;
    })
    .map(([name]) => name);
  for (const name of drift) console.log(`migration drift: ${name} changed or missing since it was applied`);

  const fresh = files.filter((f) => !applied.has(f.name));
  if (fresh.length && applied.size && backupsDir) backup(db, backupsDir, fresh[0].name);

  for (const file of fresh) {
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (get(db, "SELECT 1 FROM schema_migrations WHERE name = ?", file.name)) {
          db.exec("ROLLBACK");
          continue;
        }
        db.exec(file.sql);
        const broken = all(db, "PRAGMA foreign_key_check");
        if (broken.length) throw new Error(`foreign key check failed: ${JSON.stringify(broken[0])}`);
        run(db, "INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)", file.name, checksum(file.sql), new Date().toISOString());
        db.exec("COMMIT");
      } catch (e) {
        if (db.isTransaction) db.exec("ROLLBACK");
        throw new StartupError("migration", `${file.name}: ${(e as Error).message}`);
      }
      console.log(`migration applied: ${file.name}`);
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
  return { latest: files.at(-1)?.name ?? null, pending: 0, drift };
}

/** Status without applying anything: what health reports after a failure. */
export function migrationStatus(db: Db, dir: string): MigrationStatus {
  const files = migrationFiles(dir);
  let applied = new Set<string>();
  try {
    applied = new Set(all<{ name: string }>(db, "SELECT name FROM schema_migrations").map((r) => r.name));
  } catch {
    // no table yet
  }
  return { latest: files.at(-1)?.name ?? null, pending: files.filter((f) => !applied.has(f.name)).length, drift: [] };
}

function backup(db: Db, dir: string, next: string): void {
  try {
    // Leftovers of a copy cut short. A fresh one may belong to a second process starting now.
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".tmp") && statSync(join(dir, f)).mtimeMs < Date.now() - 10 * 60_000) rmSync(join(dir, f), { force: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = join(dir, `before-${next}-${stamp}.sqlite`);
    if (existsSync(target)) throw new Error(`${target} exists`);
    db.prepare("VACUUM INTO ?").run(`${target}.tmp`);
    renameSync(`${target}.tmp`, target);
    console.log(`database copied to ${target}`);
  } catch (e) {
    throw new StartupError("backup", (e as Error).message);
  }
}
