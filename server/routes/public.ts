import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { SiteInfo } from "../../src/api-types.ts";
import type { Route } from "../app.ts";
import { get } from "../db.ts";
import { fail } from "../http.ts";
import { idParam, shortName } from "../services/common.ts";
import { contacts, newsItem } from "../services/people.ts";
import { MIME, fileExists } from "../services/tournaments.ts";
import { moscowDay } from "../time.ts";
import { homePage, livePage, newsPage, playerPage, protocol, ratingPage, tournamentPage, tournamentsPage } from "../views/public.ts";

// Public pages: read only, no sign-in.

export const publicRoutes: Route[] = [
  [
    "GET",
    "/api/site",
    "public",
    ({ db, user }): SiteInfo => ({
      contacts: contacts(db),
      user: user ? { role: user.role, name: shortName({ first_name: user.firstName, last_name: user.lastName }) } : null,
      today: moscowDay(),
    }),
  ],
  ["GET", "/api/home", "public", ({ db }) => homePage(db)],
  ["GET", "/api/tournaments", "public", ({ db }) => tournamentsPage(db)],
  ["GET", "/api/tournaments/:id", "public", ({ db, params }) => tournamentPage(db, idParam(params.id))],
  ["GET", "/api/live", "public", ({ db }) => livePage(db)],
  ["GET", "/api/matches/:id", "public", ({ db, params }) => protocol(db, idParam(params.id))],
  ["GET", "/api/rating", "public", ({ db, query }) => ratingPage(db, query.get("group"))],
  ["GET", "/api/players/:id", "public", ({ db, params }) => playerPage(db, idParam(params.id))],
  ["GET", "/api/news", "public", ({ db }) => newsPage(db)],
  ["GET", "/api/news/:id", "public", ({ db, params }) => newsItem(db, idParam(params.id))],
  [
    "GET",
    "/api/files/:id",
    "public",
    ({ db, params, res, deps }) => {
      const id = params.id;
      if (!/^[0-9a-f]{32}$/.test(id)) throw fail.notFound();
      const f = get<{ name: string; type: "pdf" | "doc" | "docx"; size: number }>(db, "SELECT name, type, size FROM files WHERE id = ?", id);
      if (!f || !fileExists(deps.filesDir, id)) throw fail.notFound();
      res.writeHead(200, {
        "content-type": MIME[f.type],
        "content-length": String(f.size),
        "content-disposition": `attachment; filename="regulation.${f.type}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "cache-control": "no-cache",
      });
      return new Promise<void>((resolve, reject) => {
        createReadStream(join(deps.filesDir, id)).on("error", reject).on("end", resolve).pipe(res);
      });
    },
  ],
];
