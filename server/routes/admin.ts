import type { Route } from "../app.ts";
import { hashPassword } from "../auth.ts";
import { readBody, readJson } from "../http.ts";
import { idParam } from "../services/common.ts";
import { adminDivision, groupRow, groupRows, placementsForm, saveDivision, saveGroup, savePlacements } from "../services/divisions.ts";
import { adminMatch, clearManualResult, deleteMatch, saveMatch, setManualResult } from "../services/matches.ts";
import { contacts, deleteNews, judgePassword, judgeRow, judgeRows, newsItem, newsRows, saveContacts, saveJudge, saveNews } from "../services/people.ts";
import { deletePlayer, playerRow, playerRows, savePlayer } from "../services/players.ts";
import { MAX_FILE, deleteRegulation, deleteTournament, saveRegulation, saveTournament } from "../services/tournaments.ts";
import { adminTournament, adminTournaments, matchFormContext } from "../views/admin.ts";

// Organizer only. Bodies are JSON, except the regulation upload (raw file body).

const ok = { ok: true };

export const adminRoutes: Route[] = [
  ["GET", "/api/admin/tournaments", "organizer", ({ db }) => adminTournaments(db)],
  ["POST", "/api/admin/tournaments", "organizer", async ({ req, db }) => adminTournament(db, saveTournament(db, await readJson(req)))],
  ["GET", "/api/admin/tournaments/:id", "organizer", ({ db, params }) => adminTournament(db, idParam(params.id))],
  [
    "PUT",
    "/api/admin/tournaments/:id",
    "organizer",
    async ({ req, db, params }) => adminTournament(db, saveTournament(db, await readJson(req), idParam(params.id))),
  ],
  [
    "DELETE",
    "/api/admin/tournaments/:id",
    "organizer",
    ({ db, deps, params }) => {
      deleteTournament(db, deps.filesDir, idParam(params.id));
      return ok;
    },
  ],
  [
    "PUT",
    "/api/admin/tournaments/:id/regulation",
    "organizer",
    async ({ req, db, deps, params, query }) => {
      const id = idParam(params.id);
      const bytes = await readBody(req, MAX_FILE, "Файл больше 20 МБ");
      return saveRegulation(db, deps.filesDir, id, query.get("name") ?? "", bytes);
    },
  ],
  [
    "DELETE",
    "/api/admin/tournaments/:id/regulation",
    "organizer",
    ({ db, deps, params }) => {
      deleteRegulation(db, deps.filesDir, idParam(params.id));
      return ok;
    },
  ],

  ["POST", "/api/admin/divisions", "organizer", async ({ req, db }) => saveDivision(db, await readJson(req))],
  ["GET", "/api/admin/divisions/:id", "organizer", ({ db, params }) => adminDivision(db, idParam(params.id))],
  ["PUT", "/api/admin/divisions/:id", "organizer", async ({ req, db, params }) => saveDivision(db, await readJson(req), idParam(params.id))],
  ["GET", "/api/admin/divisions/:id/placements", "organizer", ({ db, params }) => placementsForm(db, idParam(params.id))],
  [
    "PUT",
    "/api/admin/divisions/:id/placements",
    "organizer",
    async ({ req, db, params }) => savePlacements(db, idParam(params.id), await readJson(req)),
  ],

  ["GET", "/api/admin/match-form", "organizer", ({ db, query }) => matchFormContext(db, idParam(query.get("tournament") ?? undefined))],
  ["POST", "/api/admin/matches", "organizer", async ({ req, db }) => saveMatch(db, await readJson(req))],
  ["GET", "/api/admin/matches/:id", "organizer", ({ db, params }) => adminMatch(db, idParam(params.id))],
  ["PUT", "/api/admin/matches/:id", "organizer", async ({ req, db, params }) => saveMatch(db, await readJson(req), idParam(params.id))],
  [
    "DELETE",
    "/api/admin/matches/:id",
    "organizer",
    ({ db, params }) => {
      deleteMatch(db, idParam(params.id));
      return ok;
    },
  ],
  ["PUT", "/api/admin/matches/:id/result", "organizer", async ({ req, db, params }) => setManualResult(db, idParam(params.id), await readJson(req))],
  ["DELETE", "/api/admin/matches/:id/result", "organizer", ({ db, params }) => clearManualResult(db, idParam(params.id))],

  ["GET", "/api/admin/players", "organizer", ({ db }) => playerRows(db)],
  ["POST", "/api/admin/players", "organizer", async ({ req, db }) => savePlayer(db, await readJson(req))],
  ["GET", "/api/admin/players/:id", "organizer", ({ db, params }) => playerRow(db, idParam(params.id))],
  ["PUT", "/api/admin/players/:id", "organizer", async ({ req, db, params }) => savePlayer(db, await readJson(req), idParam(params.id))],
  [
    "DELETE",
    "/api/admin/players/:id",
    "organizer",
    ({ db, params }) => {
      deletePlayer(db, idParam(params.id));
      return ok;
    },
  ],

  ["GET", "/api/admin/judges", "organizer", ({ db }) => judgeRows(db)],
  [
    "POST",
    "/api/admin/judges",
    "organizer",
    async ({ req, db }) => {
      const body = await readJson(req);
      const pw = judgePassword(body, true);
      return saveJudge(db, body, pw ? await hashPassword(pw) : null);
    },
  ],
  ["GET", "/api/admin/judges/:id", "organizer", ({ db, params }) => judgeRow(db, idParam(params.id))],
  [
    "PUT",
    "/api/admin/judges/:id",
    "organizer",
    async ({ req, db, params }) => {
      const id = idParam(params.id);
      const body = await readJson(req);
      const pw = judgePassword(body, false);
      return saveJudge(db, body, pw ? await hashPassword(pw) : null, id);
    },
  ],

  ["GET", "/api/admin/news", "organizer", ({ db }) => newsRows(db)],
  ["POST", "/api/admin/news", "organizer", async ({ req, db }) => saveNews(db, await readJson(req))],
  ["GET", "/api/admin/news/:id", "organizer", ({ db, params }) => newsItem(db, idParam(params.id))],
  ["PUT", "/api/admin/news/:id", "organizer", async ({ req, db, params }) => saveNews(db, await readJson(req), idParam(params.id))],
  [
    "DELETE",
    "/api/admin/news/:id",
    "organizer",
    ({ db, params }) => {
      deleteNews(db, idParam(params.id));
      return ok;
    },
  ],

  ["GET", "/api/admin/groups", "organizer", ({ db }) => groupRows(db)],
  ["POST", "/api/admin/groups", "organizer", async ({ req, db }) => saveGroup(db, await readJson(req))],
  ["GET", "/api/admin/groups/:id", "organizer", ({ db, params }) => groupRow(db, idParam(params.id))],
  ["PUT", "/api/admin/groups/:id", "organizer", async ({ req, db, params }) => saveGroup(db, await readJson(req), idParam(params.id))],

  ["GET", "/api/admin/contacts", "organizer", ({ db }) => contacts(db)],
  ["PUT", "/api/admin/contacts", "organizer", async ({ req, db }) => saveContacts(db, await readJson(req))],
];
