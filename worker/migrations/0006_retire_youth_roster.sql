-- Preserve portrait revocations independently of editable drafts/history.
-- This additive migration does not delete membership, media or editorial data.
CREATE TABLE retired_roster_images (
  image_id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id)
);
INSERT OR IGNORE INTO retired_roster_images(image_id,team_id)
SELECT json_extract(d.value,'$.imageId'),s.team_id
FROM team_content_state s,json_each(s.draft_json,'$.rosterDetails') d
WHERE json_extract(d.value,'$.imageId') IS NOT NULL;
INSERT OR IGNORE INTO retired_roster_images(image_id,team_id)
SELECT json_extract(d.value,'$.imageId'),r.team_id
FROM team_content_revisions r,json_each(r.content_json,'$.rosterDetails') d
WHERE json_extract(d.value,'$.imageId') IS NOT NULL;
