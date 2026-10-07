import type { Route } from "../app.ts";
import { readJson } from "../http.ts";
import { idParam } from "../services/common.ts";
import { applyAction } from "../services/matches.ts";
import { judgeMatch, judgeMatchesPage } from "../views/judge.ts";

// Judge: own matches and score actions.

export const judgeRoutes: Route[] = [
  ["GET", "/api/judge/matches", "judge", ({ db, user }) => judgeMatchesPage(db, user!.id)],
  ["GET", "/api/judge/matches/:id", "judge", ({ db, user, params }) => judgeMatch(db, idParam(params.id), user!.id)],
  [
    "POST",
    "/api/judge/matches/:id/actions",
    "judge",
    async ({ req, db, user, params }) => {
      const id = idParam(params.id);
      return applyAction(db, id, user!.id, await readJson(req));
    },
  ],
];
