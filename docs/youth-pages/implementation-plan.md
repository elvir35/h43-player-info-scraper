# Current delivery status — 2026-11-16

The production API/widget and Access-protected coach portal are active. Production authenticated synchronization is configured every six hours and its all-team dispatch passed; staging editing and ingestion are disabled. The user will publish the prepared Webnode embed/directory personally. See [the current cutover record](production-cutover.md). Image uploads, named contacts, editor navigation, registration CTA and optional roster details are available. Shared-page/team onboarding work is documented in [team-onboarding.md](team-onboarding.md). First automatic production ingestion, actual Webnode publication/verification and individual coach acceptance remain launch checks.

## Phase 6 — Production rollout

Readiness review and concrete rollout/rollback: [production rollout review](production-rollout.md), with [production validation results](production-validation.md) and [completed cutover work/manual Webnode instructions](production-cutover.md). On 2026-11-16, the user approved provisioning, migration, deployment and the subsequent portal/scheduler cutover. Dedicated production D1/R2, API/assets and protected admin Worker are active. Frozen data parity, preserved identities/history/media/permissions, administrator login, private upload/preview, unchanged-content publishing and authenticated GitHub synchronization for all eleven teams passed. Staging editing and ingestion are disabled. The user will handle Webnode publication; automatic scheduled ingestion and individual coach acceptance must still be observed.

Finish manual Webnode publication and public-page checks independently of the later team lifecycle investigation. Observe scheduled ingestion, verify an individual coach's final login/publish flow, and confirm operational ownership, backup retention and notifications. Cutover approval and the authoritative coach-portal/scheduler switch are complete; do not reopen staging editing without reconciling newer production content.

New teams and retired teams remain explicit operator tasks using the existing reviewed configuration and onboarding process during this phase. Automatic discovery or retirement of teams is not a production-launch prerequisite.

## Phase 7 — SportAdmin team additions and removals investigation

Status: deferred until after production launch; not implemented. This is a separate follow-up phase and does not block Phase 6.

Investigate how teams added to or removed from SportAdmin should be reflected in the youth website. SportAdmin remains authoritative for membership; the current reviewed team registry does not automatically discover or retire teams.

1. Identify and verify the public SportAdmin source for the complete team list, including stable group identifiers, roster links and how seasonal renames, merged teams and changed groups appear.
2. Determine how to compare that source with the configured teams and distinguish a genuine new or retired team from temporary outages, incomplete responses or navigation changes. Evaluate repeated successful observations and failure retention before choosing a detection policy.
3. Define the onboarding process for a new team: roster and match/calendar mappings, birth-year label and public URL, publication authorization, ingestion credentials, coach assignments and the Webnode youth-directory link. Assess which steps can safely be automated and which need operator review.
4. Define the retirement process for a confirmed removed team: public-page and directory behavior, roster-sync scheduling, coach access, content/history retention, existing links and possible reactivation. Do not assume that one missing scrape should remove a website team.
5. Recommend the smallest maintainable approach, preferably reusing the existing scraper workflow, configuration and D1. Specify who receives change/failure reports and who handles onboarding or retirement. Explain any proposed additional infrastructure before adopting it.
6. Document the proposed behavior, trade-offs and acceptance tests for additions, removals, renames, temporary failures and reactivation. Review the design before implementing team lifecycle automation.

Deliverable: update [team-onboarding.md](team-onboarding.md) with verified findings, the selected lifecycle process, remaining dependencies and an implementation checklist. Until that design is implemented, team additions and retirement remain explicit operator tasks; ordinary player/coach roster synchronization continues unchanged.

## Optional follow-up — roster responsibilities, numbers and positions

Implemented and validated in staging on 2026-11-13: [optional roster details](roster-details-proposal.md), including private source identities and membership-incarnation keys, leader responsibilities, and optional player shirt numbers/positions. SportAdmin membership stays read-only; D1 and draft/preview/publish are reused. All eleven approved teams were resynchronized with private identities. Public Webnode display requires v1.19.0 embed assets; production deployment remains a separate approval gate. Phase 7 team lifecycle discovery and scheduled synchronization activation remain separate work.

