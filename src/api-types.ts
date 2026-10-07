// Requests and responses of /api/*, shared by the server and the pages.
// Days are "YYYY-MM-DD" and times "HH:MM", both Moscow. The server formats every
// moment (start, end, "обновлено в") so pages never convert time zones.

export type Side = "a" | "b";
export type Role = "organizer" | "judge";
export type TournamentKind = "rtt" | "amateur";
export type TournamentStatus = "running" | "upcoming" | "finished";
export type MatchState = "not_started" | "running" | "finished";
export type FileType = "pdf" | "doc" | "docx";

export type ErrorCode =
  | "validation"
  | "bad_file_type"
  | "bad_request"
  | "bad_credentials"
  | "unauthorized"
  | "forbidden"
  | "not_your_match"
  | "not_found"
  | "stale"
  | "finished"
  | "nothing_to_undo"
  | "undo_closed"
  | "manual_result"
  | "in_use"
  | "duplicate"
  | "login_taken"
  | "too_large"
  | "too_many_attempts"
  | "server"
  | "not_ready";

/** Body of every non-2xx answer. `message` and `fields` are Russian texts shown as they are. */
export interface ApiErrorBody {
  error: ErrorCode;
  message: string;
  /** Field name → text under the field. */
  fields?: Record<string, string>;
  /** too_many_attempts: minutes left. */
  minutes?: number;
  /** duplicate: players with the same first name, last name and city. */
  duplicates?: AdminPlayerRow[];
  /** duplicate from the match form: which new player matched. */
  side?: Side;
  /** Judge action refusals (stale, finished, ...): the current match as stored. */
  match?: JudgeMatch;
}

// ---------- shared pieces ----------

/** Player in a match row: "Фамилия И.", or the full name when both short names of the match coincide. */
export interface PlayerRef {
  id: number;
  name: string;
}

/** Player with full name "Фамилия Имя" and city. */
export interface PlayerFull {
  id: number;
  name: string;
  city: string;
}

export interface Contacts {
  address: string;
  phone: string;
  email: string;
}

export interface FileInfo {
  id: string;
  name: string;
  type: FileType;
  size: number;
}

export interface SetScore {
  a: number;
  b: number;
  /** Tiebreak points; present only when the set was decided by a tiebreak. */
  tb?: { a: number; b: number };
}

/** One row of a match list: home, online score, tournament page, judge's list. */
export interface MatchRow {
  id: number;
  tournamentId: number;
  tournamentName: string;
  divisionName: string;
  round: string;
  day: string;
  time: string | null;
  court: string;
  /** "finished" also for a manual result. */
  state: MatchState;
  manual: boolean;
  manualNote: string;
  a: PlayerRef;
  b: PlayerRef;
  /** Games per set in a:b order. Running: last entry is the current set. Manual: entered sets, may be empty. */
  sets: SetScore[];
  /** Current game while running: "0", "15", "30", "40", "Б", or tiebreak points. */
  game: { a: string; b: string } | null;
  tiebreak: boolean;
  setNumber: number;
  winner: Side | null;
  /** Moscow time and day of the first counted point. */
  startedTime: string | null;
  startedDay: string | null;
  /** Judge-scored finished match: "1 ч 12 мин". */
  durationText: string | null;
  /** At least one counted point or a manual result. */
  hasProtocol: boolean;
}

export interface TournamentCard {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  city: string;
  venue: string;
  kind: TournamentKind;
  category: string;
  divisions: string[];
  status: TournamentStatus;
  regulation: FileInfo | null;
}

export interface NewsCard {
  id: number;
  title: string;
  date: string;
  /** Start of the text, plain. */
  excerpt: string;
}

export interface RatingRow {
  place: number;
  player: PlayerFull;
  /** Tournaments that gave the player points in this group. */
  tournaments: number;
  points: number;
}

// ---------- public pages ----------

/** GET /api/site — once per page load: footer contacts and the signed-in staff member. */
export interface SiteInfo {
  contacts: Contacts;
  user: { role: Role; name: string } | null;
  /** Moscow date, e.g. the default date of a news item. */
  today: string;
}

/** GET /api/home */
export interface HomePage {
  /** Running tournament, else the nearest upcoming one. */
  hero: TournamentCard | null;
  /** Up to three: running first, then upcoming by start date. */
  upcoming: TournamentCard[];
  /** Every group in the organizer's order with its first five players. */
  rating: { id: number; name: string; rows: RatingRow[] }[];
  /** Three latest. */
  news: NewsCard[];
}

/** GET /api/tournaments */
export interface TournamentsPage {
  running: TournamentCard[];
  upcoming: TournamentCard[];
  finished: TournamentCard[];
}

