-- Whole first-version schema. Never edit after it reaches staging: add a new file.
-- Days are 'YYYY-MM-DD' and times 'HH:MM' in Moscow; moments are ISO strings in UTC.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('organizer', 'judge')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT ''
);
INSERT INTO contacts (id) VALUES (1);

CREATE TABLE rating_groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pdf', 'doc', 'docx')),
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  city TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('rtt', 'amateur')),
  category TEXT NOT NULL DEFAULT '',
  regulation_file_id TEXT REFERENCES files (id),
  created_at TEXT NOT NULL,
  CHECK (start_date <= end_date)
);

CREATE TABLE divisions (
  id INTEGER PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_id INTEGER REFERENCES rating_groups (id),
  created_at TEXT NOT NULL
);
CREATE INDEX divisions_tournament ON divisions (tournament_id);

CREATE TABLE points_rows (
  id INTEGER PRIMARY KEY,
  division_id INTEGER NOT NULL REFERENCES divisions (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  position INTEGER NOT NULL
);
CREATE INDEX points_rows_division ON points_rows (division_id);

CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  city TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A place refers to a points row by id, so renaming the row keeps the place.
CREATE TABLE placements (
  division_id INTEGER NOT NULL REFERENCES divisions (id),
  player_id INTEGER NOT NULL REFERENCES players (id),
  points_row_id INTEGER REFERENCES points_rows (id),
  place_text TEXT,
  PRIMARY KEY (division_id, player_id),
  CHECK ((points_row_id IS NULL) <> (place_text IS NULL))
);
CREATE INDEX placements_player ON placements (player_id);

CREATE TABLE matches (
  id INTEGER PRIMARY KEY,
  division_id INTEGER NOT NULL REFERENCES divisions (id),
  round TEXT NOT NULL,
  day TEXT NOT NULL,
  time TEXT,
  court TEXT NOT NULL DEFAULT '',
  player_a INTEGER NOT NULL REFERENCES players (id),
  player_b INTEGER NOT NULL REFERENCES players (id),
  judge_id INTEGER REFERENCES users (id),
  -- Written only by recomputeMatch, from score_actions and the manual result.
  state TEXT NOT NULL DEFAULT 'not_started' CHECK (state IN ('not_started', 'running', 'finished')),
  started_at TEXT,
  finished_at TEXT,
  manual_winner TEXT CHECK (manual_winner IN ('a', 'b')),
  manual_sets TEXT,
  manual_note TEXT NOT NULL DEFAULT '',
  manual_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (player_a <> player_b)
);
CREATE INDEX matches_division ON matches (division_id);
CREATE INDEX matches_day ON matches (day);
CREATE INDEX matches_state ON matches (state);
CREATE INDEX matches_judge ON matches (judge_id);
CREATE INDEX matches_player_a ON matches (player_a);
CREATE INDEX matches_player_b ON matches (player_b);

-- Judge's log: rows are only ever added. Score is replayed from it.
CREATE TABLE score_actions (
  match_id INTEGER NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('point', 'undo')),
  side TEXT CHECK (side IN ('a', 'b')),
  request_id TEXT NOT NULL,
  judge_id INTEGER NOT NULL REFERENCES users (id),
  at TEXT NOT NULL,
  PRIMARY KEY (match_id, seq),
  UNIQUE (match_id, request_id)
);

-- Organizer creates already done, so a repeated "Сохранить" returns the same record.
CREATE TABLE create_requests (
  request_id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE news (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
