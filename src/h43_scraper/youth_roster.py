"""Public roster names and private technical identity retrieval and an atomic snapshot-store contract.

No database or publication-approval implementation lives here. SportAdmin owns
membership; a valid snapshot replaces both lists, including explicitly empty lists.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable, Protocol
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag

from h43_scraper.sportadmin import USER_AGENT, ScraperError


@dataclass(frozen=True)
class TeamConfig:
    team_id: str = "p11"
    team_name: str = "P11"
    group_id: str = "378673"

    def __post_init__(self) -> None:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,31}", self.team_id):
            raise ValueError("Invalid team ID")
        if not re.fullmatch(r"[0-9]{1,12}", self.group_id):
            raise ValueError("Invalid SportAdmin group ID")
        if not self.team_name.strip():
            raise ValueError("Team name is required")

    @property
    def source_url(self) -> str:
        return f"https://h43lund.web.sportadmin.se/grupp/?ID={self.group_id}"


@dataclass(frozen=True)
class RosterSnapshot:
    team: TeamConfig
    observed_at: datetime
    players: tuple[str, ...]
    coaches: tuple[str, ...]
    player_ids: tuple[str, ...] = ()
    coach_ids: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.observed_at.tzinfo is None or self.observed_at.utcoffset() is None:
            raise ValueError("Snapshot time must have an explicit timezone")
        if not isinstance(self.players, tuple) or not isinstance(self.coaches, tuple):
            raise ValueError("Snapshot name lists must be immutable tuples")
        for name in (*self.players, *self.coaches):
            if not isinstance(name, str) or not 1 <= len(name) <= 150 or name != clean_name(name):
                raise ValueError("Snapshot names must be non-empty normalized strings")

        for ids, names in [(self.player_ids, self.players), (self.coach_ids, self.coaches)]:
            if not isinstance(ids, tuple):
                raise ValueError("Snapshot identities must be immutable tuples")
            if ids and (len(ids) != len(names) or len(set(ids)) != len(ids) or any(not re.fullmatch(r"[0-9]{1,12}", v) for v in ids)):
                raise ValueError("Invalid member identities")

    @property
    def status(self) -> str:
        return "empty" if not self.players and not self.coaches else "success"

    def as_json(self) -> dict:
        return {
            "schema_version": 1,
            "team": {
                "id": self.team.team_id,
                "name": self.team.team_name,
                "sportadmin_group_id": self.team.group_id,
                "source_url": self.team.source_url,
            },
            "observed_at": self.observed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "players": [{"name": name, **({"sourceId": self.player_ids[i]} if self.player_ids else {})} for i, name in enumerate(self.players)],
            "coaches": [{"name": name, **({"sourceId": self.coach_ids[i]} if self.coach_ids else {})} for i, name in enumerate(self.coaches)],
        }


class StoreError(RuntimeError):
    """A persistence failure or stale/concurrent snapshot; prior state is unchanged."""


class RosterStore(Protocol):
    """Phase 3 D1 adapter must implement these operations.

    read returns a consistent snapshot (including an accepted empty snapshot).
    replace atomically replaces BOTH lists and metadata, comparing expected time
    and requiring a strictly newer observed_at. Source/team mismatch, conflict,
    or write failure raises StoreError with no partial changes. A timestamp is
    scoped to a team/source mapping; changing a mapping is explicit configuration.
    """

    def read(self, team: TeamConfig) -> RosterSnapshot | None: ...

    def replace(self, snapshot: RosterSnapshot, expected_observed_at: datetime | None) -> None: ...


@dataclass(frozen=True)
class SyncResult:
    status: str
    snapshot: RosterSnapshot | None
    error: str | None = None


def clean_name(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


class _SectionClosures(HTMLParser):
    """Check explicit closing divs, which BeautifulSoup otherwise repairs silently."""

    def __init__(self) -> None:
        super().__init__()
        self.stack: list[str | None] = []
        self.closed: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag == "div":
            self.stack.append(dict(attrs).get("id"))

    def handle_endtag(self, tag: str) -> None:
        if tag == "div" and self.stack:
            section = self.stack.pop()
            if section in {"lGrupp", "rGrupp"}:
                self.closed.append(section)


def fetch_roster_html(team: TeamConfig) -> str:
    try:
        response = requests.get(
            team.source_url,
            timeout=30,
            allow_redirects=False,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
            stream=True,
        )
        try:
            if response.status_code != 200:
                raise ScraperError(f"SportAdmin HTTP status {response.status_code}; redirects are not followed")
            if "text/html" not in response.headers.get("Content-Type", "").lower():
                raise ScraperError("SportAdmin response is not HTML")
            parts = []
            total = 0
            for part in response.iter_content(65536):
                total += len(part)
                if total > 2 * 1024 * 1024:
                    raise ScraperError("SportAdmin HTML exceeds the size limit")
                parts.append(part)
            response._content = b"".join(parts)
            response._content_consumed = True
            # Respect an explicit charset; only detect encoding if absent.
            if "charset=" not in response.headers.get("Content-Type", "").lower():
                response.encoding = response.apparent_encoding or response.encoding
            return response.text
        finally:
            if response.raw is not None:
                response.close()
    except requests.RequestException as exc:
        # Do not include response bodies, names or private query values in logs.
        raise ScraperError(f"SportAdmin HTTP request failed ({type(exc).__name__})") from exc


def _section_names(children: list, label: str, suffix: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    names: list[str] = []
    seen: dict[str, str] = {}
    expected_details: set[str] = set()
    actual_details: set[str] = set()
    for child in children:
        if not isinstance(child, Tag):
            if clean_name(str(child)):
                raise ScraperError(f"Unexpected text in {label} section")
            continue
        if child.name != "div":
            raise ScraperError(f"Changed HTML structure in {label} section")
        if "userRow" in child.get("class", []):
            match = re.fullmatch(r"\s*\$\('#(userInfo\d{1,12}_" + suffix + r")'\)\.slideToggle\(\d+\);?\s*", child.get("onclick", ""))
            if not match:
                raise ScraperError(f"Unexpected row identity in {label} section")
            detail_id = match.group(1)
            links = child.select("table > tr > td > a, table > tbody > tr > td > a")
            if len(links) != 1:
                raise ScraperError(f"Missing or ambiguous name in {label} row")
            name = clean_name(re.sub(r"^#\d+\s+", "", clean_name(links[0].get_text(" ", strip=True))))
            if not name or len(name) > 150:
                raise ScraperError(f"Invalid name in {label} row")
            if detail_id in seen and seen[detail_id] != name:
                raise ScraperError(f"Conflicting duplicate row in {label} section")
            if detail_id not in seen:
                names.append(name)
            seen[detail_id] = name
            expected_details.add(detail_id)
        elif re.fullmatch(r"userInfo\d{1,12}_" + suffix, child.get("id", "")):
            detail_id = child["id"]
            if detail_id in actual_details:
                raise ScraperError(f"Duplicate detail block in {label} section")
            actual_details.add(detail_id)
        elif child.attrs.keys() <= {"style"} and not child.get_text(strip=True) and not child.find(True):
            # SportAdmin renders empty border dividers even when a section has
            # no rows. No other unrecognized content can prove an empty roster.
            continue
        else:
            raise ScraperError(f"Changed HTML structure in {label} section")
    if expected_details != actual_details:
        raise ScraperError(f"Incomplete {label} rows/detail blocks")
    return tuple(names), tuple(re.search(r"userInfo([0-9]+)_", key).group(1) for key in seen)


def parse_roster(html: str, team: TeamConfig, observed_at: datetime) -> RosterSnapshot:
    if not re.search(r"</body\s*>\s*</html\s*>\s*$", html, re.IGNORECASE):
        raise ScraperError("Incomplete SportAdmin document")
    soup = BeautifulSoup(html, "html.parser")
    title = clean_name(soup.title.get_text(" ", strip=True) if soup.title else "")
    if title.casefold() != f"H43 Lund - {team.team_name}".casefold():
        raise ScraperError("Unexpected SportAdmin team title")
    # Require an independent page link to the configured roster group, not
    # metadata generated from our own configuration.
    source = urlparse(team.source_url)
    if not any(
        (u := urlparse(urljoin(team.source_url, a["href"]))).hostname == source.hostname
        and u.path == "/grupp/" and parse_qs(u.query).get("ID") == [team.group_id]
        for a in soup.select("a[href]")
    ):
        raise ScraperError("Configured SportAdmin group was not found in page navigation")
    closures = _SectionClosures()
    closures.feed(html)
    if closures.closed.count("lGrupp") != 1 or closures.closed.count("rGrupp") != 1:
        raise ScraperError("Incomplete roster section boundaries")
    containers = [soup.find_all(id=section_id) for section_id in ("lGrupp", "rGrupp")]
    if any(len(found) != 1 or found[0].name != "div" for found in containers):
        raise ScraperError("Missing or ambiguous roster containers")
    # SportAdmin splits PLAYERS across both columns when the squad is long;
    # rGrupp is not synonymous with Ledare. Follow headings in column order.
    children = [child for found in containers for child in found[0].children]
    headings = [(i, clean_name(child.get_text(" ", strip=True)))
                for i, child in enumerate(children)
                if isinstance(child, Tag) and child.name in {"b", "strong", "h2", "h3", "h4"}]
    if [label for _, label in headings] not in (["Spelare", "Ledare"], ["Deltagare", "Ledare"]):
        raise ScraperError("Missing or changed Spelare/Deltagare and Ledare headings")
    start_players, start_coaches = headings[0][0], headings[1][0]
    if any(isinstance(child, Tag) or clean_name(str(child)) for child in children[:start_players]):
        raise ScraperError("Unexpected content before Spelare heading")
    players, player_ids = _section_names(children[start_players + 1:start_coaches], "Spelare", "1")
    coaches, coach_ids = _section_names(children[start_coaches + 1:], "Ledare", "2")
    if len(soup.select(".userRow")) != len(soup.select("#lGrupp .userRow, #rGrupp .userRow")):
        raise ScraperError("Roster rows found outside expected sections")
    return RosterSnapshot(team, observed_at, players, coaches, player_ids, coach_ids)


def synchronize(
    team: TeamConfig,
    store: RosterStore,
    *,
    fetch: Callable[[TeamConfig], str] = fetch_roster_html,
    clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> SyncResult:
    """Replace only after full validation. Persistence is supplied by Phase 3.

    The timestamp is captured before fetching so a slow earlier run cannot
    overwrite a later one. Failures return the prior snapshot, never an empty
    replacement. The caller must report status; no roster names are logged.
    """
    previous = None
    try:
        previous = store.read(team)
        if previous is not None and previous.team != team:
            raise StoreError("Stored snapshot belongs to a different source/team mapping")
        observed_at = clock()
        snapshot = parse_roster(fetch(team), team, observed_at)
        if previous is not None and snapshot.observed_at <= previous.observed_at:
            raise StoreError("Snapshot is not newer than stored snapshot")
        store.replace(snapshot, previous.observed_at if previous else None)
        return SyncResult(snapshot.status, snapshot)
    except (ScraperError, StoreError) as exc:
        return SyncResult("failed", previous, str(exc))


def write_payload(path: Path, snapshot: RosterSnapshot) -> None:
    """Atomic optional transport export; not a website/approval datastore."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".roster-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(snapshot.as_json(), handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a public names-only SportAdmin roster snapshot.")
    parser.add_argument("--team-id", default="p11")
    parser.add_argument("--team-name", default="P11")
    parser.add_argument("--group-id", default="378673")
    parser.add_argument("--output", type=Path, help="Optional private transport payload; never commit youth names.")
    args = parser.parse_args()
    try:
        team = TeamConfig(args.team_id, args.team_name, args.group_id)
        observed_at = datetime.now(timezone.utc)
        snapshot = parse_roster(fetch_roster_html(team), team, observed_at)
        if args.output:
            write_payload(args.output, snapshot)
        print(json.dumps({"status": snapshot.status, "team_id": team.team_id,
                          "players": len(snapshot.players), "coaches": len(snapshot.coaches)}))
        return 0
    except (ScraperError, ValueError, OSError) as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
