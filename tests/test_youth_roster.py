"""Synthetic fixtures only: these tests do not publish or fetch youth names."""

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from bs4 import BeautifulSoup

from h43_scraper.sportadmin import ScraperError
from h43_scraper.youth_roster import (
    RosterSnapshot, StoreError, TeamConfig, fetch_roster_html, main,
    parse_roster, synchronize, write_payload,
)


TEAM = TeamConfig()
NOW = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)
FIXTURE = Path(__file__).parent / "fixtures" / "sportadmin_youth_sample.html"


@pytest.fixture
def html():
    return FIXTURE.read_text(encoding="utf-8")


def section_update(html, label, names):
    """Keep the observed container and headings; replace only synthetic rows."""
    soup = BeautifulSoup(html, "html.parser")
    section_id, suffix = ("lGrupp", "1") if label == "Spelare" else ("rGrupp", "2")
    section = soup.find(id=section_id)
    section.clear()
    section.append(BeautifulSoup(f"<b>{label}</b><div style='border-top:1px solid #CCC;'></div>", "html.parser"))
    for i, name in enumerate(names, 500):
        row = BeautifulSoup(
            f'''<div class="userRow" onclick="$('#userInfo{i}_{suffix}').slideToggle(100);"><table><tr><td><a></a></td></tr></table></div><div id="userInfo{i}_{suffix}" style="display:none"></div>''',
            "html.parser",
        )
        row.a.string = name
        section.append(row)
    return str(soup)


class MemoryStore:
    """Test double only. There is no operational in-memory roster backend."""

    def __init__(self, snapshot=None):
        self.snapshot = snapshot
        self.writes = 0
        self.fail = False
        self.conflict = False

    def read(self, team):
        return self.snapshot

    def replace(self, snapshot, expected_observed_at):
        if self.fail:
            raise StoreError("Storage unavailable")
        current = self.snapshot.observed_at if self.snapshot else None
        if self.conflict or current != expected_observed_at:
            raise StoreError("Concurrent snapshot conflict")
        if current is not None and snapshot.observed_at <= current:
            raise StoreError("Stale snapshot")
        self.snapshot = snapshot
        self.writes += 1


def test_extracts_swedish_players_and_coaches_names_only(html):
    snapshot = parse_roster(html, TEAM, NOW)
    assert snapshot.players == ("Åsa Öberg", "Björn Äng")
    assert snapshot.coaches == ("Coach Exempel",)
    payload = snapshot.as_json()
    assert payload["players"] == [{"name": "Åsa Öberg", "sourceId": "100"}, {"name": "Björn Äng", "sourceId": "101"}]
    assert payload["coaches"] == [{"name": "Coach Exempel", "sourceId": "200"}]
    assert payload["observed_at"] == "2026-11-11T12:00:00Z"
    assert payload["team"]["sportadmin_group_id"] == "378673"
    assert snapshot.status == "success"


def test_players_continue_in_right_column_before_ledare_heading(html):
    soup = BeautifulSoup(html, "html.parser")
    right = soup.find(id="rGrupp")
    row = soup.select("#lGrupp .userRow")[1].extract()
    detail = soup.find(id="userInfo101_1").extract()
    right.insert(0, detail)
    right.insert(0, row)
    snapshot = parse_roster(str(soup), TEAM, NOW)
    assert snapshot.players == ("Åsa Öberg", "Björn Äng")
    assert snapshot.coaches == ("Coach Exempel",)


def test_coaches_can_share_right_column_with_all_players(html):
    soup = BeautifulSoup(html, "html.parser")
    left, right = soup.find(id="lGrupp"), soup.find(id="rGrupp")
    # Only the heading is left in the first column; membership follows it into
    # the right column. Empty column does not mean an empty player section.
    children = list(left.children)
    marker = next(child for child in children if getattr(child, "name", None) == "b")
    for child in reversed(children[children.index(marker) + 1:]):
        right.insert(0, child.extract())
    assert parse_roster(str(soup), TEAM, NOW).players == ("Åsa Öberg", "Björn Äng")


