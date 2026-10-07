import type { IncomingMessage, ServerResponse } from "node:http";
import { type User, LoginLimiter, readCookie, readSession, sessionCookie } from "./auth.ts";
import type { Db } from "./db.ts";
import { ApiError, fail, securityHeaders, sendError, sendJson } from "./http.ts";
import type { MigrationStatus } from "./migrate.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { judgeRoutes } from "./routes/judge.ts";
import { publicRoutes } from "./routes/public.ts";

// Request flow:
//
//   /api/* ─► route table [method, path, role, handler] ─► session ─► role check
//          ─► handler ─► 200 JSON (or the handler answers itself, e.g. a file)
//   any throw: ApiError ─► its status and {error, message, ...}
//              bad URL encoding ─► 400 bad_request, anything else ─► 500 server

export type Access = "public" | "organizer" | "judge";

export interface AppStatus {
  commit: string | null;
  migration: MigrationStatus;
  seed: { latest: string | null; pending: number };
  /** "<step>: <text>" of a startup failure. */
  error: string | null;
  /** db, backup or migration failed: every other /api/* answers 503 not_ready. */
  fatal: boolean;
}

export interface AppDeps {
  db: Db;
  filesDir: string;
  cookieName: string;
  status: AppStatus;
  limiter: LoginLimiter;
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  deps: AppDeps;
  db: Db;
  params: Record<string, string>;
  query: URLSearchParams;
  user: User | null;
}

/** Returns the JSON body for 200, or undefined when the handler already answered. */
export type Handler = (ctx: Ctx) => unknown;
export type Route = [method: string, path: string, access: Access, handler: Handler];

export const routes: Route[] = [...publicRoutes, ...authRoutes, ...judgeRoutes, ...adminRoutes];

function match(path: string, pattern: string): Record<string, string> | null {
  const a = path.split("/");
  const b = pattern.split("/");
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (b[i].startsWith(":")) {
      if (!a[i]) return null;
      params[b[i].slice(1)] = decodeURIComponent(a[i]);
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function createApp(deps: AppDeps): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (!url.pathname.startsWith("/api/")) return false;
    securityHeaders(res);
    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        const s = deps.status;
        const body = {
          ok: !s.error,
          commit: s.commit,
          migration: s.migration.drift.length ? s.migration : { latest: s.migration.latest, pending: s.migration.pending },
          seed: s.seed,
          ...(s.error ? { error: s.error } : {}),
        };
        sendJson(res, s.error ? 503 : 200, body);
        return true;
      }
      if (deps.status.fatal) throw new ApiError(503, "not_ready", "Сайт обновляется. Попробуйте позже");

      let found: { route: Route; params: Record<string, string> } | null = null;
      for (const route of routes) {
        if (route[0] !== req.method) continue;
        const params = match(url.pathname, route[1]);
        if (params) {
          found = { route, params };
          break;
        }
      }
      if (!found) throw fail.notFound();
      const [, , access, handler] = found.route;

      const token = readCookie(req.headers.cookie, deps.cookieName);
      const session = readSession(deps.db, token);
      if (session?.refreshed && token) res.setHeader("Set-Cookie", sessionCookie(deps.cookieName, token));
      const user = session?.user ?? null;
      if (access !== "public") {
        if (!user) throw fail.unauthorized();
        if (user.role !== access) throw fail.forbidden();
      }

      const body = await handler({ req, res, deps, db: deps.db, params: found.params, query: url.searchParams, user });
      if (!res.headersSent) sendJson(res, 200, body ?? { ok: true });
    } catch (e) {
      if (res.headersSent) {
        console.error(`${req.method} ${url.pathname} failed after headers:`, e);
        res.destroy();
      } else if (e instanceof ApiError) {
        if (e.status === 413) {
          // Do not read the rest of a too-large upload.
          res.setHeader("connection", "close");
          res.on("finish", () => req.destroy());
        }
        sendError(res, e);
      } else if (e instanceof URIError) {
        sendError(res, fail.badRequest("Неверный адрес"));
      } else {
        console.error(`500 ${req.method} ${url.pathname}:`, e);
        sendJson(res, 500, { error: "server", message: "Ошибка на сайте. Попробуйте ещё раз." });
      }
    }
    return true;
  };
}
