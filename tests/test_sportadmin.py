from pathlib import Path

import pytest

from h43_scraper.sportadmin import (
    ScraperError,
    build_document,
    parse_coaches,
    parse_players,
    parse_squad,
    validate_document,
)


FIXTURE = Path(__file__).parent / "fixtures" / "sportadmin_h43_sample.html"


def test_parse_public_players_from_fixture():
    players = parse_players(FIXTURE.read_text(encoding="utf-8"))

    assert [player.name for player in players] == ["Olof Lundahl Olsson", "Alvin Persson"]
    assert players[0].number == "31"
    assert players[0].position == "H6"
    assert players[0].age == 25
    assert players[0].profile_url is None
    assert players[1].position is None
    assert players[1].age == 18
    assert players[1].image_url == "https://publicpages.sportadmin.se/api/file/squad/9799/101?a=491&g=token"


def test_parse_public_coaches_from_fixture():
    coaches = parse_coaches(FIXTURE.read_text(encoding="utf-8"))

    assert len(coaches) == 1
    assert coaches[0].name == "Coach Example"
    assert coaches[0].role is None
    assert coaches[0].age == 40
    assert coaches[0].image_url == "https://publicpages.sportadmin.se/api/file/squad/9799/200?a=491&g=token"


def test_build_document_contains_players_and_coaches():
    players, coaches = parse_squad(FIXTURE.read_text(encoding="utf-8"))
    document = build_document(players, coaches)

    assert document["schema_version"] == 3
    assert document["players"][0]["number"] == "31"
    assert [player["name"] for player in document["players"]] == [
        "Olof Lundahl Olsson",
        "Alvin Persson",
    ]
    assert [coach["name"] for coach in document["coaches"]] == ["Coach Example"]


def test_validation_rejects_large_count_drop():
    players, coaches = parse_squad(FIXTURE.read_text(encoding="utf-8"))
    document = build_document(players[:1], coaches)
    previous = build_document(players * 4, coaches)

    with pytest.raises(ScraperError, match="dropped suspiciously"):
        validate_document(document, previous)


def test_parser_requires_expected_page_markers():
    with pytest.raises(ScraperError, match="expected H43 Lund"):
        parse_players("<html><title>Other</title><body>SportAdmin Spelare</body></html>")
