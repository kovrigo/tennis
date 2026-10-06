import { type ComponentType, type ReactNode, useEffect } from "react";
import type { Role } from "./api-types.ts";
import { ErrorBoundary, LoadError, Loading, NotFound } from "./components/states.tsx";
import { AdminLayout, BareLayout, PublicLayout } from "./layout/Layout.tsx";
import { IconSprite } from "./layout/icons.tsx";
import { AdminContacts } from "./pages/admin/Contacts.tsx";
import { AdminDivision } from "./pages/admin/DivisionForm.tsx";
import { AdminGroup } from "./pages/admin/GroupForm.tsx";
import { AdminGroups } from "./pages/admin/Groups.tsx";
import { AdminJudge } from "./pages/admin/JudgeForm.tsx";
import { AdminJudges } from "./pages/admin/Judges.tsx";
import { AdminManualResult } from "./pages/admin/ManualResult.tsx";
import { AdminMatch } from "./pages/admin/MatchForm.tsx";
import { AdminNewsForm } from "./pages/admin/NewsForm.tsx";
import { AdminNewsList } from "./pages/admin/NewsList.tsx";
import { AdminPlacements } from "./pages/admin/Placements.tsx";
import { AdminPlayer } from "./pages/admin/PlayerForm.tsx";
import { AdminPlayers } from "./pages/admin/Players.tsx";
import { AdminTournament } from "./pages/admin/TournamentForm.tsx";
import { AdminTournaments } from "./pages/admin/Tournaments.tsx";
import { Login } from "./pages/judge/Login.tsx";
import { MyMatches } from "./pages/judge/MyMatches.tsx";
import { Scoring } from "./pages/judge/Scoring.tsx";
import { Home } from "./pages/public/Home.tsx";
import { Live } from "./pages/public/Live.tsx";
import { NewsItemPage } from "./pages/public/NewsItem.tsx";
import { NewsList } from "./pages/public/NewsList.tsx";
import { Player } from "./pages/public/Player.tsx";
import { Protocol } from "./pages/public/Protocol.tsx";
import { Rating } from "./pages/public/Rating.tsx";
import { Tournament } from "./pages/public/Tournament.tsx";
import { Tournaments } from "./pages/public/Tournaments.tsx";
import { matchPath, navigate, useLocation } from "./router.tsx";
import { SiteProvider, useSite } from "./site.tsx";

// Every page address. Params arrive as props: { id } for ":id".
// "/admin/x/new" comes before "/admin/x/:id"; components get id "new" never.

type Params = Record<string, string>;
type Frame = "public" | "admin" | "bare";
type Page = [pattern: string, frame: Frame, component: ComponentType<Params>, role?: Role];

const PAGES: Page[] = [
  ["/", "public", Home],
  ["/tournaments", "public", Tournaments],
  ["/tournaments/:id", "public", Tournament],
  ["/live", "public", Live],
  ["/matches/:id", "bare", Protocol],
  ["/rating", "public", Rating],
  ["/players/:id", "public", Player],
  ["/news", "public", NewsList],
  ["/news/:id", "public", NewsItemPage],
  ["/login", "public", Login],

  ["/judge", "bare", MyMatches, "judge"],
  ["/judge/matches/:id", "bare", Scoring, "judge"],

  ["/admin", "admin", () => <Redirect to="/admin/tournaments" />, "organizer"],
  ["/admin/tournaments", "admin", AdminTournaments, "organizer"],
  ["/admin/tournaments/new", "admin", () => <AdminTournament />, "organizer"],
  ["/admin/tournaments/:id", "admin", AdminTournament, "organizer"],
  ["/admin/divisions/new", "admin", () => <AdminDivision />, "organizer"],
  ["/admin/divisions/:id", "admin", AdminDivision, "organizer"],
  ["/admin/divisions/:id/placements", "admin", AdminPlacements, "organizer"],
  ["/admin/matches/new", "admin", () => <AdminMatch />, "organizer"],
  ["/admin/matches/:id", "admin", AdminMatch, "organizer"],
  ["/admin/matches/:id/result", "admin", AdminManualResult, "organizer"],
  ["/admin/players", "admin", AdminPlayers, "organizer"],
  ["/admin/players/new", "admin", () => <AdminPlayer />, "organizer"],
  ["/admin/players/:id", "admin", AdminPlayer, "organizer"],
  ["/admin/judges", "admin", AdminJudges, "organizer"],
  ["/admin/judges/new", "admin", () => <AdminJudge />, "organizer"],
  ["/admin/judges/:id", "admin", AdminJudge, "organizer"],
  ["/admin/news", "admin", AdminNewsList, "organizer"],
  ["/admin/news/new", "admin", () => <AdminNewsForm />, "organizer"],
  ["/admin/news/:id", "admin", AdminNewsForm, "organizer"],
  ["/admin/groups", "admin", AdminGroups, "organizer"],
  ["/admin/groups/new", "admin", () => <AdminGroup />, "organizer"],
  ["/admin/groups/:id", "admin", AdminGroup, "organizer"],
  ["/admin/contacts", "admin", AdminContacts, "organizer"],
];

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

/** Staff pages: without the right sign-in, go to the login page and come back after. */
function Gate({ role, children }: { role?: Role; children: ReactNode }) {
  const { site, failed, reload } = useSite();
  const { path } = useLocation();
  if (!role) return <>{children}</>;
  if (!site) return failed ? <LoadError onRetry={() => void reload()} /> : <Loading show={false} />;
  if (site.user?.role !== role) return <Redirect to={`/login?next=${encodeURIComponent(path)}`} />;
  return <>{children}</>;
}

function Routes() {
  const { path } = useLocation();
  for (const [pattern, frame, Component, role] of PAGES) {
    const params = matchPath(pattern, path);
    if (!params) continue;
    const Layout = frame === "admin" ? AdminLayout : frame === "bare" ? BareLayout : PublicLayout;
    return (
      <Layout>
        <ErrorBoundary key={path}>
          <Gate role={role}>
            <Component {...params} />
          </Gate>
        </ErrorBoundary>
      </Layout>
    );
  }
  return (
    <PublicLayout>
      <NotFound />
    </PublicLayout>
  );
}

export function App() {
  return (
    <SiteProvider>
      <IconSprite />
      <Routes />
    </SiteProvider>
  );
}
