import type { LoginResponse } from "../../src/api-types.ts";
import type { Route } from "../app.ts";
import { clearedCookie, createSession, deleteSession, readCookie, sessionCookie, verifyPassword } from "../auth.ts";
import { get } from "../db.ts";
import { ApiError, readJson } from "../http.ts";
import { obj, shortName } from "../services/common.ts";

// Sign-in and sign-out. Five wrong passwords close a login for 15 minutes.
// Open to anyone, so bodies are small and password checks run a few at a time.

const SMALL = 4096;

export const authRoutes: Route[] = [
  [
    "POST",
    "/api/login",
    "public",
    async ({ req, res, db, deps }): Promise<LoginResponse> => {
      const b = obj(await readJson(req, SMALL));
      const login = typeof b.login === "string" ? b.login.trim().toLowerCase().slice(0, 64) : "";
      const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
      const locked = deps.limiter.lockedMinutes(login);
      if (locked) {
        throw new ApiError(429, "too_many_attempts", `Слишком много попыток. Попробуйте через ${locked} мин.`, { minutes: locked });
      }
      if (!deps.limiter.startCheck()) {
        throw new ApiError(429, "too_many_attempts", "Сайт занят. Попробуйте через 1 мин.", { minutes: 1 });
      }
      let ok: boolean;
      let user: { id: number; role: "organizer" | "judge"; first_name: string; last_name: string; password_hash: string } | undefined;
      try {
        // Counted before the slow hash, so parallel guesses cannot all slip past the limit.
        deps.limiter.failure(login);
        user = get(db, "SELECT id, role, first_name, last_name, password_hash FROM users WHERE login = ?", login);
        ok = (await verifyPassword(password, user?.password_hash)) && !!user;
      } finally {
        deps.limiter.endCheck();
      }
      if (!ok || !user) throw new ApiError(401, "bad_credentials", "Неверный логин или пароль");
      deps.limiter.success(login);
      res.setHeader("Set-Cookie", sessionCookie(deps.cookieName, createSession(db, user.id)));
      return { role: user.role, name: shortName(user) };
    },
  ],
  [
    "POST",
    "/api/logout",
    "public",
    async ({ req, res, db, deps }) => {
      await readJson(req, SMALL);
      deleteSession(db, readCookie(req.headers.cookie, deps.cookieName));
      res.setHeader("Set-Cookie", clearedCookie(deps.cookieName));
      return { ok: true };
    },
  ],
];