# Youth pages delivery record

## Phase 5 current status — local implementation, staging not deployed

The coach portal, Access JWT verification, D1 team permissions, drafts/preview/publication/history/rollback, private R2 photo flow and Swedish UI are implemented and locally validated. Phase 5's full definition of done is **not met yet**: actual Access/R2 configuration and explicit staging deployment approval remain required. No production or Phase 6 work was performed. Earlier phase records below describe their historical handoffs.

| Changed area | Phase 5 files |
| --- | --- |
| Admin API/security | `worker/src/admin.ts`, `admin-auth.ts`, `admin-images.ts`, `editorial.ts`, `node-buffer.ts` |
| Published API integration | `worker/src/index.ts`: published editorial projection/current-photo GET only; public admin routes remain absent |
| D1 | Additive `worker/migrations/0004_coach_editorial.sql`; user/assignment/state/revision/image/audit tables, no roster or event duplication |
| Coach portal | `admin/index.html`, `app.js`, `app.css`, build/dev scripts and Playwright config/tests |
| Public/shared preview | `frontend/src/api.ts`, `team-page.ts`, CSS/build/test updates; local v1.3.0 candidate supports optional editorial fields, private preview uses the same source |
| Configuration/tooling | `worker/wrangler.admin.jsonc`, admin staging/bootstrap scripts, staging DB-sharing/media guards; package/lockfile/tsconfig and CI updates |
| Tests | `worker/test/admin.test.mjs`, `admin-config.test.mjs`, updated existing API/staging tests, `admin/test/editor.spec.mjs` and public frontend regressions |
| Documentation | `admin-architecture.md`, `admin-security.md`, `coach-user-guide.md`, this record, API/architecture/README updates |

Validation: **66 API/tooling/security tests passed**, **6 admin browser workflows passed**, **20 public frontend browser tests passed** (two live-network cases intentionally skipped), **81 Python tests passed**, typecheck/build and admin development dry run passed. Full npm audit reported zero known vulnerabilities. Screenshots of desktop/mobile editor were visually reviewed. Tests used cryptographically signed synthetic identities and local workerd/D1/R2; they do not prove real Access login or hosted staging behavior.

The user's administrator/P11-coach bootstrap was prepared privately without executing it. Migration 0004 has only been applied to disposable local test databases. The current Cloudflare OAuth login returned 403 for Access/R2 metadata; an additional dashboard check reached sign-in, not authenticated settings. h43lund.se was absent from the available zone inventory. No resource/identity/DNS policy was invented, provisioned or modified remotely.

Proposed staging address is `https://h43-youth-admin-staging.elvir-arslanovic.workers.dev` (not deployed); preferred future production address is `https://admin.h43lund.se` after DNS/account review. A private staging bucket, actual Access issuer/audience/policy, the admin CSRF secret, suitable image-processing CPU plan/timing, reviewed migration/bootstrap and explicit user staging approval are prerequisites. The brief's Step 10 says deployment occurs “after local tests pass and explicit approval is given.” Detailed setup, commands, retention, rollout/rollback and risks are in [admin architecture](admin-architecture.md), [security review](admin-security.md) and [Swedish coach guide](coach-user-guide.md).

## Historical phase records

Status: Phases 2–4 implemented and validated, 2026-11-11. API, dedicated D1 and frontend preview are deployed to isolated staging. No production deployment, Webnode page edit or coach portal. Phase 3 details below are historical; see the Phase 4 delivery record at the end for current status.

## Decisions and scope

