# Current decision — youth roster retired, 2026-11-19

The user chose to remove the roster feature and stop youth roster scraping. [Roster retirement](roster-retirement.md) supersedes roster-related proposals and descriptions below. The deployed production public API returns empty compatibility roster fields, blocks retired ingestion and known portraits, and preserves matches/calendar/editorial contacts/team photos. The new widget removes Truppen and the portal removes roster tools. Historical records below are not current feature requirements; current deployment and data-retention status are recorded in [the production report](roster-retirement-production.md).

# Youth team pages architecture

## Current staging extensions — 2026-11-13

The staging API, widget and Access-protected coach portal are deployed. SportAdmin remains authoritative for membership and names. Private source identities and membership-incarnation keys support optional editorial player numbers/positions and leader responsibilities through D1-backed draft/preview/publish. At the user’s explicit request, optional coach-uploaded player portraits now supersede the original no-portraits scope. Portraits reuse the existing sanitized Images pipeline and private R2; only current published active-player references are public. No extra infrastructure or D1 migration is introduced. See [roster details](roster-details-proposal.md), [image security](admin-security.md), and [v1.20.0 frontend](frontend.md). Production and Webnode republishing remain separate approval/operator steps.

The earlier phase records below are historical; their local-only status, names-only storage/projection and no-portraits plans are superseded by the current extensions above.


Phase 5 update: the [coach portal](admin-architecture.md) is now implemented/tested locally with a separate authenticated admin Worker, shared environment-specific D1 editorial records and private R2 images. Real Access/R2 setup, staging approval and hosted validation remain outstanding; no Phase 5 deployment has occurred. Public SportAdmin ownership and read-only public API boundaries are preserved. The previous implementation status below records the deployed Phase 4 baseline.

Status: Phases 2–4 implemented and validated, 2026-11-11. API and reusable frontend are deployed to isolated staging. No production/Webnode page change or coach portal. See [Phase 4 frontend](frontend.md) and [remaining release blockers](backend-issues.md).

The v1.1.0 [tabbed release](tabbed-release.md) separates overview, matches, calendar, players and contact into one visible panel at a time. The public API adds a bounded `upcomingMatches` list exclusively from the dedicated matches feed; calendar activities remain exclusively from the exact-team-filtered calendar feed. Existing source adapters/cache and infrastructure are reused, with no D1 schema change.

## Existing functionality and confirmed inputs

The senior Python scraper/schema-v3 files and daily senior workflow remain unchanged. Phase 2 added a separate names-only parser, configurable source and snapshot protocol. Phase 3 reuses those components, requests/BeautifulSoup, pytest and GitHub Actions rather than replacing scraping infrastructure.

SportAdmin exclusively owns player/coach membership. P11's confirmed [public roster group is 378673](https://h43lund.web.sportadmin.se/grupp/?ID=378673). Players span both layout columns before Ledare. Complete validated snapshots, including verified empty lists, replace both rosters automatically; no membership editor, approval states, departure queue or manual removal functionality exists.

