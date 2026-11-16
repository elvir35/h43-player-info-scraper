# SportAdmin integration

Status: Phase 3 integrated locally, 2026-11-11. SportAdmin remains authoritative; no player approval or membership editing workflow.

## Existing senior integration

Baseline before this work: `4ba1590`. `scripts/scrape_players.py` calls `h43_scraper.sportadmin.main`. Herrar A maps to group 125511 and `data/players.json`; Damer A to 147067 and `data/ladies_players.json`.

Schema-v3 documents contain group metadata, player names/numbers/positions/ages/image/profile URLs and coach names/roles/ages/image/profile URLs. They omit generated timestamps. Checkout counts are 22 players/3 coaches and 18 players/3 coaches. These files and senior behavior remain unchanged.

The senior scraper uses requests/BeautifulSoup, userRow toggles and `_1`/`_2` detail suffixes. It requires non-empty players/coaches and rejects reductions greater than 35% before a non-atomic file write. Those rules do not apply to the new youth parser, which accepts verified empty sections and automatic removals. Seven existing fixture tests remain unchanged.

The existing GitHub Actions workflow tests, scrapes, validates and commits senior JSON daily at 05:17 UTC or on manual dispatch. Static hosting in README is guidance, not proof of deployed senior endpoints. Calendar/match code is outside this checkout.

## P11 source and observed structure