@pytest.mark.parametrize("label,field,names", [
    ("Spelare", "players", ("Åsa Öberg", "Björn Äng", "Ny Spelare")),
    ("Spelare", "players", ("Åsa Öberg",)),
    ("Ledare", "coaches", ("Coach Exempel", "Ny Ledare")),
    ("Ledare", "coaches", ()),
    ("Spelare", "players", ()),
])
def test_successful_sync_replaces_membership_without_approval(html, label, field, names):
    old = parse_roster(html, TEAM, NOW)
    store = MemoryStore(old)
    result = synchronize(TEAM, store, fetch=lambda _: section_update(html, label, names),
                         clock=lambda: NOW + timedelta(hours=6))
    assert result.status == "success"
    assert getattr(store.snapshot, field) == names
    other = "players" if field == "coaches" else "coaches"
    assert getattr(store.snapshot, other) == getattr(old, other)
    assert store.writes == 1


def test_verified_empty_roster_is_a_successful_replacement(html):
    store = MemoryStore(parse_roster(html, TEAM, NOW))
    empty = section_update(section_update(html, "Spelare", ()), "Ledare", ())
    result = synchronize(TEAM, store, fetch=lambda _: empty, clock=lambda: NOW + timedelta(hours=6))
    assert result.status == "empty"
    assert result.error is None
    assert store.snapshot.players == store.snapshot.coaches == ()
    assert store.writes == 1


@pytest.mark.parametrize("mutate", [
    lambda h: h.replace('id="lGrupp"', 'id="missing"'),
    lambda h: h.replace('id="rGrupp"', 'id="missing"'),
    lambda h: h.replace("Spelare</b>", "Unknown</b>"),
    lambda h: h.replace('class="userRow"', 'class="changedRow"'),
    lambda h: h.replace("<a>Björn Äng</a>", "<span>Björn Äng</span>"),
    lambda h: h.replace('id="userInfo101_1"', 'id="missing-detail"'),
    lambda h: h.replace("userInfo101_1').slideToggle", "userInfo101_2').slideToggle"),
    lambda h: h.replace("</body></html>", ""),
    lambda h: h.replace("</div>\n</main>", "\n</main>"),
    lambda h: h.replace("<title>H43 Lund - P11</title>", "<title>H43 Lund - P12</title>"),
    lambda h: h.replace("ID=378673", "ID=999"),
    lambda h: h.replace('<b>Ledare</b>', '<b>Ledare</b><p>Laddar...</p>'),
    lambda h: h.replace("<a>Björn Äng</a>", "<a>  </a>"),
    lambda h: h.replace("</main>", '<div class="userRow"></div></main>'),
])
def test_failed_or_changed_markup_retains_last_good_roster(html, mutate):
    old = parse_roster(html, TEAM, NOW)
    store = MemoryStore(old)
    result = synchronize(TEAM, store, fetch=lambda _: mutate(html), clock=lambda: NOW + timedelta(hours=6))
    assert result.status == "failed"
    assert result.error
    assert result.snapshot is old
    assert store.snapshot is old
    assert store.writes == 0


def test_headings_without_expected_section_containers_are_not_empty(html):
    with pytest.raises(ScraperError):
        parse_roster(html.replace('id="lGrupp"', 'id="other"'), TEAM, NOW)


def test_duplicate_names_for_different_source_rows_are_preserved(html):
    snapshot = parse_roster(section_update(html, "Spelare", ("Sam Namn", "Sam Namn")), TEAM, NOW)
    assert snapshot.players == ("Sam Namn", "Sam Namn")


def test_repeated_same_source_row_is_deduplicated(html):
    soup = BeautifulSoup(html, "html.parser")
    row = soup.select_one("#lGrupp .userRow")
    row.insert_after(BeautifulSoup(str(row), "html.parser"))
    assert parse_roster(str(soup), TEAM, NOW).players == ("Åsa Öberg", "Björn Äng")


