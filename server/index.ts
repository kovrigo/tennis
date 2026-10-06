import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { type AppStatus, createApp } from "./app.ts";
import { LoginLimiter } from "./auth.ts";
import { type Db, openDb } from "./db.ts";
import { ApiError, securityHeaders, sendError, sendJson } from "./http.ts";
import { StartupError, migrate, migrationStatus } from "./migrate.ts";
import { runSeeds, seedStatus } from "./seed.ts";
import { seeds } from "./seeds/index.ts";
import { serveStatic } from "./static.ts";

// Startup: open data/tennis.sqlite → copy it and apply new migrations → run new seeds
// → accept requests. A failure does not stop the server: /api/health answers 503 with
// "<step>: <text>", and after a db, backup or migration failure every other /api/*
// answers 503 not_ready.

const port = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === "production";
const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");
const dataDir = join(root, "data");
const filesDir = join(dataDir, "files");
const backupsDir = join(dataDir, "backups");
const migrationsDir = join(import.meta.dirname, "migrations");

function readCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const status: AppStatus = {
  commit: readCommit(),
  migration: { latest: null, pending: 0, drift: [] },
  seed: { latest: null, pending: 0 },
  error: null,
  fatal: false,
};

let db: Db | null = null;
try {
  for (const dir of [dataDir, filesDir, backupsDir]) mkdirSync(dir, { recursive: true });
  db = openDb(join(dataDir, "tennis.sqlite"));
} catch (e) {
  status.error = `db: ${(e as Error).message}`;
  status.fatal = true;
}
if (db) {
  try {
    status.migration = migrate(db, migrationsDir, backupsDir);
  } catch (e) {
    status.error = e instanceof StartupError ? `${e.step}: ${e.message}` : `migration: ${(e as Error).message}`;
    status.fatal = true;
    status.migration = { ...migrationStatus(db, migrationsDir), drift: [] };
  }
}
if (db && !status.fatal) {
  try {
    status.seed = runSeeds(db, seeds, { now: new Date(), filesDir });
  } catch (e) {
    status.error = e instanceof StartupError ? `${e.step}: ${e.message}` : `seed: ${(e as Error).message}`;
    status.seed = seedStatus(db, seeds);
  }
}
if (status.error) console.error(`startup failed: ${status.error}`);

const handleApi = db
  ? createApp({ db, filesDir, cookieName: `tennis_session_${port}`, status, limiter: new LoginLimiter() })
  : async (req: { url?: string }, res: import("node:http").ServerResponse) => {
      if (!req.url?.startsWith("/api/")) return false;
      securityHeaders(res);
      if (req.url.split("?")[0] === "/api/health") sendJson(res, 503, { ok: false, commit: status.commit, error: status.error });
      else sendError(res, new ApiError(503, "not_ready", "Сайт обновляется. Попробуйте позже"));
      return true;
    };

// Development: Vite serves the React app with hot reload on the same port.
const vite = production
  ? null
  : await (await import("vite")).createServer({ server: { middlewareMode: true }, appType: "spa" });

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    securityHeaders(res);
    if (vite) {
      vite.middlewares(req, res);
      return;
    }
    serveStatic(dist, req, res);
  } catch (e) {
    if (e instanceof URIError) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Bad request");
      return;
    }
    console.error(`500 ${req.method} ${req.url}:`, e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end("Server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`tennis ${production ? "production" : "dev"} server on port ${port} (node ${process.version}, commit ${status.commit ?? "unknown"})`);
});

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
process.on("SIGTERM", () => {
  server.close();
  db?.close();
  process.exit(0);
});
