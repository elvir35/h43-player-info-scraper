# Phase 3 security review

Reviewed 2026-11-11. Scope: the new youth Worker/D1 service, Python HTTP adapter, scraper boundary and CI configuration. The approved staging deployment and validation are complete; no production deployment was performed. See staging-deployment.md for actual operational evidence. This is an implementation review with automated local tests, not a claim that unconfigured remote resources have been verified.

## Outcome

The implementation keeps SportAdmin authoritative, stores names-only snapshots, authenticates and scopes ingestion, uses conditional bound D1 writes, and exposes a separate read-only public projection. No membership editor, player approval workflow, database administration route, additional database service or frontend was introduced.

The local Worker runs in workerd/Miniflare with real simulated D1, including a Python HTTP adapter end-to-end test. Runtime configuration intentionally withholds public rosters until season-level publication authorization is established. The tracked template keeps remote public delivery disabled. A generated staging-only config and dedicated staging D1 are now prepared, and the Worker is now deployed/validated with a dedicated secret; production remains unconfigured. Production remains gated on the requirements below.

## Trust boundaries and mitigations

| Boundary | Threat scenarios | Implemented controls |
| --- | --- | --- |
| SportAdmin -> Python scraper | Wrong team, redirects/login, malformed/partial/oversized page, injected text, accidental empty roster | Fixed public HTTPS host/path; numeric configurable group ID; no redirects/auth bypass; 30s request timeout; streamed 2 MiB decompressed HTML limit; explicit title/navigation/section/row checks; normalization. Valid empty sections differ from failed parse. No write after failure. |
| Scraper -> ingestion | Anonymous updates, leaked broad Cloudflare token, cross-team writes, oversized/extra fields, replay, stale season or concurrent run | HTTPS-only client except explicit loopback development; no redirects; dedicated high-entropy bearer token; server SHA-256 digest secret mapped to team; strict schema/body limit; expected revision/current season; fixed source mapping; single conditional UPSERT and newer microsecond timestamp. |
| D1 -> public API | SQL injection, unsafe configuration, private identifiers or old-season names leaking, stale authorization | Bound prepared statements; current season/source JOIN; explicit output projection; name/schema validation and safe URL handling; names only with current season authorization; no arbitrary SQL/admin route or public write methods; consistent primary D1 reads. |
| Public API -> Webnode/browser | XSS, malicious links, CORS confusion, stale names in shared cache, response amplification | JSON only; strict plain-text names; escape HTML-significant JSON characters; HTTPS/social-host validation; no-store; exact-origin CORS; bounded 256 KiB response and 100 events; security headers; native approximate rate limiter. Frontend must use textContent, not HTML insertion. |
| Development -> production | Local secrets/DB reused, accidental remote migration/deployment, CI credential exfiltration | Local-only development DB identifier; separate explicit environments; no staging/production DB IDs fabricated; public-disabled defaults; ignored local secret/config/state files; read-only CI; no deployment workflow. Real remote binding/credential setup and deployment require operator review and explicit production approval. |

Code evidence: [scraper](../../src/h43_scraper/youth_roster.py), [HTTP adapter](../../src/h43_scraper/cloudflare.py), [Worker routes/authentication](../../worker/src/index.ts), [validation](../../worker/src/validation.ts), [source adapters](../../worker/src/sources.ts), [migrations](../../worker/migrations/0001_teams_and_snapshots.sql), [environment configuration](../../worker/wrangler.jsonc). These relative paths resolve from this document's directory via the repository root; see deployment instructions for account-side controls.

Specific review locations: Worker authentication at `worker/src/index.ts:43`, conditional ingestion at line 73, public projection at line 107 and routing/error handling at line 143; streamed request validation at `worker/src/validation.ts:60` and line 80; schedule loading at `worker/src/sources.ts:113`; authenticated Python adapter at `src/h43_scraper/cloudflare.py:17`; bounded public HTML retrieval at `src/h43_scraper/youth_roster.py:131`.

## Authentication and authorization

Private routes are `/api/v1/internal/teams/:teamId/roster` (GET/PUT), `/failure` (POST) and `/refresh` (POST). GET is also authenticated because it exposes the private synchronization representation. Public routes are GET/OPTIONS only. Browser-origin private requests are rejected even if a credential is present; public CORS is never treated as authentication.

