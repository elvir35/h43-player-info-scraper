-- A current team page needs no sporting season label or date range.
-- 'current' is an internal snapshot partition, never a claimed sporting season.
-- Existing explicitly configured seasons are untouched. Publication stays off.
INSERT OR IGNORE INTO team_seasons (team_id, season, starts_on, ends_on, publication_authorized)
SELECT id, 'current', '', '', 0 FROM teams WHERE current_season IS NULL;
UPDATE teams SET current_season='current' WHERE current_season IS NULL;
