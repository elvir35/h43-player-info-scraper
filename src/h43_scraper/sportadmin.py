from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag

SOURCE_URL = "https://h43lund.web.sportadmin.se/grupp/?ID=125511"
GROUP_ID = "125511"
CLUB_NAME = "H43 Lund"
TEAM_NAME = "Herrar A"
SPORTADMIN_SUFFIX_PLAYERS = "_1"
SPORTADMIN_SUFFIX_COACHES = "_2"
MIN_PLAYERS = 1
MIN_COACHES = 1
MAX_COUNT_REDUCTION_RATIO = 0.35
USER_AGENT = (
    "h43-lund-player-scraper/0.1 "
    "(public SportAdmin page scraper; contact via repository issues)"
)
DETAIL_LABELS = {"Nummer", "Position", "Roll", "Ålder", "Moderklubb", "Smeknamn"}


class ScraperError(RuntimeError):
    """Raised when the public SportAdmin page cannot be safely scraped."""


@dataclass(frozen=True)
class Player:
    name: str
    number: str
    position: str | None
    age: int | None
    image_url: str | None
    profile_url: str | None

    def as_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "number": self.number,
            "position": self.position,
            "age": self.age,
            "image_url": self.image_url,
            "profile_url": self.profile_url,
        }


@dataclass(frozen=True)
class Coach:
    name: str
    role: str | None
    age: int | None
    image_url: str | None
    profile_url: str | None

    def as_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "role": self.role,
            "age": self.age,
            "image_url": self.image_url,
            "profile_url": self.profile_url,
        }


def fetch_html(url: str = SOURCE_URL, timeout: int = 30) -> str:
    response = requests.get(
        url,
        timeout=timeout,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
    )
    if not response.ok:
        raise ScraperError(f"SportAdmin request failed with HTTP {response.status_code}")
    response.encoding = response.apparent_encoding or response.encoding
    return response.text


def parse_players(html: str, source_url: str = SOURCE_URL) -> list[Player]:
    soup = BeautifulSoup(html, "html.parser")
    assert_expected_page(soup)

    players: list[Player] = []
    for row in soup.select("div.userRow[onclick]"):
        detail_id = _detail_id_from_onclick(row.get("onclick", ""))
        if not detail_id or not detail_id.endswith(SPORTADMIN_SUFFIX_PLAYERS):
            continue

        detail = soup.find(id=detail_id)
        if not isinstance(detail, Tag):
            continue

        visible = _visible_row_fields(row, source_url)
        details = _detail_fields(detail)
        number = _normalize_number(details.get("Nummer") or "")
        name = _normalize_name(visible.get("name", ""), number)
        position = _clean_text(details.get("Position") or visible.get("position") or "")
        age = _parse_age(details.get("Ålder") or visible.get("age") or "")
        image_url = _best_image_url(detail, row, source_url)

        if not name:
            raise ScraperError(f"Found player row without a name in detail block {detail_id}")

        players.append(
            Player(
                name=name,
                number=number or "-",
                position=position or None,
                age=age,
                image_url=image_url,
                profile_url=_profile_url(row, source_url),
            )
        )

    players = _dedupe_players(players)
    if len(players) < MIN_PLAYERS:
        raise ScraperError("No public player entries were found on the SportAdmin page")
    return players


def parse_coaches(html: str, source_url: str = SOURCE_URL) -> list[Coach]:
    soup = BeautifulSoup(html, "html.parser")
    assert_expected_page(soup)

    coaches: list[Coach] = []
    for row in soup.select("div.userRow[onclick]"):
        detail_id = _detail_id_from_onclick(row.get("onclick", ""))
        if not detail_id or not detail_id.endswith(SPORTADMIN_SUFFIX_COACHES):
            continue

        detail = soup.find(id=detail_id)
        if not isinstance(detail, Tag):
            continue

        visible = _visible_row_fields(row, source_url)
        details = _detail_fields(detail)
        name = _normalize_name(visible.get("name", ""), details.get("Nummer"))
        role = _clean_text(details.get("Roll") or visible.get("position") or "")
        age = _parse_age(details.get("Ålder") or visible.get("age") or "")
        image_url = _best_image_url(detail, row, source_url)

        if not name:
            raise ScraperError(f"Found coach row without a name in detail block {detail_id}")

        coaches.append(
            Coach(
                name=name,
                role=role or None,
                age=age,
                image_url=image_url,
                profile_url=_profile_url(row, source_url),
            )
        )

    coaches = _dedupe_coaches(coaches)
    if len(coaches) < MIN_COACHES:
        raise ScraperError("No public coach/leader entries were found on the SportAdmin page")
    return coaches


def parse_squad(html: str, source_url: str = SOURCE_URL) -> tuple[list[Player], list[Coach]]:
    soup = BeautifulSoup(html, "html.parser")
    assert_expected_page(soup)
    return _parse_players_from_soup(soup, source_url), _parse_coaches_from_soup(soup, source_url)


