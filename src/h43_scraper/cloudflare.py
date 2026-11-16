"""Authenticated HTTP implementation of the Phase 2 snapshot-store protocol."""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

from h43_scraper.youth_roster import RosterSnapshot, StoreError, TeamConfig, synchronize


class CloudflareRosterStore:
    def __init__(self, base_url: str, token: str, *, allow_local_http: bool = False):
        url = urlparse(base_url)
        local = allow_local_http and url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1"}
        if (url.scheme != "https" and not local) or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in {"", "/"}:
            raise StoreError("API base URL must be an HTTPS origin (explicit loopback development excepted)")
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token):
            raise StoreError("A dedicated ingestion credential is required")
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._season: str | None = None

    def _request(self, method: str, team: TeamConfig, route: str, body: dict | None = None) -> dict:
        try:
            response = requests.request(
                method, f"{self.base_url}/api/v1/internal/teams/{team.team_id}/{route}",
                headers={"Authorization": f"Bearer {self._token}", "Accept": "application/json"},
                json=body, timeout=30, allow_redirects=False, stream=True,
            )
            try:
                if response.status_code != 200:
                    raise StoreError(f"Cloudflare request rejected (HTTP {response.status_code})")
                if "application/json" not in response.headers.get("Content-Type", ""):
                    raise StoreError("Cloudflare returned an unexpected response type")
                parts = []
                length = 0
                for part in response.iter_content(65536):
                    length += len(part)
                    if length > 262144:
                        raise StoreError("Cloudflare response exceeded the private response limit")
                    parts.append(part)
                value = json.loads(b"".join(parts).decode("utf-8"))
                if not isinstance(value, dict):
                    raise StoreError("Cloudflare returned an invalid response")
                return value
            finally:
                response.close()
        except (requests.RequestException, ValueError, UnicodeError) as exc:
            # Exception messages can contain URLs or request details. Log only
            # the class, never headers, response bodies or credential values.
            raise StoreError(f"Cloudflare request failed ({type(exc).__name__})") from exc

    def read(self, team: TeamConfig) -> RosterSnapshot | None:
        result = self._request("GET", team, "roster")
        if set(result) != {"season", "snapshot"} or not isinstance(result["season"], str):
            raise StoreError("Cloudflare team season must be configured before synchronization")
        self._season = result["season"]
        value = result["snapshot"]
        if value is None:
            return None
        try:
            if set(value) != {"schema_version", "team", "observed_at", "players", "coaches"} or value["schema_version"] != 1:
                raise ValueError()
            if value["team"] != {"id": team.team_id, "name": team.team_name,
                                 "sportadmin_group_id": team.group_id, "source_url": team.source_url}:
                raise ValueError()
            for key in ("players", "coaches"):
                if not isinstance(value[key], list) or len(value[key]) > 300 or any(set(p) not in ({"name"}, {"name", "sourceId"}) for p in value[key]):
                    raise ValueError()
            return RosterSnapshot(team, datetime.fromisoformat(value["observed_at"].replace("Z", "+00:00")),
                                  tuple(p["name"] for p in value["players"]), tuple(p["name"] for p in value["coaches"]),
                                  tuple(p["sourceId"] for p in value["players"]) if all("sourceId" in p for p in value["players"]) else (),
                                  tuple(p["sourceId"] for p in value["coaches"]) if all("sourceId" in p for p in value["coaches"]) else ())
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise StoreError("Cloudflare returned an invalid or mismatched snapshot") from exc

    def replace(self, snapshot: RosterSnapshot, expected_observed_at: datetime | None) -> None:
        if not self._season:
            raise StoreError("Read the configured season before writing")
        result = self._request("PUT", snapshot.team, "roster", {
            "season": self._season, "snapshot": snapshot.as_json(),
            "expectedObservedAt": expected_observed_at.isoformat().replace("+00:00", "Z") if expected_observed_at else None,
        })
        if result.get("status") not in {"success", "empty"}:
            raise StoreError("Cloudflare did not confirm snapshot synchronization")

    def report_failure(self, team: TeamConfig, attempted_at: datetime) -> None:
        if self._season:
            self._request("POST", team, "failure", {"season": self._season,
                          "attemptedAt": attempted_at.isoformat().replace("+00:00", "Z")})


def main() -> int:
    parser = argparse.ArgumentParser(description="Synchronize the public SportAdmin roster to authenticated Cloudflare storage.")
    parser.add_argument("--team-id", default="p11")
    parser.add_argument("--team-name", default="P11")
    parser.add_argument("--group-id", default="378673")
    args = parser.parse_args()
    try:
        team = TeamConfig(args.team_id, args.team_name, args.group_id)
        store = CloudflareRosterStore(os.environ.get("H43_API_URL", ""), os.environ.get("H43_INGEST_TOKEN", ""),
                                      allow_local_http=os.environ.get("H43_ALLOW_LOCAL_HTTP") == "true")
        attempted = datetime.now(timezone.utc)
        result = synchronize(team, store, clock=lambda: attempted)
        if result.status == "failed":
            try:
                store.report_failure(team, attempted)
            except StoreError:
                pass  # Original failure is still reported; no names restored.
            print(json.dumps({"status": "failed", "error": result.error}))
            return 1
        assert result.snapshot is not None
        print(json.dumps({"status": result.status, "team_id": team.team_id,
                          "players": len(result.snapshot.players), "coaches": len(result.snapshot.coaches)}))
        return 0
    except (StoreError, ValueError) as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