`INGEST_TOKENS_JSON` is a Cloudflare secret containing team -> one or two lowercase SHA-256 token digests. Generate at least 256 random bits for each team's raw credential and store that raw value only in the scraper's encrypted environment secret. The accepted token encoding is URL-safe and 32–128 characters. The digest map never travels to the browser; supplied credentials are hashed and compared across fixed-length digest strings. Wrong tokens return 401, a valid token scoped to another team returns 403, and invalid/missing server secret configuration fails closed.

Tokens are environment-specific. They grant only the implemented internal routes for their team, not Cloudflare account access, database administration, editorial changes or publication authorization. Up to two digests per team support rotation: add new digest, update scraper secret, verify, remove old digest. Do not use the deployment account token for scraping. The map must be merged carefully when adding a team; replacing the whole secret with one team would revoke other teams' credentials.

No coach login or administration UI exists in Phase 3. Publication authorization is a trusted operator setting per team/season, default false. No per-player approval exists. Roster presence does not grant editorial/admin access. The dedicated ingestion credential cannot change authorization or content settings.

## Payload, database and concurrency

Ingestion accepts exactly season, snapshot and expectedObservedAt. The snapshot is the Phase 2 v1 payload, including both arrays, known team/source metadata and observation time. Each name has only `name`, is normalized NFC/plain text, 1–150 characters; each list is capped at 300. Duplicate names remain legal. Unknown fields, bad identifiers, invalid timestamps, extra personal fields and HTML/control-character name payloads fail validation. Incoming bodies are capped at 64 KiB, measured while streaming even without Content-Length; invalid UTF-8/JSON fails without persistence.

Observations must be less than 24 hours old and no more than 5 minutes in the future. P11 current-team mode needs no sporting season or date range; date bounds apply only to explicitly configured legacy seasons. Expected version and incoming time compare at microsecond precision, preserving Python timestamps. A single D1 statement replaces both arrays and metadata if the expected version still matches and the incoming observation is newer. A season/source configuration change, replay or race fails without partial replacement. D1 keys are team+season and snapshots additionally carry the source group. All values are bound parameters; route identifiers never form SQL text.

Attempt status is a separate row, with monotonic attempt time and only success/empty/failed; no error bodies or player history. It cannot erase a snapshot. If content committed but reporting fails, ingestion may return an error even though the roster changed; the next run reads the actual current version. Never compensate by restoring removed names. A failed attempt arriving later may correctly mark an older retained roster stale.

The Worker is the only application binding proposed for each environment's D1. A public route performs SELECT only, although the same trusted Worker also has ingestion write capability. D1 access is not exposed over HTTP except narrowly scoped snapshot operations. Account administrators must restrict who can change Worker code/bindings or use D1 administration. Read replicas are not enabled; enabling them would require a consistency review for authorization/removal reads. A compromised trusted Worker or account administrator remains inside the database trust boundary.

## Public API and data handling

The response uses an explicit documented object, not a database row spread. It omits SportAdmin group/source-person IDs, source URLs, raw roster JSON, attempt timestamps, credential digests and database revisions. Public freshness includes only roster last-success time and schedule fetch times; schedule scrape time remains null because upstream does not report it.

Invalid social URLs become null: Instagram/TikTok must use HTTPS and exact supported hosts/profile paths, with no credentials, non-default port, query or fragment. Hero URLs require HTTPS and no embedded credentials. They are not server-fetched. Editorial values are operator-managed and validated when projected. JSON gets nosniff, no-store, frame restrictions, no-referrer and a restrictive CSP appropriate to data responses. No HSTS policy is imposed on the existing website by this task.

No frontend was built, so browser rendering is a later delivery gate. Its implementation must create text nodes/use textContent for names, titles and descriptions and validate link destinations; it must never insert API text with innerHTML. API-side validation and JSON escaping are defense in depth, not permission to render arbitrary HTML. Tests reject XSS name payloads; a real browser rendering test belongs to the frontend phase.

