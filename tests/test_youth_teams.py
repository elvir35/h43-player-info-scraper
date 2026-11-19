"""Synthetic registry/onboarding/synchronization safety checks; no live names."""
import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

from h43_scraper.youth_teams import check_existing, load_teams, onboarding_statements

ROOT = Path(__file__).parents[1]
TEAM = {"id": "synthetic", "name": "Synthetic team", "sportadminTeamName": "Synthetic",
        "groupId": "99999", "sourcePageUrl": "https://h43lund.web.sportadmin.se/start/?ID=99998"}


def registry(tmp_path, rows):
    path = tmp_path / "teams.json"
    path.write_text(json.dumps(rows), encoding="utf-8")
    return path


def test_reviewed_registry_has_unique_verified_teams():
    teams = load_teams(ROOT / "config/youth-teams.json")
    assert len(teams) == 11
    assert next(t for t in teams if t["id"] == "p11")["groupId"] == "378673"
    assert next(t for t in teams if t["id"] == "f12")["groupId"] == "378664"


@pytest.mark.parametrize("change", [
    {"id": "../admin"}, {"groupId": "1; DROP TABLE teams"}, {"name": "<script>"},
    {"sourcePageUrl": "https://evil.test/start/?ID=9"}, {"sourcePageUrl": "https://h43lund.web.sportadmin.se/start/?ID=1&redirect=evil"},
    {"unexpected": True}, {"groupId": 5},
])
def test_invalid_registry_fails_before_writes(tmp_path, change):
    with pytest.raises(ValueError):
        load_teams(registry(tmp_path, [{**TEAM, **change}]))


def test_duplicate_and_conflicting_mappings_are_rejected(tmp_path):
    with pytest.raises(ValueError):
        load_teams(registry(tmp_path, [TEAM, {**TEAM, "id": "other"}]))
    same = {"id": "synthetic", "group_id": "99999", "sportadmin_team_name": "Synthetic", "current_season": "current", "enabled": 1}
    check_existing([TEAM], [same])
    for changed in [{"group_id": "88888"}, {"sportadmin_team_name": "Other"}, {"current_season": "old"}, {"enabled": 0}, {"id": "other"}]:
        with pytest.raises(ValueError):
            check_existing([TEAM], [{**same, **changed}])


def test_bound_onboarding_is_repeatable_and_preserves_content_and_grants():
    db = sqlite3.connect(":memory:")
    for path in sorted((ROOT / "worker/migrations").glob("*.sql")):
        db.executescript(path.read_text(encoding="utf-8"))
    def apply(authorized):
        with db:
            for stmt in onboarding_statements([TEAM], authorize_publication=authorized):
                db.execute(stmt["sql"], stmt["params"])
    apply(True)
    assert db.execute("SELECT publication_authorized FROM team_seasons WHERE team_id='synthetic'").fetchone() == (1,)
    assert db.execute("SELECT count(*) FROM admin_team_assignments").fetchone() == (0,)
    content = db.execute("SELECT draft_json FROM team_content_state WHERE team_id='synthetic'").fetchone()[0]
    assert json.loads(content)["contacts"] == []
    db.execute("UPDATE team_content_state SET draft_version=5 WHERE team_id='synthetic'")
    db.commit()
    apply(False)
    assert db.execute("SELECT draft_version,draft_json FROM team_content_state WHERE team_id='synthetic'").fetchone() == (5, content)
    assert db.execute("SELECT publication_authorized FROM team_seasons WHERE team_id='synthetic'").fetchone() == (1,)
    assert db.execute("SELECT count(*) FROM team_roster_snapshots").fetchone() == (0,)


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_onboarding_refuses_production_or_shared_resources():
    target = load_script("onboard_youth_teams").staging_target
    stage = {"name": "h43-youth-api-staging", "d1_databases": [{"binding": "DB", "database_name": "h43-youth-staging", "database_id": "0" * 36}]}
    config = {"account_id": "a" * 32, "env": {"staging": stage}}
    assert target(config) == ("a" * 32, "0" * 36)
    for bad in [{**config, "env": {"production": stage}}, {**config, "env": {"staging": {**stage, "routes": ["h43lund.se/*"]}}},
                {**config, "env": {"staging": {**stage, "name": "production"}}}]:
        with pytest.raises(ValueError):
            target(bad)


@pytest.mark.parametrize("script", ["scrape_youth_roster", "sync_youth_roster", "sync_youth_teams"])
def test_retired_entry_points_never_scrape_even_with_credentials(script, monkeypatch, capsys):
    module = load_script(script)
    monkeypatch.setenv("H43_INGEST_TOKENS_JSON", '{"p11":"synthetic"}')
    monkeypatch.setenv("H43_API_URL", "https://example.test")
    assert module.main() == 2
    assert "retired" in capsys.readouterr().err