def _parse_players_from_soup(soup: BeautifulSoup, source_url: str) -> list[Player]:
    players: list[Player] = []
    for row in soup.select("div.userRow[onclick]"):
        detail_id = _detail_id_from_onclick(row.get("onclick", ""))
        if not detail_id or not detail_id.endswith(SPORTADMIN_SUFFIX_PLAYERS):
            continue

        detail = soup.find(id=detail_id)
        if not isinstance(detail, Tag):
            continue

        visible = _visible_row_fields(row, source_url)
        details = _detail_fields(detail)
        number = _normalize_number(details.get("Nummer") or "")
        name = _normalize_name(visible.get("name", ""), number)
        position = _clean_text(details.get("Position") or visible.get("position") or "")
        age = _parse_age(details.get("Ålder") or visible.get("age") or "")
        image_url = _best_image_url(detail, row, source_url)

        if not name:
            raise ScraperError(f"Found player row without a name in detail block {detail_id}")

        players.append(
            Player(
                name=name,
                number=number or "-",
                position=position or None,
                age=age,
                image_url=image_url,
                profile_url=_profile_url(row, source_url),
            )
        )

    players = _dedupe_players(players)
    if len(players) < MIN_PLAYERS:
        raise ScraperError("No public player entries were found on the SportAdmin page")
    return players


def _parse_coaches_from_soup(soup: BeautifulSoup, source_url: str) -> list[Coach]:
    coaches: list[Coach] = []
    for row in soup.select("div.userRow[onclick]"):
        detail_id = _detail_id_from_onclick(row.get("onclick", ""))
        if not detail_id or not detail_id.endswith(SPORTADMIN_SUFFIX_COACHES):
            continue

        detail = soup.find(id=detail_id)
        if not isinstance(detail, Tag):
            continue

        visible = _visible_row_fields(row, source_url)
        details = _detail_fields(detail)
        name = _normalize_name(visible.get("name", ""), details.get("Nummer"))
        role = _clean_text(details.get("Roll") or visible.get("position") or "")
        age = _parse_age(details.get("Ålder") or visible.get("age") or "")
        image_url = _best_image_url(detail, row, source_url)

        if not name:
            raise ScraperError(f"Found coach row without a name in detail block {detail_id}")

        coaches.append(
            Coach(
                name=name,
                role=role or None,
                age=age,
                image_url=image_url,
                profile_url=_profile_url(row, source_url),
            )
        )

    coaches = _dedupe_coaches(coaches)
    if len(coaches) < MIN_COACHES:
        raise ScraperError("No public coach/leader entries were found on the SportAdmin page")
    return coaches


def build_document(players: list[Player], coaches: list[Coach] | None = None) -> dict[str, Any]:
    return {
        "schema_version": 3,
        "group": {
            "club": CLUB_NAME,
            "team": TEAM_NAME,
            "sportadmin_group_id": GROUP_ID,
            "source_url": SOURCE_URL,
        },
        "players": [player.as_json() for player in players],
        "coaches": [coach.as_json() for coach in coaches or []],
    }


def validate_document(document: dict[str, Any], previous: dict[str, Any] | None = None) -> None:
    if document.get("schema_version") != 3:
        raise ScraperError("players.json schema_version must be 3")

    group = document.get("group")
    if not isinstance(group, dict):
        raise ScraperError("players.json must contain group metadata")
    if group.get("source_url") != SOURCE_URL or group.get("sportadmin_group_id") != GROUP_ID:
        raise ScraperError("players.json does not describe the expected H43 Lund SportAdmin group")

    players = document.get("players")
    if not isinstance(players, list) or not players:
        raise ScraperError("players.json must contain at least one player")

    coaches = document.get("coaches")
    if not isinstance(coaches, list) or not coaches:
        raise ScraperError("players.json must contain at least one coach")

    _validate_people(players, "Player", "position")
    _validate_people(coaches, "Coach", "role")

    if previous:
        _validate_count_drop(previous, "players", players, "Player")
        _validate_count_drop(previous, "coaches", coaches, "Coach")


def _validate_people(people: list[Any], label: str, role_key: str) -> None:
    seen: set[tuple[Any, ...]] = set()
    for index, person in enumerate(people):
        if not isinstance(person, dict):
            raise ScraperError(f"{label} #{index + 1} must be an object")
        if not _clean_text(str(person.get("name") or "")):
            raise ScraperError(f"{label} #{index + 1} is missing a name")
        key = (
            _identity_text(str(person.get("name") or "")),
            person.get("number"),
            person.get(role_key),
            person.get("age"),
        )
        if key in seen:
            raise ScraperError(f"Duplicate {label.lower()} remains after normalization: {person.get('name')}")
        seen.add(key)


def _validate_count_drop(previous: dict[str, Any], key: str, current: list[Any], label: str) -> None:
    if isinstance(previous.get(key), list):
        previous_count = len(previous[key])
        current_count = len(current)
        if previous_count > 0 and current_count < previous_count * (1 - MAX_COUNT_REDUCTION_RATIO):
            raise ScraperError(
                f"{label} count dropped suspiciously: "
                f"{previous_count} previously, {current_count} now"
            )