Public rate limiting uses the native Workers binding at 120 requests/minute per connecting IP and route class, per Cloudflare location. It is approximate, not a strict global limit or a substitute for authentication. Production/staging fail closed without the limiter; development permits absent binding for local harness tests. Namespace numbers in the template are proposed configuration labels and must be checked for account uniqueness before remote setup. CORS limits browser reads to configured exact origins; non-browser public reads without Origin remain public by design.

## Cache, refresh and retention

Roster-bearing aggregate responses and all errors/private responses use no-store. Every public request reads current D1 membership/authorization, so successful removal, an accepted empty roster or authorization withdrawal is visible on the next fetch. No roster cache invalidation service is required. Already rendered/offline/saved copies cannot be recalled by an API.

Only sanitized schedule projections are cached, for 300 seconds. Upstream bodies are bounded to 2 MiB and time out after 8 seconds. Old cache entries are not intentionally served past TTL. The authenticated refresh route increments a D1 cache generation; every subsequent read uses the new generation, including other locations. Old entries expire within TTL. This avoids claiming that a local Cache API delete purges all locations. Roster changes need no generation bump because names are never cached.

Urgent roster refresh uses manual dispatch of the existing scraper workflow, with the protected environment's dedicated credential; urgent schedule refresh uses the authenticated refresh route. Publication can be disabled via trusted D1 configuration to stop roster delivery immediately. There is no manual player-removal endpoint: membership changes are made in SportAdmin.

D1 retains one latest snapshot per team/season, not a per-player change history. Failed scrapes retain the last valid snapshot and expose stale status after an unsuccessful attempt or 12 hours without success (twice the default 6-hour cadence). Current data remains available during temporary source failure. The club must approve retention for inactive seasons, database backups and operational logs; no automatic purge policy has been invented. Private status records contain no names; logs contain request ID, route class, method and status only. CI has no roster artifacts or JSON commits. Review D1 backup retention and reconcile publication withdrawals before restoration is exposed publicly.

## Security tests

| Control | Automated evidence |
| --- | --- |
| Authenticated/team-scoped ingestion | Missing/wrong credential, private-read protection, cross-team/source update and Origin rejection tests |
| SQL injection/identifier validation | SQL-shaped routes rejected; SQL metacharacters in a valid name persist as literal data; tables remain intact |
| Complete schema and size limits | Malformed JSON, extra fields/personal fields, oversized body with/without length, XSS names, response limit |
| Atomicity/replay | Full/empty replacements, stale version/time, identical replay, microseconds, simultaneous writers, season transitions |
| Publication/data projection | Withheld/withdrawal, names-only field allowlist, internal metadata/digest absence, invalid social URLs |
| Public read-only/CORS/errors | Unsupported methods, exact allowlist, preflight, generic storage errors, rate-limited response |
| Cache/source safety | Removal immediately visible; schedule reuse and generation invalidation; malformed/failed/empty sources; exact team/date sorting and cancelled/postponed matches |
| Environment/runtime integration | Real local D1 migrations and Worker runtime; real Python adapter -> loopback Worker -> D1 using synthetic fixture; local-only migration and deployment dry run |

Validation results: 39 Worker/D1 tests and 81 Python tests passed; TypeScript/build, local migrations/repeat application and a development deployment dry run passed. See `worker/test/api.test.mjs`, `tests/test_cloudflare.py` and the retained scraper fixture tests. All external APIs are mocked in automated tests. Package advisory checking initially found dev-only sharp/undici advisories; compatible patched overrides were installed and the full npm audit now reports zero known vulnerabilities. The Worker bundle has no runtime npm dependencies. Keep lockfile/tooling maintained; this result is time-specific.

## Remaining risks and production gates

**R1 — High, deployment/configuration gate:** The account, existing resource metadata, unused staging Worker name, dedicated staging D1 and limiter namespace have now been checked; staging secret installation, Worker deployment, live-data smoke tests and failure recovery are complete following explicit approval. Production resources and protected automation still require their separate review. No production deployment is permitted until these are configured/reviewed and the user explicitly approves.

**R2 — High, publication gate:** The user explicitly approved displaying the P11 names at the staging URL; its publication setting is enabled only in staging. Membership synchronization needs no sporting season/date setup; current mode is the default. The calendar resolves a unique nearby year using weekday/day/month and rejects invalid/ambiguous results. No manual calendar setting or inferred birth year is required.

