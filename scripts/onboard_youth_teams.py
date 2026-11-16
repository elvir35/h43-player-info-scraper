"""Prepare or apply approved team configuration to the existing staging D1 only."""
import argparse
import json
import os
import re
from pathlib import Path

import requests

from h43_scraper.youth_teams import check_existing, load_teams, onboarding_statements


def staging_target(config: dict) -> tuple[str, str]:
    if set(config.get("env", {})) != {"staging"}:
        raise ValueError("Staging-only configuration required")
    stage = config["env"]["staging"]
    dbs = stage.get("d1_databases", [])
    if stage.get("name") != "h43-youth-api-staging" or len(dbs) != 1 or dbs[0].get("database_name") != "h43-youth-staging" or dbs[0].get("binding") != "DB":
        raise ValueError("Dedicated staging Worker/database required")
    account, database = config.get("account_id", ""), dbs[0].get("database_id", "")
    if not re.fullmatch(r"[a-f0-9]{32}", account) or not re.fullmatch(r"[a-f0-9-]{36}", database):
        raise ValueError("Verified resource inventory required")
    if stage.get("routes") or stage.get("route"):
        raise ValueError("Staging must not modify site routes")
    return account, database


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("config/youth-teams.json"))
    parser.add_argument("--config", type=Path)
    parser.add_argument("--apply-staging", action="store_true")
    parser.add_argument("--authorize-publication", action="store_true", help="Only after the club has approved publication for every new team")
    args = parser.parse_args()
    try:
        teams = load_teams(args.manifest)
        batch = onboarding_statements(teams, authorize_publication=args.authorize_publication)
        if not args.apply_staging:
            print(json.dumps({"mode": "review-only", "teams": [t["id"] for t in teams], "statements": len(batch), "new_roster_publication": args.authorize_publication}))
            return 0
        if not args.config or not os.environ.get("CLOUDFLARE_API_TOKEN"):
            raise ValueError("Verified staging config and scoped Cloudflare credential required")
        account, database = staging_target(json.loads(args.config.read_text(encoding="utf-8")))
        endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query"
        headers = {"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]}
        def query(body):
            response = requests.post(endpoint, headers=headers, json=body, timeout=60, allow_redirects=False)
            if response.status_code != 200 or not response.json().get("success"):
                raise ValueError("Staging D1 request failed; raw response suppressed")
            result = response.json()["result"]
            if not all(r.get("success") for r in result):
                raise ValueError("Staging D1 batch failed; raw response suppressed")
            return result
        existing = query({"sql": "SELECT id,group_id,sportadmin_team_name,current_season,enabled FROM teams", "params": []})[0]["results"]
        check_existing(teams, existing)
        query({"batch": batch})
        print(json.dumps({"mode": "staging-applied", "teams": len(teams), "existing_content_preserved": True, "coach_grants_added": 0}))
        return 0
    except (ValueError, KeyError, requests.RequestException):
        print("Onboarding failed; credentials and raw responses suppressed. Review configuration and rerun safely.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
