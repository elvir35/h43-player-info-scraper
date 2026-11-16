CREATE TABLE teams (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  sportadmin_team_name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  current_season TEXT,
  cache_version INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE team_seasons (
  team_id TEXT NOT NULL REFERENCES teams(id),
  season TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  publication_authorized INTEGER NOT NULL DEFAULT 0 CHECK(publication_authorized IN (0,1)),
  calendar_year INTEGER,
  calendar_month INTEGER CHECK(calendar_month BETWEEN 1 AND 12),
  welcome_title TEXT,
  welcome_description TEXT,
  hero_image_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  contact_email TEXT,
  PRIMARY KEY(team_id, season),
  CHECK(starts_on <= ends_on),
  CHECK((calendar_year IS NULL) = (calendar_month IS NULL))
);
CREATE TABLE team_roster_snapshots (
  team_id TEXT NOT NULL,
  season TEXT NOT NULL,
  group_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  observed_us INTEGER NOT NULL,
  players_json TEXT NOT NULL CHECK(json_valid(players_json)),
  coaches_json TEXT NOT NULL CHECK(json_valid(coaches_json)),
  PRIMARY KEY(team_id, season),
  FOREIGN KEY(team_id, season) REFERENCES team_seasons(team_id, season)
);
CREATE TABLE roster_sync_status (
  team_id TEXT NOT NULL,
  season TEXT NOT NULL,
  attempted_us INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','empty','failed')),
  PRIMARY KEY(team_id, season),
  FOREIGN KEY(team_id, season) REFERENCES team_seasons(team_id, season)
);
