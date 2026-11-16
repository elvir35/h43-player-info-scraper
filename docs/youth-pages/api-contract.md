# Youth pages API v1 and synchronization contract

Status: Phase 4 is deployed to isolated staging; Phase 5 additions below are locally implemented candidates, **not deployed**, 2026-11-11. Phase 4's tabbed release includes `upcomingMatches`. Snapshot/ingestion contracts remain unchanged; membership review/removal routes are not part of the API.

## Public GET /api/v1/teams/:teamId

Team slug: lowercase `[a-z0-9][a-z0-9-]{0,31}`. Unknown team: 404; malformed identifier: 400. Query parameters and unsupported routes are rejected. GET and browser OPTIONS only; other methods return 405 with Allow. Public reads need no credential, including non-browser reads without Origin. Exact allowed browser origins are environment-specific. CORS is not authentication.

Example shows the documented shape with names withheld and temporarily unavailable schedule sources. Normal current-team mode consumes the live APIs without a sporting season/date setup; actual event data varies:

```json
{
  "apiVersion": "1",
  "id": "p11",
  "name": "H43 Lund P11",
  "season": null,
  "welcome": {"title": null, "description": null, "heroImageUrl": null},
  "roster": {"players": [], "coaches": [], "lastSyncedAt": null},
  "nextMatch": null,
  "upcomingMatches": [],
  "upcomingEvents": [],
  "social": {"instagram": null, "tiktok": null},
  "contact": {"email": null},
  "dataStatus": {"roster": "withheld", "calendar": "unavailable", "matches": "unavailable"},
  "freshness": {
    "calendar": {"lastFetchedAt": null, "sourceUpdatedAt": null},
    "matches": {"lastFetchedAt": null, "sourceUpdatedAt": null},
    "scheduleCacheTtlSeconds": 300
  }
}
```

All shown keys are explicit. Season is a configured string or null. Welcome title/description/hero URL, social links and email are nullable. Title max 120 characters, description max 5000 in output, hero must be HTTPS without credentials. Instagram/TikTok accept only supported HTTPS profile hosts/paths without credentials/port/query/fragment; invalid configured URLs become null. No editorial write endpoint exists on this public Worker.

Phase 5 candidate adds nullable `welcome.seasonMessage` (600), `welcome.heroAlt` (160), `social.instagramLabel`/`tiktokLabel` (40 each), and `contact.text` (600). These are published values only. Drafts, actor emails, revision IDs and private image keys never appear here. Editable writes exist solely on the separately authenticated admin Worker; this public Worker has no editorial mutation routes. Legacy operator columns remain fallback until the team's first portal publication. Old widgets ignore added keys; v1.3.0 displays all optional fields.

Phase 5 candidate `GET /api/v1/teams/:teamId/images/:uuid` returns only the current published, same-team/partition JPEG with current photo permission, otherwise 404. Draft/retired images are never public. JSON remains bounded to 256 KiB; validated media is separately capped at 3 MiB, with no-store/nosniff. The aggregate's image URL changes when a replacement image is published; permission withdrawal is rechecked for old URLs. See [admin API contract and configuration](admin-architecture.md) for private routes, CSRF, revision checks and rollback.

Roster arrays contain `{displayName: string}` only, projected from internal `{name}` records. Swedish Unicode NFC names are 1–150 characters, normalized whitespace/plain text. Equal names can represent different source people. No SportAdmin identifiers, portraits, ages, raw source URL, revision integers, error bodies or private attempt metadata are exposed. Authorization is a team/season publication prerequisite; after establishment, all ordinary SportAdmin changes propagate automatically without player approval.

Roster status: available, empty (accepted verified empty snapshot), stale (failed latest attempt or successful observation older than 12 hours), unavailable (no valid current snapshot), or withheld (authorization absent). Withheld has no names or last-sync time. Stale may retain latest-valid names with their original lastSyncedAt. Existing snapshots are read consistently with current source/season and authorization; no stale authorization fallback.

