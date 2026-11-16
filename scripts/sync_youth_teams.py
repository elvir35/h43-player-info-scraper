"""Run the existing names-only synchronizer for each reviewed registry entry."""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from h43_scraper.cloudflare import CloudflareRosterStore
from h43_scraper.youth_roster import TeamConfig, StoreError, fetch_roster_html, parse_roster, synchronize
from h43_scraper.youth_teams import load_teams


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("config/youth-teams.json"))
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    try:
        teams = load_teams(args.manifest)
        tokens = json.loads(os.environ.get("H43_INGEST_TOKENS_JSON", "{}"))
        if not isinstance(tokens, dict):
            raise ValueError("Invalid credential map")
        # Check every credential before any updates; never use P11's token for another team.
        stores = {} if args.validate_only else {
            t["id"]: CloudflareRosterStore(os.environ.get("H43_API_URL", ""), tokens.get(t["id"], "")) for t in teams}
    except (ValueError, StoreError):
        print(json.dumps({"status": "failed", "error": "Invalid registry or missing team-scoped credentials"}))
        return 1
    failed = False
    for row in teams:
        team = TeamConfig(row["id"], row["sportadminTeamName"], row["groupId"])
        attempted = datetime.now(timezone.utc)
        try:
            if args.validate_only:
                snapshot = parse_roster(fetch_roster_html(team), team, attempted)
                result_status = snapshot.status
            else:
                store = stores[team.team_id]
                result = synchronize(team, store, clock=lambda: attempted)
                snapshot, result_status = result.snapshot, result.status
                if result_status == "failed":
                    try:
                        store.report_failure(team, attempted)
                    except StoreError:
                        pass
            if result_status == "failed":
                raise ValueError("Failed scrape retained previous snapshot")
            print(json.dumps({"team": team.team_id, "status": result_status, "players": len(snapshot.players), "coaches": len(snapshot.coaches)}))
        except Exception:
            failed = True
            print(json.dumps({"team": team.team_id, "status": "failed", "previous_snapshot_retained": True}))
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
