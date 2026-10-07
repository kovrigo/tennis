import { expect, test } from "vitest";
import { applyAction } from "./services/matches.ts";
import { action, addJudge, addMatchSetup, memoryDb } from "./testkit.ts";
import { adminTournament } from "./views/admin.ts";

// The organizer's match table writes "идёт · <score>"; the score text must not say "идёт" again.
test("a running match's score text in the organizer's tournament is the sets only", () => {
  const db = memoryDb();
  const judge = addJudge(db);
  const s = addMatchSetup(db, { start: "2026-10-01", end: "2026-10-03", day: "2026-10-01", judgeId: judge });
  for (let seq = 0; seq < 4; seq++) applyAction(db, s.matchId, judge, action("point", seq, "a"), new Date("2026-10-01T08:00:00Z"));
  const row = adminTournament(db, s.tournamentId, "2026-10-01").matches.find((m) => m.id === s.matchId);
  expect(row?.state).toBe("running");
  expect(row?.scoreText).toBe("1:0");
});
