# Youth roster retirement — 2026-11-19

## Decision and status

**Completed production delivery and cleanup:** see [the 2026-11-19 production report](roster-retirement-production.md). This report supersedes the candidate/pending status in the historical preparation notes below.

The user chose to remove the roster and stop youth roster scraping on 2026-11-19. This supersedes the earlier individual-publication-control proposal. Matches, calendar, welcome content, social links, registration, team photographs and manually entered named contacts remain. No independent membership or consent-management system is being added.

The existing GitHub workflow `scrape-youth-roster.yml` was disabled through the signed-in GitHub UI; the disabled banner was verified. The API credential's disable attempt had returned 403. The replacement workflow has no schedule, scraping, checkout, environment or credentials. The three youth scrape/sync script entry points now fail with a retirement message before importing scraper code. The senior workflow is unchanged. Parsing/client libraries and synthetic historical unit fixtures remain as inert code; they are not a running integration.

The API/widget v1.26.0 candidate is being validated in staging; the production API/admin/widget are not yet deployed. Disabling the workflow alone does not remove the live production API exposure. No production migration, backup removal or R2 deletion has been performed. Webnode publication remains the user's task.

## Changes

- New widget has four tabs: Översikt, Matcher, Kalender, Kontakt. It discards any roster returned by an older API and never fetches player portraits. Player image dialogs, roster UI and portrait editor tools are removed.
- The v1 API retains an empty compatibility envelope: `roster: {players: [], coaches: [], lastSyncedAt: null}`, with `dataStatus.roster: "withheld"`. No membership snapshots are queried by the public team response. This avoids breaking old pinned widgets while returning no roster data; old widgets may still show an empty Truppen tab until repinned.
- All supported private roster/read/failure/refresh routes return 410 `ROSTER_RETIRED`, including requests using old credentials. Credentials cannot reactivate the feature. Schedule caching continues with its existing bounded TTL; the old roster credential no longer offers a refresh endpoint.
- Coach content and previews return no roster names or details. Cached editors attempting to save nonempty roster overlays are rejected. Old revisions can restore editorial content but cannot restore roster overlays or known portraits.
- Public images must be the current published team hero. A portrait referenced by any existing draft/history or recorded in the retirement table cannot be served publicly or via the portal image endpoint, even if it was also referenced as a hero. Public projections omit that hero URL and alternative text. Unreferenced private uploads are not made public by this change.
- Additive migration `0006_retire_youth_roster.sql` records known portrait IDs before content cleanup. The denial record survives removal of historical references. This does not identify people's faces inside team photographs: those still require the club's publication process.

## Deployment sequence requiring review

1. Keep GitHub youth synchronization disabled. Confirm there are no in-progress runs before proceeding; remove the unused youth ingestion environment secrets/Worker secret after successful rollout through the appropriate secret-management interface. Do not print credential values. Do not touch senior credentials.
2. Verify generated configurations target only the dedicated youth staging/production Workers, D1 databases and private R2 buckets. Take an appropriately protected recovery copy under H43's agreed short retention policy; it contains personal data and is not a public artifact.
3. Briefly freeze coach editing before applying migration 0006 and retain the freeze until the new API/admin are active. This prevents the old editor adding a portrait reference between the migration inventory and deployment. Apply the additive migration in each dedicated database before deploying the new code. Verify portrait-ID counts only; do not export names into logs.
4. Validate on isolated local data first, then deploy the reviewed staging candidate without reopening staging editing or ingestion. Test empty roster responses, 410 endpoints, sampled old portrait 404s, team hero access and the current team-page contract. Whole staging public delivery should subsequently be disabled if dependency review confirms it is unused; the production release is not a reason to leave an old public roster backend available.
5. After explicit production deployment approval, deploy the production API/assets and protected admin with the same retirement behavior. Confirm anonymous old portrait URLs fail and all eleven team APIs return empty rosters, including with unavailable upstream feeds. Confirm existing team hero images and named contacts remain usable. Reopen only production editing after checks.
6. User updates both Webnode asset URLs to v1.26.0 using `frontend/webnode-production-embed.html`. Never replace bytes at an old immutable version. Verify all birth-year URLs, four tabs, phone/email contacts, mobile layout and coach preview/publish. Older widget versions receive no roster data from the updated backend but require repinning to remove the empty tab visually.
7. Record versions, migration results and tests. Do not announce complete removal while either environment still serves the previous backend. Roll back only to retirement-aware code; restoring old ingestion/public-image handlers or old databases would reintroduce exposure.

## Historical data and retention — separate approval required

Retirement blocks publication but does not erase existing private snapshots, portraits, editorial history, audit records or encrypted backups. H43 must choose the necessary retention period and approve destructive cleanup. Keep that decision distinct from retaining legitimate editorial contacts and team photographs.

Prepare a private counts-only inventory of roster snapshots/status rows, portrait R2 objects and references in drafts/revisions/backups. Before removing references, preserve portrait denial IDs and enough private object-key information to action the approved storage deletion. Cleanup must remove roster snapshots/status, retired overlays and portrait references, then delete the reviewed private portrait objects and expire relevant backups according to the approved policy. Preserve unrelated team content and identities. Advance draft versions during cleanup and record an operational audit event; preserve publication/head relationships. Do not delete an entire bucket or an entire team's content.

Recovery from an older backup must occur privately, with migration 0006 and roster retirement applied before enabling public access. A pre-retirement backup must never be exposed directly. Source data still publicly published by SportAdmin is outside this cleanup; H43 must address any source publication objection there separately.

## Validation record

Local validation passed: 92 Worker/API/tooling tests, 108 Python tests, 44 widget browser cases and 22 coach-portal browser cases, plus TypeScript checks and staging/production asset builds. Desktop/mobile screenshots were reviewed. The migration tests cover portrait IDs found in both drafts and history, denial after reference removal, and historical rollback. UI tests verify four tabs, no player-image requests even from a legacy API payload, preserved team images/contacts and private preview/publication. Staging deployment validation is recorded below when complete. Obsolete roster-success tests are replaced by retirement/non-disclosure tests; existing parser fixture tests remain. No claim of a full fresh security audit or GDPR certification is made.

## Staging deployment

On 2026-11-19, staging configuration isolation passed and the only pending migration was 0006_retire_youth_roster.sql. It applied successfully to the dedicated staging D1. API/assets Worker version: `144826ad-35b1-44cc-a3f4-7693bd469099`. Preview: https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/ . Existing staging editor/ingestion remain disabled; no production resource was changed.

The updated standard staging smoke passed its P11 contract, headers, CORS, unknown-team, unsupported-method and retired-endpoint checks. All eleven staging team APIs passed the retirement smoke checks. All 17 previously published portrait URLs returned 404; inventoried legitimate team hero images remained accessible. Unknown teams returned 404, unsupported public methods 405, retired internal endpoints 410, and expected CORS/no-store behavior passed. Calendar data was available for all teams; upcoming match lists were valid empty results at check time. The updated smoke-tool unit tests also passed (7 tests, included in the broader tooling suite). The private URL inventory and counts-only smoke report remain ignored. The first run encountered a TLS transport failure after several teams; retry uses normal certificate validation and bounded transport retries, with unchanged assertions. Smoke tooling no longer performs a live SportAdmin roster scrape.

Production release approval is required before applying the same additive migration and deploying the roster-free API/admin and v1.26.0 assets to production. Production still runs the earlier roster-serving backend until then. Historical private data has not been deleted.