The user-designated [matches API](https://h43-matches-api.vercel.app/api/matches) and [calendar API](https://calendar-api-black.vercel.app/api/calendar) were re-inspected before adapters were written. Both return arrays with exact P11 team labels. Calendar omits year; both omit stable event IDs and source scrape timestamps. Their source repositories/hosting configuration remain outside this checkout. No duplicate event scraper/storage is added.

The pilot needs no sporting season label or date range. Migration 0003 uses an internal current-team partition; public season is null unless a real optional season is configured. Publication authorization still defaults false. No fictional players, fixtures, editorial content or permission is seeded. Staging resource preparation is recorded in staging-deployment.md.

## Implemented data flow

```text
SportAdmin public roster
  -> existing Python names-only parser (fixed host, verified configurable group)
  -> CloudflareRosterStore authenticated HTTP adapter
  -> Worker internal routes (team-scoped secret + strict schema + CAS)
  -> D1 latest snapshot per team/season
  -> Worker GET /api/v1/teams/:teamId (names-only public projection)
  -> reusable names-only Webnode widget (staging assets and preview implemented)

Worker public request
  -> primary D1 team/season/content/current roster query
  -> existing calendar/match APIs via bounded adapters
     -> sanitized schedule cache only (300s)
```

One TypeScript Worker serves distinct public/internal routes and uses one D1 database per environment. No KV, queue, additional membership service, ORM or frontend framework. The Worker bundle has no runtime npm dependencies. Native rate limiting and the Cache API provide practical platform controls without a new service.

The Python HTTP adapter implements the Phase 2 RosterStore semantics. Private read supplies active season and snapshot version; conditional write includes both with the unchanged Phase 2 snapshot payload. HTTP credentials are environment/team-specific, TLS-only except explicit loopback development, never redirected or exposed to public JS. See [contract](api-contract.md) and [security review](security-review.md).

## Database model

Versioned migrations live in `worker/migrations`:

| Table | Responsibility |
| --- | --- |
| teams | Stable slug/display name, exact upstream label/group, current season, enabled flag and schedule-cache generation |
| team_seasons | Team/season key, local date boundaries, publication authorization, confirmed calendar year/month and nullable welcome/hero/social/contact content |
| team_roster_snapshots | One latest full players/coaches snapshot per team/season, source group and observation time at microsecond precision |
| roster_sync_status | One last-attempt status/time per team/season, no names/error bodies |

Roster replacement is one bound conditional UPSERT: verify configured source/current season, compare expected version and require a newer observation before atomically replacing both arrays. Replay, outdated jobs, mismatched teams or season transitions cannot partially overwrite data. Source group is stored and joined explicitly so remapping cannot relabel old names. Reporting status is separate and cannot erase a valid snapshot.

Current-team mode is the P11 default and requires no date setup. Optional historical seasons retain separate rows; if explicitly used, a transition does not inherit old snapshots or authorization. Do not derive a birth year/season from P11's name. Publication authorization is an operator prerequisite per season, not a per-player approval workflow. Ingestion cannot edit it. Once established, additions/removals publish automatically; withdrawal stops names on the next public read.

The single trusted Worker has D1 write capability for ingestion; public routes execute SELECT only. There are no generic SQL, database-admin or editorial mutation endpoints. Bind each environment to its own DB and restrict account-side Worker/D1 administration. No replicas are enabled; current source/authorization and roster are read through one primary query.

## Source normalization and failure behavior

Roster retrieval is streamed/bounded to 2 MiB and 30 seconds, with no redirects. Exact club/team title, group navigation, both section boundaries/headings and every row/detail pair are validated. Valid empty differs from missing/changed/incomplete content. Normalize NFC, Swedish characters and whitespace; same-name people are retained, repeated identical source rows deduplicated. Persist names only, not portraits/ages/contacts/person IDs. A failure retains last-valid state and reports failure without names/secrets in logs.

Schedule adapters use exact team labels and configured season boundaries, sort chronologically and handle multiple matches in a day. Ignore played/cancelled/postponed records; unknown match states fail the source instead of being guessed. Convert source local times with Europe/Stockholm rules; reject ambiguous/nonexistent DST times and missing start times rather than invent midnight/all-day data. Optional opponent/home-away/venue/competition remain null/unknown when absent. Public timestamps are UTC RFC 3339; render them in Europe/Stockholm.

The supplied rolling calendar provides Swedish weekday/day/month. Without an explicit legacy override, resolve its year uniquely within the previous/current/next Stockholm year and verify the weekday; invalid or ambiguous dates return unavailable. P11 needs no manual year/month configuration. Unknown calendar status stays unknown. Source URLs/IDs and raw info/meeting text are not copied into public output. Content-derived event IDs are only stable while identity fields remain unchanged; no uncertain cross-feed merging.

## Public API, caching and refresh

GET `/api/v1/teams/:teamId` is read-only with an explicit documented schema, nullable content, names-only player/coach arrays, next match, upcoming events, Instagram/TikTok links, contact email and per-source freshness. Error codes/request IDs are safe; no internal exception or metadata is returned. CORS is exact configured origins, not authentication. Response/body bounds, validation, security headers and a native approximate 120/minute/IP limiter protect the boundary.

All aggregate/private/error responses are no-store. Successful roster changes and authorization withdrawals need no cache purge: the next read sees current D1. Only sanitized schedules are cached, for 300 seconds; missing/failed optional feeds do not prevent roster delivery. Schedule refresh increments a primary D1 cache generation so subsequent reads at every location bypass old keys. No claim of global Cache API delete is made.

Urgent roster synchronization uses manual dispatch of the existing protected scraper workflow after updating SportAdmin. There is no local membership removal route. The normal default interval remains six hours, configurable using the existing gate. Phase 3 adds opt-in authenticated sync; validation-only mode remains available. No workflow or secret was enabled/configured remotely.

## Environments and later work

`worker/wrangler.jsonc` defines local development plus separate staging/production environments. Development has a local-only D1 identifier. A generated ignored staging-only config now binds the verified dedicated staging database; remote IDs are not hardcoded in source. Staging/production public delivery defaults disabled, workers.dev/preview URLs are disabled, secrets/config/state files are ignored and CI never deploys. See [local/migration/deployment/rollback instructions](deployment.md).

Proposed P11 Webnode URL remains `https://www.h43lund.se/lag/p11/`, subject to site-owner review. Phase 4 shared assets use scoped blue/gold styles, shadow-root isolation and a team-ID-only embed. Names/text render through text nodes. Worker Static Assets reuses the staging Worker with API-first routing and immutable versioned assets; no new service/database is introduced. Actual Webnode behavior is explicitly untested. Future editorial portal/Access and optional R2 remain outside Phase 4. No portraits, profiles or roster editing are planned.

Staging bindings, credentials and endpoint have been verified. Before production, review its separate DB/account bindings, credentials/permissions and hostnames; establish applicable publication authorization; approve retention/monitoring and staging checks; satisfy [security gates](security-review.md); obtain explicit user production-deployment approval. Local tests/dry runs do not grant it.

## Staging validation update — 2026-11-11

The user explicitly approved staging deployment and displaying P11 player/coach names. The dedicated h43-youth-api-staging Worker is deployed with its separate staging DB and team-scoped secret. Phase 3 live roster/schedule, authorization, failure recovery and cache checks passed. Phase 4 adds the [staging preview](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/) and frozen v1.0.0 assets; browser/hosting/API regression checks passed. No production resources or Webnode links changed. See [API staging results](staging-deployment.md) and [frontend delivery/rollback](frontend.md). Six-hour GitHub automation remains disabled pending workflow publication and protected secret setup; manual authenticated refresh is verified.

## Shared-page multi-team rollout

The staging registry now contains eleven verified youth teams. A single Webnode host page can opt into `?team=<slug>` using `data-team-from-url`; fixed embeds and authenticated previews retain their explicit team scope. The same API, D1, roster scraper and coach portal serve every team. Publication authorization was confirmed for all eleven rosters; no new coach grants or per-team image permissions are inferred. See [verified mappings, deployment and remaining scheduling/Webnode steps](team-onboarding.md).