`upcomingEvents` is chronologically sorted, max 100, each `{id,type,title,startsAt,endsAt,location,status}`. Type is training/match/other; endsAt/location are nullable; status is scheduled or unknown unless a cancelled/postponed event is excluded. `nextMatch` is null or `{id,startsAt,opponent,homeAway,location,competition,status}`; homeAway is home/away/unknown, optional strings nullable, status scheduled. Only future eligible matches qualify. Same-day matches are ordered by instant then deterministic ID. IDs are source-derived hashes, not verified upstream identity; reschedules may change them.

`upcomingMatches` is a chronologically sorted array of the same match shape, max 100. It comes exclusively from the dedicated matches API, with exact configured SportAdmin team filtering and played/cancelled/postponed/past records excluded. `nextMatch` equals its first element or null. `upcomingEvents` comes exclusively from the calendar API with the same exact team filtering: for P11 only `team === "P11"` qualifies. Calendar events may include training, matches and other P11 activities; they are not used to fabricate the match list. Feeds have independent availability. No extra upstream requests, database copies, credentials or personal fields are introduced by this additive field. Existing v1.0.0 widgets ignore it; v1.1.0 also accepts a previous API response without it during rollback and then displays the dedicated `nextMatch` only.

Dates are normalized from Europe/Stockholm local time to UTC RFC 3339. Future frontend must render with Europe/Stockholm, not browser timezone assumptions. Missing start time is excluded, not midnight/all-day; ambiguous/nonexistent DST times make the source unavailable. The rolling calendar's weekday/day/month resolves a unique nearby year (previous/current/next Stockholm year), with optional explicit legacy context. Invalid or ambiguous dates are unavailable. No manual season/date configuration is required for P11. Raw calendar info/meeting notes/logos/unused fields are not returned.

Calendar/matches status is available, empty or unavailable. A verified empty array or no upcoming matches is successful empty data. Malformed/failed source is unavailable. lastFetchedAt reports a successful adapter fetch, including cache reuse of that observation; sourceUpdatedAt is null because upstream scrape time is unreported. A 200 fetch is not proof of fresh source scraping. The 300-second schedule cache does not cache roster names.

All roster-bearing/private/error responses use no-store, JSON UTF-8, nosniff, no-referrer and data-appropriate CSP/frame restrictions. Aggregate responses are limited to 256 KiB; over-limit fails closed. Invalid config/core DB failure returns 503, not infrastructure details. Rate-limited requests return 429 and Retry-After 60. Errors are `{error:{code,requestId}}`, with no exception text. Public disabled configuration returns 503 PUBLIC_API_DISABLED.

## Private routes and authentication

All `/api/v1/internal/teams/:teamId/...` routes require a dedicated bearer credential whose SHA-256 digest is authorized for the path team in Cloudflare secret INGEST_TOKENS_JSON. Private browser-Origin requests are rejected. A valid token for another team is forbidden. These are scraper routes, not database administration or coach-editing endpoints.

| Route | Method | Body/result |
| --- | --- | --- |
| roster | GET | Returns `{season: string-or-null, snapshot: v1-or-null}`; private representation only |
| roster | PUT | Exact `{season, snapshot, expectedObservedAt}`; returns `{status: success-or-empty}` |
| failure | POST | Exact `{season, attemptedAt}`; records failure status only, returns recorded |
| refresh | POST | Exact empty object; increments schedule generation, returns invalidated |

No admin SQL, membership editing, approval, removal or coach authentication endpoints. Ingestion cannot change publication permission, season/source settings, social/content or credentials.

Requests must be application/json, valid UTF-8/JSON and no more than 64 KiB including streamed/chunked bodies. Extra fields are rejected. The envelope partition must equal the value returned by the private read. For P11 this is the internal key current, not a user-configured sporting season. This also prevents a stale run crossing an explicitly configured legacy season transition.

## Phase 2 snapshot v1 (unchanged)

This is a synthetic verified-empty transport example, not production content:

```json
{
  "schema_version": 1,
  "team": {
    "id": "p11",
    "name": "P11",
    "sportadmin_group_id": "378673",
    "source_url": "https://h43lund.web.sportadmin.se/grupp/?ID=378673"
  },
  "observed_at": "2026-11-11T12:00:00Z",
  "players": [],
  "coaches": []
}
```