export interface DivisionResults {
  id: number;
  name: string;
  groupName: string | null;
  hasTable: boolean;
  /** With a table: its rows in order, players who got each place. */
  rows: { id: number; name: string; points: number; players: PlayerFull[] }[];
  /** Without a table: places as typed, players per place. */
  places: { place: string; players: PlayerFull[] }[];
  anyPlacements: boolean;
}

/** GET /api/tournaments/:id */
export interface TournamentPage {
  tournament: TournamentCard;
  today: string;
  /** Every day of the tournament. */
  days: string[];
  matches: MatchRow[];
  results: DivisionResults[];
}

/** GET /api/live — polled every 10 s. */
export interface LivePage {
  today: string;
  /** Moscow time of this answer, "14:32". */
  updatedAt: string;
  /** Running matches of any day, by court. */
  running: MatchRow[];
  /** Today, not started, by time; no time last. */
  upcoming: MatchRow[];
  /** Finished, scheduled today or finished today, latest first. */
  finished: MatchRow[];
}

/** GET /api/rating?group=:id — unknown or missing group opens the first one. */
export interface RatingPage {
  groups: { id: number; name: string }[];
  groupId: number | null;
  rows: RatingRow[];
}

/** GET /api/players/:id */
export interface PlayerPage {
  player: PlayerFull;
  groups: { id: number; name: string; points: number; place: number }[];
  /** One per placement, latest tournament first. */
  results: {
    tournamentId: number;
    tournamentName: string;
    startDate: string;
    endDate: string;
    divisionId: number;
    divisionName: string;
    place: string;
    /** Null when the division has no points table. */
    points: number | null;
    regulation: FileInfo | null;
  }[];
}

/** GET /api/news */
export type NewsPage = NewsCard[];

/** GET /api/news/:id */
export interface NewsItem {
  id: number;
  title: string;
  date: string;
  body: string;
}

/** GET /api/matches/:id — printable protocol. */
export interface Protocol {
  id: number;
  tournamentId: number;
  tournamentName: string;
  divisionName: string;
  round: string;
  court: string;
  day: string;
  time: string | null;
  /** Full names of every judge with a counted point; the assigned judge when none yet. */
  judges: string[];
  a: PlayerFull;
  b: PlayerFull;
  state: MatchState;
  manual: boolean;
  manualNote: string;
  winner: Side | null;
  startedTime: string | null;
  finishedTime: string | null;
  durationText: string | null;
  /** "6:4, 6:7(5), 7:6(3)": winner's side when finished, a:b while running. */
  setsText: string;
  /** One row per set, cells "1:0" in a:b order; a tiebreak is the last cell with its points below. */
  progression: { set: number; cells: string[]; tiebreak: string | null }[];
}

// ---------- login ----------

/** POST /api/login */
export interface LoginRequest {
  login: string;
  password: string;
}
export interface LoginResponse {
  role: Role;
  name: string;
}

// ---------- judge ----------

/** GET /api/judge/matches — own matches: unfinished from past days, today and later. */
export interface JudgeMatchesPage {
  judgeName: string;
  today: string;
  matches: MatchRow[];
}

/** GET /api/judge/matches/:id, and the answer to every action. */
export interface JudgeMatch {
  id: number;
  tournamentName: string;
  divisionName: string;
  round: string;
  court: string;
  day: string;
  time: string | null;
  a: PlayerRef;
  b: PlayerRef;
  /** Number of the last action; send it back as expectedSeq. */
  seq: number;
  sets: SetScore[];
  game: { a: string; b: string } | null;
  tiebreak: boolean;
  setNumber: number;
  finished: boolean;
  winner: Side | null;
  /** Counted points. */
  points: number;
  /** Winner's side, "6:4, 7:6(5)", when finished. */
  setsText: string;
  /** Still assigned to this judge. */
  mine: boolean;
  /** Organizer entered a manual result: the judge no longer scores it. */
  manual: boolean;
  /** Undo allowed now: points exist and, after the end, still the same Moscow day. */
  undoOpen: boolean;
}

/** POST /api/judge/matches/:id/actions */
export interface ActionRequest {
  /** New UUID per tap; "Отправить снова" resends the same one. */
  requestId: string;
  type: "point" | "undo";
  side?: Side;
  expectedSeq: number;
}

// ---------- organizer ----------

export interface AdminTournamentRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  kind: TournamentKind;
  city: string;
  status: TournamentStatus;
  matchCount: number;
}

export interface TournamentInput {
  /** Create only: made when the form opens. */
  requestId?: string;
  name: string;
  startDate: string;
  endDate: string;
  city: string;
  venue: string;
  kind: TournamentKind;
  category: string;
}