def test_conflicting_names_for_same_source_id_are_rejected(html):
    soup = BeautifulSoup(html, "html.parser")
    row = soup.select_one("#lGrupp .userRow")
    duplicate = BeautifulSoup(str(row), "html.parser")
    duplicate.a.string = "Annat Namn"
    row.insert_after(duplicate)
    with pytest.raises(ScraperError, match="Conflicting"):
        parse_roster(str(soup), TEAM, NOW)


def test_unicode_normalization_and_whitespace(html):
    updated = section_update(html, "Spelare", ("  A\u030asa\u00a0\n O\u0308berg  ", "#12 Björn Äng"))
    assert parse_roster(updated, TEAM, NOW).players == ("Åsa Öberg", "Björn Äng")


@pytest.mark.parametrize("names", [("",), ("X" * 151,), ("  Namn",), ["Namn"]])
def test_snapshot_rejects_invalid_or_mutable_name_lists(names):
    with pytest.raises(ValueError):
        RosterSnapshot(TEAM, NOW, names, ())


def test_snapshot_rejects_unzoned_time():
    with pytest.raises(ValueError):
        RosterSnapshot(TEAM, NOW.replace(tzinfo=None), (), ())


def test_future_group_and_team_are_configurable(html):
    team = TeamConfig("p12", "P12", "123456")
    updated = html.replace("P11", "P12").replace("378673", "123456")
    snapshot = parse_roster(updated, team, NOW)
    assert snapshot.team.group_id == "123456"
    assert snapshot.team.source_url.endswith("ID=123456")


@pytest.mark.parametrize("kwargs", [{"group_id": "1&ID=2"}, {"team_id": "../p11"}, {"team_name": " "}])
def test_invalid_team_configuration_rejected(kwargs):
    with pytest.raises(ValueError):
        TeamConfig(**kwargs)


@pytest.mark.parametrize("exc", [requests.Timeout(), requests.ConnectionError(), requests.HTTPError()])
def test_http_failure_is_reported_and_retains_roster(html, monkeypatch, exc):
    def fail(*args, **kwargs):
        raise exc
    monkeypatch.setattr(requests, "get", fail)
    old = parse_roster(html, TEAM, NOW)
    store = MemoryStore(old)
    result = synchronize(TEAM, store, clock=lambda: NOW + timedelta(hours=6))
    assert result.status == "failed"
    assert "HTTP request failed" in result.error
    assert store.snapshot is old
    assert store.writes == 0


@pytest.mark.parametrize("status,content", [(403, "text/html"), (500, "text/html"), (302, "text/html"), (200, "application/json")])
def test_unexpected_http_response_is_rejected(monkeypatch, status, content):
    response = requests.Response()
    response.status_code = status
    response.headers["Content-Type"] = content
    monkeypatch.setattr(requests, "get", lambda *a, **kw: response)
    with pytest.raises(ScraperError):
        fetch_roster_html(TEAM)


def test_declared_swedish_encoding_and_fetch_options(html, monkeypatch):
    response = requests.Response()
    response.status_code = 200
    response._content = html.encode("iso-8859-1")
    response._content_consumed = True
    response.encoding = "iso-8859-1"
    response.headers["Content-Type"] = "text/html; charset=iso-8859-1"
    def get(url, **kwargs):
        assert url == TEAM.source_url
        assert kwargs["allow_redirects"] is False
        assert kwargs["timeout"] == 30
        return response
    monkeypatch.setattr(requests, "get", get)
    assert parse_roster(fetch_roster_html(TEAM), TEAM, NOW).players[1] == "Björn Äng"


def test_sportadmin_html_response_has_a_size_limit(monkeypatch):
    response = requests.Response()
    response.status_code = 200
    response.headers["Content-Type"] = "text/html"
    response._content = b"x" * (2 * 1024 * 1024 + 1)
    response._content_consumed = True
    monkeypatch.setattr(requests, "get", lambda *a, **kw: response)
    with pytest.raises(ScraperError, match="size limit"):
        fetch_roster_html(TEAM)