Both arrays are required; each max 300 objects with exactly name. Metadata must match trusted configuration. Source URL is the fixed public club roster route. No arbitrary upstream URL/extra person fields. Observation timestamps use UTC Z with optional 1–6 fractional digits; the server canonicalizes six digits and compares integer microseconds. Invalid/unnormalized/HTML/control-character names fail. Names are text, never HTML; the later frontend must use textContent even for trusted API responses.

Snapshot time is captured before retrieving SportAdmin. Accept observations within the past 24 hours and no more than 5 minutes ahead. Date bounds apply only when an optional explicit historical season defines them; current-team mode has no sporting date bounds. Wrong source/team is forbidden. expectedObservedAt is null only for initial creation, otherwise the prior version returned by private GET. A single conditional D1 statement checks current season/source, expected version and strictly increasing observation time before replacing both arrays. Identical replay, old time, changed version and concurrent writers return 409 SNAPSHOT_CONFLICT without partial writes. Season mismatch is 409 SEASON_CONFLICT. An accepted empty snapshot removes all members atomically.

`RosterStore.read/replace` remain the Python semantic boundary. `CloudflareRosterStore` implements them over HTTPS, rejects redirects, bounds private responses to 256 KiB, uses dedicated environment secrets and logs no raw error bodies. Source/storage failure leaves latest-valid membership unchanged. Failure reports contain no names and cannot replace snapshots. If data committed but the reporting/acknowledgment failed, the next run reads the actual new version; do not restore removed names.

## Caching and urgent refresh

Roster aggregate responses are never edge/browser cached by this service. Subsequent reads reflect a successful membership change or authorization withdrawal immediately. Already displayed/saved content is not remotely erasable. The default scraper cadence is six hours; urgent roster changes use manual dispatch after updating SportAdmin, through the same authenticated ingestion path.

Only sanitized schedule data is cached for 300 seconds. Authenticated refresh increments a D1 generation, so every location uses new keys on the next primary DB read; old keys expire within TTL. No endpoint silently edits players or invokes an unverified arbitrary source URL.