One TypeScript Worker and environment-specific D1 databases integrate the existing Python roster scraper and existing [matches](https://h43-matches-api.vercel.app/api/matches)/[calendar](https://calendar-api-black.vercel.app/api/calendar) APIs. No duplicate scrapers, KV, queues, membership editor, player approval states or separate backend service were added.

SportAdmin is authoritative. Names-only snapshots automatically reflect additions/removals and verified empty sections; failed/incomplete scrapes retain last-valid data. D1 persists one complete snapshot per team/season, using bound atomic conditional writes and microsecond versions. Publication authorization is an operator prerequisite per season, not an approval step for ordinary synchronization.

P11 group 378673 is verified. A sporting season/date range is not needed for the pilot. Current-team mode and automatic weekday/day/month resolution remove those setup requirements. Staging publication was explicitly approved and deployed validation is complete; see staging-deployment.md. The migration seeds identity only, with nullable season and no fictional content/names/fixtures. Those configuration gates are explicit rather than guessed.

## Files and results

| Area | Files / implementation |
| --- | --- |
| Worker API | `worker/src/index.ts`: public read-only aggregate, authenticated team-scoped private ingestion/read/failure/refresh, safe errors/CORS/headers/rate limits |
| Validation | `worker/src/validation.ts`: exact schemas, names-only projection, timestamp precision, body/response bounds, HTTPS/social URLs |
| Existing feeds | `worker/src/sources.ts`: exact team/season mapping, chronological Stockholm dates/DST, cancelled/postponed handling, optional fields and bounded 300s schedule cache |
| D1 | `worker/migrations/0001_teams_and_snapshots.sql`, `0002_p11_configuration.sql`: team/season/editorial configuration, complete snapshots and attempt status |
| Tooling | `worker/package.json`, lockfile, tsconfig, wrangler config: pinned local tooling, explicit environments, no invented remote IDs or runtime dependencies |
| Python adapter | `src/h43_scraper/cloudflare.py`, `scripts/sync_youth_roster.py`: authenticated HTTPS RosterStore implementation, source/season/version checks and no secret/body logging |
| Scraper hardening | `src/h43_scraper/youth_roster.py`: streamed 2 MiB HTML limit; section/name semantics retained |
| Tests | `worker/test/api.test.mjs`, `tests/test_cloudflare.py`, extended youth scraper tests: real local D1/workerd, mocked upstreams and synthetic Python -> HTTP Worker integration |
| CI/scheduling | Youth scraper workflow adds opt-in protected-environment ingestion; new youth API CI runs Python/typecheck/Worker tests with no deployment credentials/action |
| Documentation | Updated all four architecture documents, added `security-review.md` and `deployment.md`, updated README and secret/state ignores |
| CK knowledge | Record final architecture/security constraints and source identity/unknown metadata rules |

The existing senior scraper, schema-v3 JSON and senior scheduling/consumers remain unchanged. No live youth names or HTML were saved as fixtures or public artifacts.

## Validation performed

- TypeScript typecheck and bundled Worker build.
- Python fixture/client suite including existing senior tests and new HTTP adapter/size-bound tests.
- Local workerd/Miniflare API/D1 suite, including real Python -> loopback Worker -> local D1 synchronization with synthetic data.
- Unauthorized/invalid/cross-team ingestion, malformed/oversized payloads including chunked input, SQL injection, XSS, unsupported methods, invalid social URLs, internal-field exposure, replay/concurrency/microseconds/season transition, CORS, rate rejection, cache invalidation and fresh roster removal.
- Existing feed schemas re-inspected before adapter implementation. Automated tests mock them, exercising empty/malformed/failure/chronological/DST/cancelled/postponed cases rather than relying on live fixture schedules.
- Wrangler migrations applied locally; repeat application verifies migration history. Development deployment dry run succeeds and exits without deployment.
- Full npm audit initially found dev-tool transitive advisories; verified patched sharp/undici overrides were installed, with zero known advisories afterward. Re-run runtime tests after dependency changes.
- Documentation links/JSON/whitespace, workflow/configuration/secret-ignore checks and final diff checks.

Final results: **81 Python tests passed**, **39 Worker/D1 tests passed**, TypeScript/build passed, local migrations applied and repeated with no pending migrations, and development deployment dry run exited without deploying. Full npm audit reports zero known vulnerabilities. Documentation/workflow/configuration/ignore/whitespace checks passed. GitHub Actions itself and real account permissions/rate behavior were not exercised remotely. Local testing does not establish production authorization.

## Operations and rollback

Follow [deployment.md](deployment.md) for npm/Python setup, local D1 migrations, real team/season mapping, secret generation/rotation, scheduled/manual refresh and deployment rollback. All staging/production IDs, routes and secrets must be verified and configured separately. Root configuration has no remote binding; public delivery is disabled outside local development by default. No workflow was enabled and no secret/repository variable changed remotely.

Production requires explicit user approval for the exact artifact/configuration/migrations after critical controls and staging checks are satisfied. There is no automatic deployment action. Preserve roster removals and publication withdrawals when rolling back code; stop public delivery and reconcile authority before restoring a backup. Inactive-season/log/backup retention requires club ownership and policy.

## Phase 3 handoff dependencies (historical)

1. Confirm applicable publication authorization before publicly exposing P11 names. P11 current-team mode uses the supplied feeds without manual sporting season/date setup.
2. Provision/verify separate staging/production D1/Worker bindings, routes, unique limiter namespaces, secret scopes and protected GitHub environments. No IDs or credentials were invented.
3. Perform reviewed staging smoke tests with real infrastructure, then obtain production approval. Live deployment and Webnode changes remain out of scope.
4. Assign source-failure monitoring, credential rotation, retention and backup/restore ownership. Native rate limits are approximate, not a global guarantee.
5. Later phases build a plain-text-rendering Webnode frontend and an independently authorized editorial portal; no roster management, portraits or profiles. Proposed P11 path remains `https://www.h43lund.se/lag/p11/`, subject to site-owner review.

See [security-review.md](security-review.md) for trust boundaries, threat mitigations, tests and prioritized remaining risks.

## Staging validation update — 2026-11-11

The user explicitly approved staging deployment and displaying P11 player/coach names. The dedicated h43-youth-api-staging Worker is now deployed with its separate staging DB and team-scoped secret. Live roster/schedule, public contract/CORS/method/header, replay/team isolation, controlled failed-scrape recovery, cache refresh and existing-service baseline checks passed. No production resources or Webnode links changed; no Phase 4 implementation was started. See [staging deployment results and rollback](staging-deployment.md) for the authoritative current operational state. Six-hour GitHub automation remains disabled pending repository workflow publication and protected environment secret setup; manual authenticated refresh is verified.

## Phase 4 delivery — 2026-11-11

The reusable vanilla TypeScript/CSS widget implements all requested sections, validated API fetching, plain-text rendering, Shadow DOM isolation, null/error fallbacks and Stockholm dates. It supports multiple configured teams and future editorial updates through the existing API content structure. No portal, roster editor, schema change or new infrastructure service was introduced.

New source/config/build/server/test scripts and frozen v1.0.0 release live in `frontend/`. The existing Worker configuration/generator adds staging-only static assets with API-first routing and an isolation regression test. Worker package/lockfile adds pinned Playwright and frontend build/typecheck/test commands. CI now includes mocked browser tests; workflow publication remains outstanding. README and architecture/API/SportAdmin/security/staging documentation are updated. [Frontend guide](frontend.md) contains exact embed/development/deployment/rollback instructions; [backend issue register](backend-issues.md) distinguishes source limitations and remaining release gates.

Staging version `29980a75-2a0a-4e58-a00f-8efc074a2549` hosts the [real P11 preview](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/), immutable central assets and unchanged API. No migration was required. Dedicated D1 and ingestion authentication were preserved. Eight existing Workers and routes remained unchanged; both feed APIs returned 200 JSON.

Validation passed: **19 browser tests** (18 mocked + live API), an additional deployed-preview browser check/screenshots, **47 API/tooling tests**, **81 Python tests**, typecheck/build, staging deployment dry run, live API/hosting smoke checks and npm audit (zero known advisories). Mock responsive tests cover 320/390/768/1440px; real screenshots cover desktop and 390px mobile. Actual Webnode editor/published-block behavior is explicitly untested.

Phase 4 is complete at staging. Remaining release blockers: workflow publication/protected secrets, enabled and observed six-hour sync, monitoring/production review and a real authorized Webnode test. Phase 5 has not started.

## Phase 5 text-only staging launch — 2026-11-11

Launched the Access-protected coach portal at https://h43-youth-admin-staging.elvir-arslanovic.workers.dev/ on the user's explicit launch request. Photos are deferred, so this is a reduced-scope launch rather than completion of the original photo-upload definition of done. Production remains unchanged; Phase 6 has not started.

Changed the admin Worker feature contract/upload and draft guards, Swedish photo-availability UI, staging generator/template, synthetic harness, API/config tests and browser tests. The generator now supports verified Access + D1 without R2/paid CPU when images are disabled. Applied additive migration 0004 and approved private identity bootstrap; securely installed CSRF secret. Deployed admin/public staging Workers and froze frontend v1.3.0 while retaining old releases. No secrets or resource IDs were added to tracked configuration.

68 API/config/security tests, seven admin browser cases (six established plus one text-only regression), 20 public browser tests, typecheck/build, staging dry run and credential/link checks passed. Two optional hosted frontend checks were skipped. Live real-admin draft/preview/publish/widget/rollback, anonymous denial, public contract/CORS/methods, live roster/schedule chronology and audit checks passed. Original test content was restored. Eight unrelated production Workers/routes and SportAdmin snapshot/ingestion state were unchanged.

Remaining: coach's own first sign-in, photo-processing/domain decision if uploads are restored, operator monitoring/retention ownership, separate production review and GitHub six-hour workflow publication/protected secrets. See admin-architecture.md for versions/configuration/rollback and coach-user-guide.md for the current usable feature set.

## Phase 5 editorial follow-up — v1.4.0

Fixed welcome-heading placement and clearer season/contact rendering, and added a shared safe formatting renderer plus Swedish editor toolbar/preview. Updated admin bundling, widget tests, coach tests and synthetic harness version; added an exact P11 embed replacement file and image-cost review. Deployed only existing staging Workers, froze v1.4.0, and retained old releases. No D1 migration or user-content mutation was necessary.

Typecheck/build, 21 public browser cases, eight coach browser workflows and two deployed/Webnode compatibility checks passed. The live Webnode block remains v1.2.0 and must be explicitly updated before these fixes appear there. Images/R2 prices were reviewed at the user's request; uploads remain pending activation approval rather than reported complete. See admin-architecture.md for deployed versions and image-cost-review.md for prices/assumptions.

## Phase 5 image upload completion — 2026-11-11

The user authorized the included-allowance/usage-billed route and personally activated transformations-only Images ($0 base) and R2. Implemented native Images processing with sanitized private WebP output and a type-aware JPEG/WebP storage/serving contract, keeping Workers Free. Created the dedicated private Standard staging R2 bucket, verified both public-domain mechanisms disabled, added the Images binding and seven-day orphan cleanup trigger. Applied additive staging migration 0005. No production, Webnode DNS or embed changes were made.

Changed admin-images/admin/editorial Workers, staging config generator, admin error messages, migration 0005, local fixture migration lists, image-processing/MIME/config tests and operational/security/user documentation. Validation: 74 API/config/security tests, eight admin browser workflows, typecheck/build, actual signed-in portal upload/private preview, real output decoding and metadata inspection, public 404 before publication, no saved draft/history test-image references, public contract/source smoke checks and eight unchanged production Workers/routes.

Public staging version c9e4948a-4cd1-4aca-90d7-db5b0381ae02; admin 7bccaf64-bc78-4793-8909-01e12705716b. Real team-photo publication remains conditional on administrator club permission and per-image confirmation. A synthetic private test upload remains unreferenced and eligible for scheduled cleanup; its unsaved browser test tab should be closed without saving after a browser-control interruption. Coach's own first real login, monitoring ownership, repository workflow publication and production rollout remain separate work.