export interface AdminMatchRow {
  id: number;
  day: string;
  time: string | null;
  court: string;
  divisionName: string;
  round: string;
  a: PlayerRef;
  b: PlayerRef;
  judgeName: string | null;
  state: MatchState;
  manual: boolean;
  /** "6:4, 3:2" in a:b order, "итог вручную: отказ", or "" when not started. */
  scoreText: string;
  pointsCount: number;
}

/** GET /api/admin/tournaments/:id */
export interface AdminTournament {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  city: string;
  venue: string;
  kind: TournamentKind;
  category: string;
  status: TournamentStatus;
  regulation: FileInfo | null;
  matchCount: number;
  /** Some division has a points table: the regulation cannot be removed. */
  hasPointsTables: boolean;
  divisions: { id: number; name: string; groupName: string | null; rowsCount: number; placementsCount: number }[];
  /** By day, time (none last), court. */
  matches: AdminMatchRow[];
}

export interface DivisionInput {
  requestId?: string;
  tournamentId: number;
  name: string;
  groupId: number | null;
  /** Points table in order. A row with id is updated, without id created, a missing one removed. */
  rows: { id?: number; name: string; points: number }[];
}

/** GET /api/admin/divisions/:id */
export interface AdminDivision {
  id: number;
  tournamentId: number;
  tournamentName: string;
  hasRegulation: boolean;
  name: string;
  groupId: number | null;
  /** placedCount: players with this place; such a row cannot be removed. */
  rows: { id: number; name: string; points: number; placedCount: number }[];
}

/** GET /api/admin/divisions/:id/placements */
export interface PlacementsForm {
  divisionId: number;
  divisionName: string;
  tournamentId: number;
  tournamentName: string;
  hasTable: boolean;
  rows: { id: number; name: string; points: number }[];
  /** Players of the division's matches, by last name. */
  players: { id: number; name: string; city: string; pointsRowId: number | null; placeText: string }[];
}

/** PUT /api/admin/divisions/:id/placements — the whole list; players left out have no place. */
export interface PlacementInput {
  playerId: number;
  pointsRowId?: number | null;
  placeText?: string;
}

export interface NewPlayer {
  firstName: string;
  lastName: string;
  city: string;
}

export interface MatchInput {
  requestId?: string;
  divisionId: number;
  round: string;
  day: string;
  time: string | null;
  court: string;
  /** Existing player id; 0 when newA is sent. */
  playerA: number;
  playerB: number;
  /** "Новый игрок" from the match form, saved with the match in one transaction. */
  newA?: NewPlayer;
  newB?: NewPlayer;
  /** Set after the duplicate warning for a new player. */
  confirmDuplicate?: boolean;
  judgeId: number | null;
}

/** GET /api/admin/matches/:id */
export interface AdminMatch {
  id: number;
  tournamentId: number;
  divisionId: number;
  round: string;
  day: string;
  time: string | null;
  court: string;
  playerA: number;
  playerB: number;
  judgeId: number | null;
  a: PlayerFull;
  b: PlayerFull;
  state: MatchState;
  pointsCount: number;
  manual: { winner: Side; sets: [number, number][]; note: string } | null;
}

/** GET /api/admin/match-form?tournament=:id — everything the match form chooses from. */
export interface MatchFormContext {
  tournament: { id: number; name: string; startDate: string; endDate: string };
  divisions: { id: number; name: string }[];
  judges: { id: number; name: string }[];
  players: AdminPlayerRow[];
}

/** PUT /api/admin/matches/:id/result */
export interface ManualResultInput {
  winner: Side;
  /** Up to three [a, b] pairs in players' order. */
  sets: [number, number][];
  note: string;
}

export interface AdminPlayerRow {
  id: number;
  firstName: string;
  lastName: string;
  city: string;
  /** "Фамилия Имя". */
  name: string;
  matchCount: number;
}

export interface PlayerInput {
  requestId?: string;
  firstName: string;
  lastName: string;
  city: string;
  /** Set after the duplicate warning: "Всё равно добавить". */
  confirmDuplicate?: boolean;
}

export interface AdminJudgeRow {
  id: number;
  firstName: string;
  lastName: string;
  login: string;
  todayMatches: number;
}

export interface JudgeInput {
  requestId?: string;
  firstName: string;
  lastName: string;
  login: string;
  /** Required for a new judge; for an existing one an empty value keeps the password. */
  password?: string;
}

export interface AdminNewsRow {
  id: number;
  title: string;
  date: string;
}

export interface NewsInput {
  requestId?: string;
  title: string;
  date: string;
  body: string;
}

export interface GroupRow {
  id: number;
  name: string;
}

export interface GroupInput {
  requestId?: string;
  name: string;
}