def scrape_to_file(output_path: Path, source_url: str = SOURCE_URL) -> dict[str, Any]:
    html = fetch_html(source_url)
    players, coaches = parse_squad(html, source_url)
    document = build_document(players, coaches)
    previous = _read_json_if_exists(output_path)
    validate_document(document, previous)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    return document


def assert_expected_page(soup: BeautifulSoup) -> None:
    title = _clean_text(soup.title.get_text(" ", strip=True) if soup.title else "")
    page_text = _clean_text(soup.get_text(" ", strip=True))
    if "SportAdmin" not in page_text and not soup.select_one("div.userRow[onclick]"):
        raise ScraperError("The response does not look like a SportAdmin public page")
    if CLUB_NAME not in page_text or "Truppen" not in page_text or "Spelare" not in page_text:
        raise ScraperError("The expected H43 Lund squad page markers were not found")
    if TEAM_NAME.upper() not in title.upper() and TEAM_NAME not in page_text:
        raise ScraperError("The expected H43 Lund Herrar A group was not detected")


def _visible_row_fields(row: Tag, source_url: str) -> dict[str, str | None]:
    name_link = row.select_one("td a")
    image = row.select_one("img[src]")
    spans = [_clean_text(span.get_text(" ", strip=True)) for span in row.select("span")]
    return {
        "name": _clean_text(name_link.get_text(" ", strip=True)) if name_link else "",
        "position": spans[0].replace("\xa0", " ").strip() if spans else "",
        "age": next((span for span in spans if "år" in span), ""),
        "image_url": urljoin(source_url, image.get("src", "")) if image else None,
    }


def _detail_fields(detail: Tag) -> dict[str, str]:
    fields: dict[str, str] = {}
    for row in detail.select("tr.borderBtm"):
        parts = [_clean_text(part) for part in row.get_text("\n", strip=True).split("\n")]
        parts = [part for part in parts if part]
        index = 0
        while index < len(parts):
            label = parts[index]
            if label not in DETAIL_LABELS:
                index += 1
                continue

            value_parts: list[str] = []
            index += 1
            while index < len(parts) and parts[index] not in DETAIL_LABELS:
                value_parts.append(parts[index])
                index += 1

            value = _clean_text(" ".join(value_parts))
            if value:
                fields[label] = value
    return fields


def _detail_id_from_onclick(onclick: str) -> str | None:
    match = re.search(r"#(userInfo[0-9]+_[0-9]+)", onclick)
    return match.group(1) if match else None


def _best_image_url(detail: Tag, row: Tag, source_url: str) -> str | None:
    detail_image = detail.select_one("img[src]")
    row_image = row.select_one("img[src]")
    src = ""
    if detail_image:
        src = detail_image.get("src", "")
    if (not src or "buddy.png" in src) and row_image:
        src = row_image.get("src", "")
    return urljoin(source_url, src) if src else None


def _profile_url(row: Tag, source_url: str) -> str | None:
    link = row.select_one("a[href]")
    if not link:
        return None
    href = _clean_text(link.get("href", ""))
    if not href or href.startswith("javascript:") or href == "#":
        return None
    return urljoin(source_url, href)


def _normalize_name(raw_name: str, number: str | None = None) -> str:
    name = _clean_text(raw_name)
    if number:
        number_pattern = re.escape(_normalize_number(number))
        name = re.sub(rf"^#?{number_pattern}\s*", "", name)
    name = re.sub(r"^#\d+\s+", "", name)
    return _clean_text(name)


def _normalize_number(raw_number: str) -> str:
    match = re.search(r"#?\s*(\d+)", raw_number or "")
    return match.group(1) if match else ""


def _parse_age(raw_age: str) -> int | None:
    match = re.search(r"\d+", raw_age or "")
    return int(match.group(0)) if match else None


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def _identity_text(value: str) -> str:
    return _clean_text(value).casefold()


def _dedupe_players(players: list[Player]) -> list[Player]:
    seen: set[tuple[str, str | None, str | None, int | None]] = set()
    unique: list[Player] = []
    for player in players:
        key = (_identity_text(player.name), player.number, player.position, player.age)
        if key in seen:
            continue
        seen.add(key)
        unique.append(player)
    return unique


def _dedupe_coaches(coaches: list[Coach]) -> list[Coach]:
    seen: set[tuple[str, str | None, int | None]] = set()
    unique: list[Coach] = []
    for coach in coaches:
        key = (_identity_text(coach.name), coach.role, coach.age)
        if key in seen:
            continue
        seen.add(key)
        unique.append(coach)
    return unique


def _read_json_if_exists(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape public H43 Lund players from SportAdmin.")
    parser.add_argument("--output", type=Path, default=Path("data/players.json"))
    parser.add_argument("--source-url", default=SOURCE_URL)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    if args.validate_only:
        document = _read_json_if_exists(args.output)
        if document is None:
            raise ScraperError(f"{args.output} does not exist")
        validate_document(document)
        print(
            f"Validated {len(document['players'])} players and "
            f"{len(document['coaches'])} coaches in {args.output}"
        )
        return 0

    document = scrape_to_file(args.output, args.source_url)
    print(
        f"Wrote {len(document['players'])} players and "
        f"{len(document['coaches'])} coaches to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
