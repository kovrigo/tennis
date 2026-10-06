import { type Db, all, get, run, tx } from "./db.ts";
import { StartupError } from "./migrate.ts";

// Sample data: server/seeds/NNN_name.ts, listed in server/seeds/index.ts.
// Each seed runs once per database: the check, the seed and its seed_runs row
// share one transaction. So a redeploy never duplicates samples, and a sample
// the organizer deleted or changed never comes back.

export interface SeedContext {
  /** First-run moment; sample dates count from its Moscow day. */
  now: Date;
  filesDir: string;
}

export interface Seed {
  name: string;
  run: (db: Db, ctx: SeedContext) => void;
}

export interface SeedStatus {
  latest: string | null;
  pending: number;
}

const ensureTable = (db: Db) => db.exec("CREATE TABLE IF NOT EXISTS seed_runs (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");

export function seedStatus(db: Db, seeds: Seed[]): SeedStatus {
  ensureTable(db);
  const done = new Set(all<{ name: string }>(db, "SELECT name FROM seed_runs").map((r) => r.name));
  return { latest: seeds.at(-1)?.name ?? null, pending: seeds.filter((s) => !done.has(s.name)).length };
}

export function runSeeds(db: Db, seeds: Seed[], ctx: SeedContext): SeedStatus {
  ensureTable(db);
  for (const seed of seeds) {
    try {
      const applied = tx(db, () => {
        if (get(db, "SELECT 1 FROM seed_runs WHERE name = ?", seed.name)) return false;
        seed.run(db, ctx);
        run(db, "INSERT INTO seed_runs (name, applied_at) VALUES (?, ?)", seed.name, new Date().toISOString());
        return true;
      });
      if (applied) console.log(`seed applied: ${seed.name}`);
    } catch (e) {
      const fields = (e as { extra?: { fields?: unknown } }).extra?.fields;
      throw new StartupError("seed", `${seed.name}: ${(e as Error).message}${fields ? ` ${JSON.stringify(fields)}` : ""}`);
    }
  }
  return seedStatus(db, seeds);
}