User-confirmed source: [public P11 roster, group 378673](https://h43lund.web.sportadmin.se/grupp/?ID=378673).

Read-only inspection on 2026-11-11 confirmed HTTP 200, declared iso-8859-1, title `H43 Lund - P11`, a navigation link to group 378673, lGrupp/rGrupp columns, direct Spelare/Ledare headings and userRow/detail identifiers ending `_1`/`_2`. Player rows continue in the right column before Ledare. The corrected live parser returned 15 players and 4 coaches. Live names/HTML were not stored or committed; tests use synthetic names and IDs.

The web browsing tool could not open the URL; authorized direct requests succeeded. No authentication or restricted APIs were used. Team/group identity is verified, but a birth-year/season mapping is not inferred from the label.

## Youth entry point

`src/h43_scraper/youth_roster.py` implements independent names-only retrieval/normalization using existing dependencies. CLI:

```powershell
python scripts/scrape_youth_roster.py
python scripts/scrape_youth_roster.py --team-id p11 --team-name P11 --group-id 378673
```

Defaults are P11/group 378673. Future teams supply their slug, expected page team name and numeric group ID. Group ID cannot inject a URL; the public club host/path is fixed. Redirects are rejected, HTTP status must be 200, HTML is required and timeout is 30 seconds. Respect declared response charset; detect encoding only when charset is absent.

Default CLI reports status/team/counts only and exits non-zero on failure. Optional `--output PATH` atomically exports validated UTF-8 transport JSON; it is not a website datastore. A failed scrape/parse/write leaves an existing export unchanged. Never commit real youth payloads or upload them as public artifacts. `.roster-payloads/` is ignored for local private experiments.

## Outcomes and synchronization

1. Require complete document closing tags, expected club/team title and a navigation link matching the configured group.
2. Verify both explicit roster columns close once and both section headings occur in order. Follow players across columns until Ledare.
3. Require a valid row identity, one unambiguous name link and corresponding detail block for every row. Reject unknown content, missing sections and broken rows rather than silently skipping people.
4. Normalize whitespace/NBSP and Unicode NFC, decode entities and preserve Swedish letters. Strip displayed jersey prefixes without retaining numbers. Deduplicate repeated identical source rows, reject conflicting same-ID rows and preserve identical names on distinct source IDs.
5. Return names plus team/source/observation metadata. `empty` means both verified sections contain no rows; `success` means one or both has names. Missing/changed sections are `failed`, never empty.
6. A valid snapshot replaces both membership lists in full, including additions, removals and returns. There are no approval states, review queues, manual removals or percentage-drop gates. Publication authorization is established before public delivery, outside the scraper.
7. Fetch/parse/storage/conflict failure preserves the last valid snapshot and reports failure. Strict structure checks can reject changed layouts but cannot detect an inaccurate yet structurally valid source roster. SportAdmin is authoritative.

`RosterStore` defines the storage boundary; `synchronize` reads prior state, retrieves/parses and requests one conditional replacement. Phase 3 adds `CloudflareRosterStore` over authenticated HTTPS, private Worker ingestion and real D1 persistence. Tests retain an isolated in-memory double as well as real local Worker/D1 integration. See [contract](api-contract.md).

## Scheduling

`.github/workflows/scrape-youth-roster.yml` reuses GitHub Actions, Python 3.11 and pytest. It is disabled unless `YOUTH_ROSTER_ENABLED=true`.

| Repository variable | Default / behavior |
| --- | --- |
| `YOUTH_ROSTER_INTERVAL_HOURS` | 6; accepts 1, 2, 3, 4, 6, 8, 12, 24 |
| `YOUTH_ROSTER_TEAM_ID` | p11 |
| `YOUTH_ROSTER_TEAM_NAME` | P11 (expected title identity) |
| `YOUTH_ROSTER_GROUP_ID` | 378673 |

An hourly UTC tick at minute 23 evaluates the interval gate, since cron cannot interpolate repository variables. Manual dispatch ignores the hour gate. Invalid intervals fail visibly. It runs tests before a due scrape, has contents-read permission and logs status/counts only. Phase 3 adds opt-in `YOUTH_ROSTER_SYNC_ENABLED=true` ingestion using a protected GitHub environment (YOUTH_ROSTER_ENVIRONMENT, default staging), its H43_API_URL and dedicated H43_INGEST_TOKEN secret. Without sync enabled it remains validation-only. No JSON commits or roster artifacts. No workflow, variable or secret was activated/configured remotely during this work.

## Existing schedule APIs

Use the user-designated [matches API](https://h43-matches-api.vercel.app/api/matches) and [calendar API](https://calendar-api-black.vercel.app/api/calendar). Earlier inspection on 2026-11-11 returned HTTP 200 arrays: 498 matches/23 P11, 313 calendar events/14 P11. Counts are historical observations, not fixed fixtures.

Matches keys: team, hall, time, date, month, home, away, score, logo, status. Observed values were strings, Swedish display dates/month-year, statuses upcoming/played.

Calendar keys: date, month, startTime, endTime, team, location, type, title, opponent, homeAway, meetingTime, info. Month omits year; observed types were Träning/Match/Övrigt; blank titles/times occur. Both APIs lack stable event IDs and scrape timestamps. Observed headers advertise JSON, wildcard CORS, weak ETag and revalidation caching; transport metadata does not prove source freshness.

Future adapters consume them directly with exact P11 mappings. For the supplied rolling calendar, resolve a unique nearby year from weekday/day/month; reject ambiguity rather than silently assigning a year. Content-derived IDs cannot guarantee reschedule continuity; avoid fuzzy cross-feed merging. Keep raw info/meeting instructions out of the initial public projection. No schedule parser or duplicate D1 schedule copy is introduced in this roster-only phase.

## Phase 3 integration and security boundary

`src/h43_scraper/cloudflare.py` and `scripts/sync_youth_roster.py` connect the existing parser to private Worker routes. Private GET returns the active season and prior snapshot; PUT carries that season, the complete unchanged v1 snapshot and expected observation version. HTTPS, redirect rejection, dedicated team-scoped bearer authentication, strict schemas/size bounds, microsecond CAS and season/source isolation protect ingestion. Failure reporting is separate and cannot erase valid names.

The source HTML is now streamed and capped at 2 MiB, with the existing 30-second timeout and encoding handling. Phase 3 Worker responses are bounded; Python private reads are capped at 256 KiB. Credentials come from environment secrets, not CLI arguments or frontend assets. Request/error bodies and youth names are not logged.

`worker/src/sources.ts` consumes the two designated schedule APIs directly; they were re-inspected before implementation and retain the field sets documented above. It filters exact team labels, constrains dates to confirmed season boundaries, sorts future events/matches and converts Stockholm local times with explicit DST checks. Played/cancelled/postponed matches are excluded. P11 needs no manual calendar date setting: resolve a unique nearby year from weekday/day/month and reject invalid or ambiguous dates. Unknown calendar cancellation status remains unknown. Missing start times are excluded rather than invented; competition stays null when absent.

Only sanitized schedule projections are cached, for 300 seconds. Source bodies are capped at 2 MiB with 8-second timeout and no redirects. Public roster delivery reads the latest D1 snapshot without caching and only with publication authorization established. See [security review](security-review.md) and [local/deployment/rollback instructions](deployment.md). No production deployment, frontend or coach portal was performed.

## Phase 4 source validation

On 2026-11-11 public P11 roster group 378673 linked to calendar 378669 and match page 378675. The [match page](https://h43lund.web.sportadmin.se/match/?ID=378675) identifies P11 and contains the current KFUM Lundagård F2015 opponent. No mapping correction was warranted. Deployed API smoke tests matched live SportAdmin players/coaches and exact P11 schedule records/chronological next match. The frontend consumes those normalized records unchanged; unknown statuses and venue formatting limitations are documented in [backend-issues.md](backend-issues.md), not concealed in UI code. A real names-only frontend is now staged; production/Webnode links and the coach portal remain untouched.

## Verified multi-team onboarding

All eleven teams supplied in the youth directory have been verified and synchronized to staging. Use the actual Truppen group links from [the registry and mapping table](team-onboarding.md), since start-page IDs do not always identify roster pages. Youngest teams F9/P9 use Deltagare rather than Spelare; both known first-section headings are accepted with Ledare and unchanged strict identity/completeness checks. Exact team labels exist in both provided feed APIs. The names-only parser and authenticated snapshot contract are reused for every team, with dedicated team credentials and no ordinary manual membership approval. All-team scheduling support is prepared in the existing opt-in GitHub workflow but has not been published/activated remotely.

## Numbered squads and generic match rows — 2026-11-12

Live youth-feed inspection identified H43 Lund HF 1/2/3 for P15, F14, F12, P12 and F9. Opponent/home-away normalization now recognizes exact H43 Lund / H43 Lund HF labels with an optional bounded positive squad number, including normalized spacing; arbitrary H43 substrings and both-club fixtures remain ambiguous. P10 uses the literal Match in the home column and the opponent in away: the opponent is retained, while home/away remains unknown. The dedicated team filter and chronology are unchanged. The normalized match-cache key is versioned to bypass old unknown-opponent projections on rollout; calendar cache keys and the 300-second TTL are unchanged. No widget-version or database migration is needed.


The fix is deployed to staging as API Worker version 72430c41-4a49-45bb-8dc6-a5110dd74dda. All 88 API/tooling tests passed; source comparison verified all 216 upcoming matches across eleven teams with no missing opponent values. Six generic P10 rows retain unknown home/away, as required by their source format. All eleven public API contracts passed, and eight unrelated production Workers/routes remained unchanged. The new match projection bypassed stale cached values immediately; existing v1.11.0 widget embeds require only a reload. Coach previews use the same API binding, so no admin deployment was necessary. Rollback reference: bbb8bbea-b87a-4367-b3de-463ca2cb7002 using the existing staging configuration.


## Private technical identities for optional details — 2026-11-13

The public roster source exposes numeric tokens in paired userInfo row/detail IDs. The scraper now includes bounded sourceId values in authenticated transport records while still extracting names only as person content. No private contact fields or portraits are scraped. Opaque, server-generated membership keys live only in the existing D1 snapshot JSON and authorized editor responses; the transport read strips those keys. Names-only legacy payloads remain supported. Exact continuous source-ID/name/category matches retain keys; renames, departures/rejoins, lost IDs and category changes do not carry editorial details forward automatically. These conservative associations and their compatibility limits are documented in [roster details](roster-details-proposal.md). All eleven staging teams were synchronized successfully after deploying the identity-aware Worker.