Calendar and matches reuse [the supplied matches endpoint](https://h43-matches-api.vercel.app/api/matches) and [calendar endpoint](https://calendar-api-black.vercel.app/api/calendar), with strict exact team filtering. Upstream bodies max 2 MiB, timeout 8 seconds, redirects rejected. Incomplete/unknown data is not fabricated. See [integration evidence](sportadmin-integration.md), [operations](deployment.md) and [security review](security-review.md).

## Phase 4 browser consumer

The existing contract is unchanged. The widget validates/project fields before DOM text rendering; it uses API content for later editorial changes without modifying Webnode. Nullable optional fields and unknown calendar status are supported. Responses are limited to 256 KiB and 15 seconds in the browser. Visible pages refetch every five minutes and on return when due, with no persistent client storage; reload after an urgent sync displays current membership. Styling/asset routing is independent of `/api/*`. See [frontend guide](frontend.md) for embed, bounds, fallbacks and remaining Webnode validation.

## Contact mobile number — v1.7.0 widget update

The public v1 response's contact object now contains `email`, `phone` and `text`, each nullable. `phone` is an additive public display string of at most 40 characters. Editorial content uses `contactPhone`; old drafts/revisions without it normalize to null. No D1 migration is needed because editorial revisions are JSON. Phone values permit an optional leading plus, digits, spaces, parentheses and hyphens with 7–15 digits total. Invalid formats/control characters are rejected server-side; the frontend independently validates before creating a `tel:` URL containing only an optional plus and digits. No phone number is inferred from SportAdmin or existing prose. Existing clients can ignore this additive field; new widgets tolerate an older API response without phone.

The roster contract is unchanged: players/coaches remain authoritative SportAdmin names. Widget v1.7.0 places both lists under the Truppen tab, with separate Spelare and Ledare headings.

## Named contacts — widget v1.8.0

Public `contact.people` is an ordered array of at most 20 objects with exactly `name`, `email`, and `phone` (nullable strings; limits 120/254/40 characters). Every entry requires at least one valid email or phone. Names are plain text; existing email/phone validation applies to each entry. The widget renders separate contact cards using text nodes and validated mailto/tel links.

Editorial JSON adds `contacts`. Old revisions without it derive the first entry from legacy contactEmail/contactPhone. Explicit empty arrays remove all editorial contacts upon publication. Legacy public contact.email/phone remain projections of the first person for existing widgets. Save requests containing contacts must keep legacy fields consistent with the first entry; conflicting old-editor submissions fail with CONTACTS_OUT_OF_SYNC rather than silently losing a list edit. No D1 migration or additional infrastructure is needed. Draft contacts remain private until publication.

## Additive played-match history — v1.15.0 widget / API v1

`GET /api/v1/teams/:teamId` now includes `playedMatches` (maximum 100, latest first, deterministic ID tie-break). Each row has the same public fixture fields as `upcomingMatches`, but `status` is `played` and `score` is a normalized home–away string such as `21–19`, or null when missing/unrecognized. No score is invented. Raw upstream logo URLs, extra fields and source metadata are not exposed.

`dataStatus.playedMatches` is `available`, `empty` or `unavailable`, independently of whether upcoming fixtures exist. Both lists use the existing exact-team-filtered matches feed and share its fetch timestamp and bounded 300-second cache. `dataStatus.matches`, `nextMatch` and `upcomingMatches` retain their existing upcoming-only semantics. Calendar data remains separate.

Only explicit upstream `status=played` records at/before the current time enter history; only upcoming-status records in the future enter upcoming fixtures. A past upcoming record is not inferred to be played. Cancelled/postponed records remain excluded and configured season bounds still apply. An upstream failure produces unavailable status and no fabricated empty success. Normalized match cache projection increments to version 3 so old upcoming-only caches cannot hide the history after rollout.

The new widget defaults to Kommande and offers a Spelade button. It remains compatible with an API rollback: an omitted history field is treated as unavailable history while upcoming fixtures continue to work. Old pinned widgets ignore these additive fields.

## Optional roster metadata — v1.19.0 widget

Player objects retain `displayName` and may add `shirtNumber` (1–3 digit string) and `position` (plain text, maximum 60 characters). Leader objects retain `displayName` and may add `responsibility` (plain text, maximum 60 characters). Empty fields are omitted; identities, source IDs and editorial keys are never returned publicly. Publication authorization and current roster membership still control inclusion. Existing name-only clients remain compatible.

The private names-only scraper contract keeps schema_version 1 and optionally adds `sourceId` (numeric string, 1–12 characters) to each name record. Invalid or duplicate per-category IDs reject the entire update. Only the server creates membership keys, and the authenticated ingestion read strips them before returning transport snapshots. The authorized admin content response includes `roster.players/coaches` entries with displayName/memberKey (nullable), plus lastSyncedAt. Editorial content optionally adds `rosterDetails` entries `{memberKey,shirtNumber,position,responsibility}`, each nullable text field except the UUID key. Player/leader category restrictions, current team membership, versions and existing authentication/CSRF limits are enforced server-side. See the [identity implementation](roster-details-proposal.md) for key lifecycle and downgrade constraints.

## Optional player photos — v1.20.0 widget

Public player rows may add imageUrl, an HTTPS URL generated for a sanitized image belonging to the currently published active player entry. Leader rows do not gain photos. No source ID, member key, storage key or raw file is exposed. Missing photos omit the property; the widget retains name-only rendering. Image GET rechecks current publication, team/season ownership, roster authorization and active membership on every request.

Private rosterDetails entries optionally add imageId (UUID or null). Legacy rows without imageId remain readable. Updated editors send X-H43-Roster-Images: 1 on saves so cached older editors cannot accidentally strip portraits; ordinary JWT/CSRF/team checks still apply. Uploads reuse POST /api/admin/v1/teams/:teamId/images, followed by the existing draft/preview/publish flow. Removing a portrait is a draft change until published. No D1 schema migration is required.
