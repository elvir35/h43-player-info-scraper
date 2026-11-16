"""Reviewed team registry and repeatable, non-destructive staging onboarding.

No names, editorial content, coach grants or credentials belong in the registry.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

from h43_scraper.youth_roster import TeamConfig


def load_teams(path: Path) -> list[dict]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
        raise ValueError("Expected 1–100 teams")
    ids, groups, labels = set(), set(), set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"id", "name", "sportadminTeamName", "groupId", "sourcePageUrl"}:
            raise ValueError("Invalid team configuration fields")
        if any(not isinstance(v, str) for v in row.values()):
            raise ValueError("Team configuration must contain strings")
        TeamConfig(row["id"], row["sportadminTeamName"], row["groupId"])
        if any(not 1 <= len(row[k]) <= 150 or re.search(r"[<>\x00-\x1f\x7f]", row[k]) for k in ["name", "sportadminTeamName"]):
            raise ValueError("Invalid team display/source name")
        url = urlparse(row["sourcePageUrl"])
        if (url.scheme != "https" or url.netloc != "h43lund.web.sportadmin.se"
                or url.path not in {"/start/", "/grupp/"} or url.fragment
                or not re.fullmatch(r"ID=[0-9]{1,12}", url.query)):
            raise ValueError("Invalid public SportAdmin page")
        if row["id"] in ids or row["groupId"] in groups or row["sportadminTeamName"] in labels:
            raise ValueError("Duplicate team, roster group or feed label")
        ids.add(row["id"]); groups.add(row["groupId"]); labels.add(row["sportadminTeamName"])
    return rows


def check_existing(teams: list[dict], existing: list[dict]) -> None:
    """Refuse to relabel an existing roster or reuse another team's source."""
    for team in teams:
        for row in existing:
            if row["id"] == team["id"]:
                if (row["group_id"] != team["groupId"] or row["sportadmin_team_name"] != team["sportadminTeamName"]
                        or row["current_season"] != "current" or row["enabled"] != 1):
                    raise ValueError("Existing team mapping differs; explicit remapping review required")
            elif row["group_id"] == team["groupId"] or row["sportadmin_team_name"] == team["sportadminTeamName"]:
                raise ValueError("Roster group/feed label already belongs to another team")


def onboarding_statements(teams: list[dict], *, authorize_publication: bool = False) -> list[dict]:
    """All values are bound. Existing content, permissions and snapshots survive."""
    empty = {key: None for key in ["welcomeTitle", "welcomeDescription", "seasonMessage", "heroImageId", "heroAlt",
                                 "instagramUrl", "instagramLabel", "tiktokUrl", "tiktokLabel", "contactEmail", "contactPhone", "contactText"]}
    empty.update(photoPublicationConfirmed=False, contacts=[])
    statements = []
    for team in teams:
        statements.extend([
            {"sql": "INSERT INTO teams(id,name,sportadmin_team_name,group_id,current_season) VALUES(?,?,?,?, 'current') ON CONFLICT(id) DO NOTHING",
             "params": [team["id"], team["name"], team["sportadminTeamName"], team["groupId"]]},
            {"sql": "INSERT INTO team_seasons(team_id,season,starts_on,ends_on,publication_authorized) VALUES(?,'current','','',?) ON CONFLICT(team_id,season) DO NOTHING",
             "params": [team["id"], int(authorize_publication)]},
            {"sql": "INSERT INTO team_content_state(team_id,season,draft_json,updated_at) VALUES(?,'current',?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(team_id,season) DO NOTHING",
             "params": [team["id"], json.dumps(empty)]},
        ])
    statements.append({"sql": "INSERT INTO admin_audit(id,actor_email,action,created_at) VALUES(lower(hex(randomblob(16))),'operator',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                       "params": ["onboard_teams_authorized" if authorize_publication else "onboard_teams_withheld"]})
    return statements