@pytest.mark.parametrize("mode", ["failure", "conflict", "stale", "wrong-team"])
def test_storage_failure_and_stale_runs_cannot_replace_snapshot(html, mode):
    old = parse_roster(html, TEAM, NOW)
    if mode == "wrong-team":
        old = replace(old, team=TeamConfig("p12", "P12", "123"))
    store = MemoryStore(old)
    store.fail = mode == "failure"
    store.conflict = mode == "conflict"
    at = NOW if mode == "stale" else NOW + timedelta(hours=6)
    result = synchronize(TEAM, store, fetch=lambda _: section_update(html, "Spelare", ()), clock=lambda: at)
    assert result.status == "failed"
    assert store.snapshot is old
    assert store.writes == 0


def test_first_snapshot_and_empty_snapshot_are_distinct_from_no_snapshot(html):
    store = MemoryStore()
    empty = section_update(section_update(html, "Spelare", ()), "Ledare", ())
    result = synchronize(TEAM, store, fetch=lambda _: empty, clock=lambda: NOW)
    assert result.status == "empty"
    assert store.snapshot is not None


def test_payload_export_is_utf8_and_atomic(html, tmp_path, monkeypatch):
    snapshot = parse_roster(html, TEAM, NOW)
    path = tmp_path / "payload.json"
    write_payload(path, snapshot)
    previous = path.read_bytes()
    assert "Åsa Öberg" in path.read_text(encoding="utf-8")
    def fail(*a):
        raise OSError("Failed replacement")
    monkeypatch.setattr("h43_scraper.youth_roster.os.replace", fail)
    with pytest.raises(OSError):
        write_payload(path, replace(snapshot, players=(), player_ids=()))
    assert path.read_bytes() == previous
    assert list(tmp_path.iterdir()) == [path]


def test_cli_failure_does_not_overwrite_payload(html, tmp_path, monkeypatch, capsys):
    path = tmp_path / "payload.json"
    path.write_text("last good payload", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["scrape_youth_roster", "--output", str(path)])
    monkeypatch.setattr("h43_scraper.youth_roster.fetch_roster_html", lambda _: "bad HTML")
    assert main() == 1
    assert path.read_text(encoding="utf-8") == "last good payload"
    assert '"status": "failed"' in capsys.readouterr().out


def test_cli_reports_counts_without_names(html, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["scrape_youth_roster"])
    monkeypatch.setattr("h43_scraper.youth_roster.fetch_roster_html", lambda _: html)
    assert main() == 0
    output = capsys.readouterr().out
    assert '"players": 2' in output
    assert '"coaches": 1' in output
    assert "Öberg" not in output


def test_deltagare_heading_is_supported_without_weakening_validation(html):
    adapted = html.replace('>Spelare<', '>Deltagare<')
    original = parse_roster(html, TEAM, NOW)
    actual = parse_roster(adapted, TEAM, NOW)
    assert actual.players == original.players
    assert actual.coaches == original.coaches
    with pytest.raises(ScraperError):
        parse_roster(adapted.replace('>Deltagare<', '>Unknown<'), TEAM, NOW)
    with pytest.raises(ScraperError):
        parse_roster(adapted.replace('</html>', ''), TEAM, NOW)


def test_member_identity_is_not_row_position_and_duplicate_names_keep_distinct_ids(html):
    original = parse_roster(html, TEAM, NOW)
    assert original.player_ids == ("100", "101")
    assert original.coach_ids == ("200",)
    changed = BeautifulSoup(html, "html.parser")
    changed.select_one("#lGrupp .userRow a").string = "Björn Äng"
    roster = parse_roster(str(changed), TEAM, NOW)
    assert roster.players == ("Björn Äng", "Björn Äng")
    assert roster.player_ids == original.player_ids
    assert [p["sourceId"] for p in roster.as_json()["players"]] == ["100", "101"]


def test_legacy_name_only_snapshots_remain_valid():
    assert RosterSnapshot(TEAM, NOW, ("Testperson",), ()).as_json()["players"] == [{"name": "Testperson"}]