**R3 — Medium, trusted-source/credential limitation:** A compromised SportAdmin page can return structurally valid false names; a compromised authorized scraper token can fabricate data for its scoped team. TLS, schema, bounds and source mapping reduce attack surface but cannot prove real-world membership. Use least privilege, token rotation, source monitoring and protected workflow configuration.

**R4 — Medium, retention/availability:** Owner-approved inactive-season/backups/log retention and stale-source alert operations remain to be set up. Free quotas and approximate per-location limits can cause temporary unavailability. Keep authorization checks fail-closed and monitor last success; do not fix outages by publishing private snapshots through Git.

**R5 — Medium, browser/host boundary:** Phase 4 implements and tests validated fetching, plain-text rendering, URL restrictions and isolated styles. Staging asset routing/hash/header/CSP checks passed. Actual Webnode interaction remains an untested release gate. Source schedule feeds still lack definitive cancellation coverage or scrape freshness; unknown information stays unknown.

Reference decisions use [D1 bound statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [D1 transaction behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/), [native rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) and [local D1 testing](https://developers.cloudflare.com/workers/testing/miniflare/storage/d1/). See [deployment/rollback](deployment.md) for the concrete operating procedure.

## Staging validation update — 2026-11-11

The user explicitly approved staging deployment and displaying P11 player/coach names. The dedicated h43-youth-api-staging Worker is now deployed with its separate staging DB and team-scoped secret. Live roster/schedule, public contract/CORS/method/header, replay/team isolation, controlled failed-scrape recovery, cache refresh and existing-service baseline checks passed. No production resources or Webnode links changed; no Phase 4 implementation was started. See [staging deployment results and rollback](staging-deployment.md) for the authoritative current operational state. Six-hour GitHub automation remains disabled pending repository workflow publication and protected environment secret setup; manual authenticated refresh is verified.

## Phase 4 browser security review — 2026-11-11

Tabbed v1.1.0 update: the explicit public projection now includes up to 100 normalized upcoming matches (documented in api-contract.md). It exposes no new personal/internal fields, reuses exact team-filtered adapters and keeps the existing total-response bound/security headers. API regression tests verify match/calendar source separation and cross-team exclusion. Hidden panels are removed from accessibility/tab navigation; tab selection is in-memory per widget. Existing immutable assets are retained; no credential, D1 schema or authorization change was needed. See [release evidence](tabbed-release.md).

The browser receives public data only: no ingestion credentials, D1 binding or mutation routes. Credential-free/no-store fetch rejects redirects, non-JSON, invalid/mismatched schemas, responses above 256 KiB and requests exceeding 15 seconds. DOM text nodes render external strings; social links require exact platform HTTPS hosts and profile paths. No arbitrary HTML, third-party SDK or iframe embed is supported. Image URLs require HTTPS without credentials and use no-referrer; configured external image hosts can observe requests and require editorial review. Missing image-alt metadata means hero images are decorative.

Shadow DOM prevents accidental CSS collision, not malicious host scripts from reading names/altering the UI. Preview CSP restricts scripts/styles to self; objects/base URL are forbidden and fetch/image permissions bounded. Noindex is not authentication. Anonymous immutable assets contain public configuration only and a frozen SHA-384 manifest. API-first routing and its regression test prevent assets taking over `/api/*`; API exact-origin CORS/no-store/security headers remain separate from static `_headers`.

Browser tests cover HTML injection, rejected image/contact/social URLs, private-field non-rendering, malformed/oversized/mismatched responses, network retry, invalid/multiple team IDs, separate names/coaches and refresh/removal/outage behavior. No localStorage or offline copy is added. A visible page refreshes within five minutes plus request time; urgent backend sync followed by reload gets current data. Failed refresh clears the view; backend last-valid/stale retention is unchanged.

Passed: 19 browser tests plus deployed-preview check, 47 API/tooling tests, 81 Python tests, typecheck/build and deployed API/asset smoke checks. npm audit reported zero known vulnerabilities. Existing Worker/routes were unchanged and staging bindings/authentication reverified. The shipped widget has no runtime npm dependencies. No critical new finding was observed within these checks; this is not an exhaustive audit or real Webnode test. [Remaining operational/host gates](backend-issues.md) still apply.
