import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests

from h43_scraper.cloudflare import CloudflareRosterStore, main
from h43_scraper.youth_roster import StoreError, TeamConfig, parse_roster, synchronize


TEAM = TeamConfig()
NOW = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)
TOKEN = secrets.token_urlsafe(32)  # test-only credential, no real secret
HTML = (Path(__file__).parent / "fixtures/sportadmin_youth_sample.html").read_text(encoding="utf-8")


class Response:
    def __init__(self, value, status=200, content_type="application/json"):
        self.content = json.dumps(value).encode("utf-8")
        self.status_code = status
        self.headers = {"Content-Type": content_type}
        self.closed = False

    def iter_content(self, size):
        yield self.content

    def close(self):
        self.closed = True


def test_http_store_matches_snapshot_contract_and_bound_credentials(monkeypatch):
    old = parse_roster(HTML, TEAM, NOW)
    new = parse_roster(HTML, TEAM, NOW + timedelta(hours=6))
    calls = []

    def request(method, url, **kwargs):
        assert kwargs["headers"]["Authorization"] == f"Bearer {TOKEN}"
        assert kwargs["allow_redirects"] is False
        assert kwargs["timeout"] == 30
        assert kwargs["stream"] is True
        assert url == "https://api.test/api/v1/internal/teams/p11/roster"
        calls.append((method, kwargs["json"]))
        return Response({"season": "test-season", "snapshot": old.as_json()}) if method == "GET" else Response({"status": "success"})

    monkeypatch.setattr(requests, "request", request)
    store = CloudflareRosterStore("https://api.test", TOKEN)
    assert store.read(TEAM) == old
    store.replace(new, old.observed_at)
    assert calls[1][1] == {"season": "test-season", "snapshot": new.as_json(), "expectedObservedAt": "2026-11-11T12:00:00Z"}


@pytest.mark.parametrize("base", ["http://api.test", "https://user:pass@api.test", "https://api.test/redirect", "https://api.test?token=secret"])
def test_credentials_cannot_be_sent_to_insecure_or_ambiguous_origins(base):
    with pytest.raises(StoreError):
        CloudflareRosterStore(base, TOKEN)


def test_loopback_http_requires_explicit_opt_in():
    with pytest.raises(StoreError):
        CloudflareRosterStore("http://127.0.0.1:8787", TOKEN)
    CloudflareRosterStore("http://127.0.0.1:8787", TOKEN, allow_local_http=True)
    with pytest.raises(StoreError):
        CloudflareRosterStore("http://api.test", TOKEN, allow_local_http=True)


@pytest.mark.parametrize("status", [301, 401, 403, 409, 500])
def test_http_failures_do_not_expose_server_bodies_or_secrets(monkeypatch, status):
    response = Response({"detail": "private infrastructure"}, status)
    monkeypatch.setattr(requests, "request", lambda *a, **kw: response)
    with pytest.raises(StoreError) as error:
        CloudflareRosterStore("https://api.test", TOKEN).read(TEAM)
    assert "private infrastructure" not in str(error.value)
    assert TOKEN not in str(error.value)
    assert response.closed


def test_network_failure_diagnostics_do_not_echo_exception_message(monkeypatch):
    def fail(*a, **kw):
        raise requests.ConnectionError("accidental secret " + TOKEN)
    monkeypatch.setattr(requests, "request", fail)
    with pytest.raises(StoreError) as error:
        CloudflareRosterStore("https://api.test", TOKEN).read(TEAM)
    assert TOKEN not in str(error.value)


@pytest.mark.parametrize("value", [
    {"season": None, "snapshot": None},
    {"season": "test-season", "snapshot": {"schema_version": 2}},
    {"season": "test-season", "snapshot": {"schema_version": 1}},
    {"season": "test-season", "snapshot": None, "unknown": True},
])
def test_malformed_or_unconfigured_private_state_fails_closed(monkeypatch, value):
    monkeypatch.setattr(requests, "request", lambda *a, **kw: Response(value))
    with pytest.raises(StoreError):
        CloudflareRosterStore("https://api.test", TOKEN).read(TEAM)


def test_wrong_source_response_cannot_be_written_back(monkeypatch):
    payload = parse_roster(HTML, TEAM, NOW).as_json()
    payload["team"]["id"] = "other"
    monkeypatch.setattr(requests, "request", lambda *a, **kw: Response({"season": "test-season", "snapshot": payload}))
    with pytest.raises(StoreError):
        CloudflareRosterStore("https://api.test", TOKEN).read(TEAM)


def test_failed_scrape_retains_cloudflare_state_without_put(monkeypatch):
    old = parse_roster(HTML, TEAM, NOW)
    calls = []
    def request(method, *args, **kwargs):
        calls.append(method)
        return Response({"season": "test-season", "snapshot": old.as_json()})
    monkeypatch.setattr(requests, "request", request)
    result = synchronize(TEAM, CloudflareRosterStore("https://api.test", TOKEN), fetch=lambda _: "bad HTML")
    assert result.status == "failed"
    assert result.snapshot == old
    assert calls == ["GET"]


def test_failure_reporting_contains_only_attempt_metadata(monkeypatch):
    calls = []
    def request(method, url, **kwargs):
        calls.append((url, kwargs["json"]))
        return Response({"season": "test-season", "snapshot": None}) if method == "GET" else Response({"status": "recorded"})
    monkeypatch.setattr(requests, "request", request)
    store = CloudflareRosterStore("https://api.test", TOKEN)
    assert store.read(TEAM) is None
    store.report_failure(TEAM, NOW)
    assert calls[1][0].endswith("/failure")
    assert calls[1][1] == {"season": "test-season", "attemptedAt": "2026-11-11T12:00:00Z"}


def test_cli_requires_secret_environment_without_printing_it(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["sync_youth_roster"])
    monkeypatch.setenv("H43_API_URL", "https://api.test")
    monkeypatch.setenv("H43_INGEST_TOKEN", "invalid")
    assert main() == 1
    output = capsys.readouterr().out
    assert '"status": "failed"' in output
    assert "invalid" not in output
