-- Additive editorial storage only. SportAdmin membership/schedules are untouched.
CREATE TABLE admin_users (
  email TEXT PRIMARY KEY NOT NULL,
  access_subject TEXT UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin','coach')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)
);
CREATE TABLE admin_team_assignments (
  email TEXT NOT NULL REFERENCES admin_users(email),
  team_id TEXT NOT NULL REFERENCES teams(id),
  can_publish INTEGER NOT NULL DEFAULT 0 CHECK(can_publish IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(email,team_id)
);
CREATE TABLE team_content_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  season TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  published_by TEXT NOT NULL REFERENCES admin_users(email),
  published_at TEXT NOT NULL,
  previous_id TEXT,
  restored_from TEXT,
  UNIQUE(team_id,season,id),
  FOREIGN KEY(team_id,season) REFERENCES team_seasons(team_id,season)
);
CREATE TABLE team_content_state (
  team_id TEXT NOT NULL,
  season TEXT NOT NULL,
  draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
  draft_version INTEGER NOT NULL DEFAULT 0 CHECK(draft_version >= 0),
  published_revision_id TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  photo_publication_allowed INTEGER NOT NULL DEFAULT 0 CHECK(photo_publication_allowed IN (0,1)),
  config_version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(team_id,season),
  FOREIGN KEY(team_id,season) REFERENCES team_seasons(team_id,season),
  FOREIGN KEY(team_id,season,published_revision_id) REFERENCES team_content_revisions(team_id,season,id)
);
INSERT INTO team_content_state(team_id,season,draft_json,updated_at)
SELECT team_id,season,json_object(
  'welcomeTitle',welcome_title,'welcomeDescription',welcome_description,'seasonMessage',NULL,
  'heroImageId',NULL,'heroAlt',NULL,'photoPublicationConfirmed',json('false'),
  'instagramUrl',instagram_url,'instagramLabel',NULL,'tiktokUrl',tiktok_url,'tiktokLabel',NULL,
  'contactEmail',contact_email,'contactText',NULL
),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM team_seasons;
CREATE TABLE team_images (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  season TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 2048),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 2048),
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 3145728),
  state TEXT NOT NULL CHECK(state IN ('pending','ready','deleting')),
  created_by TEXT NOT NULL REFERENCES admin_users(email),
  created_at TEXT NOT NULL,
  FOREIGN KEY(team_id,season) REFERENCES team_seasons(team_id,season)
);
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  team_id TEXT,
  season TEXT,
  revision_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_team ON admin_audit(team_id,created_at);
CREATE INDEX editorial_history ON team_content_revisions(team_id,season,published_at);
CREATE INDEX editorial_images_cleanup ON team_images(state,created_at);
