# Phase 3 staging deployment review

Review date: 2026-11-11, Europe/Stockholm. **Staging deployed and validated following explicit user approval.** No Phase 4 implementation or production deployment.

## Target and isolation

- Deployed Worker: `h43-youth-api-staging`, created separately from the eight pre-existing Workers.
- Dedicated new database: `h43-youth-staging`, Western Europe location hint. Actual ID was returned by Cloudflare and is used only in the ignored generated config/inventory; no resource ID or credential was invented or hardcoded in tracked source.
- Live API: [GET /api/v1/teams/p11](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/api/v1/teams/p11). The account subdomain and dedicated target were verified before deployment.
- Generated config: `worker/wrangler.staging.generated.jsonc`, derived from verified metadata by `worker/scripts/staging-config.mjs`. Only staging exists in this config. DB binding is dedicated, no custom routes are declared, workers.dev is enabled only for the new staging Worker, and preview URLs remain disabled.
- The account has eight existing Workers and an unrelated `h43-usage-metrics` database. Their metadata was inventoried; the new database does not reuse that ID or any existing DB binding. No collision was found for staging rate-limit namespace 43012 in the existing Worker bindings.
- Existing custom zone Worker route inventory was empty; no route, DNS, production Worker, production binding or Webnode link was changed. Baseline metadata is retained in ignored `.staging/baseline.json` for the post-deployment comparison.

## User clarification: no sporting season setup

The user clarified that this is a current-team page consuming the supplied APIs, not a season-management application. Migration 0003 defaults unconfigured teams to an internal `current` snapshot partition with no start/end bounds. Public season remains null. Existing explicitly configured legacy seasons are preserved, but P11 needs no sporting season label/date input.

The provided calendar omits year but includes Swedish weekday/day/month. The adapter now resolves the unique matching year within previous/current/next Stockholm year, checks the weekday/date, and rejects invalid/ambiguous results. No monthly manual setting is required. Match dates provide year directly. These changes passed regression tests and a real-data local integration run.

## Pre-deployment checks

| Check | Result |
| --- | --- |
| Python regression tests | 81 passed; both original senior snapshots validate |
| Worker/D1 and staging tooling tests | 46 passed; includes current-team mode, inferred dates, isolated-config guard and production-target refusal |
| TypeScript and build | Passed |
| Dependency advisory scan | Zero known vulnerabilities in the pinned/overridden dependency tree |
| Secret scan | No candidate secrets found in the inspected working files or 55 Git-history blobs; values were never printed. Secret, generated config, local state and backup paths are ignored. No real ingestion token was found in the environment. |
| Migration review | New tables/verified P11 identity only in 0001/0002; additive current-mode initialization in 0003; no deletion of existing source data or change to explicit seasons |
| Local migrations | Passed, including current-mode regression |
| New staging D1 migrations | 0001, 0002 and 0003 all applied successfully to h43-youth-staging only |
| Staging DB verification | P11 current mode exists, publication_authorized=0, snapshot count=0; no youth names were persisted remotely |
| Staging build dry run | Passed and exited without deployment; only the dedicated staging DB, rate binding and staging variables were present |
| Existing source baseline | Supplied matches/calendar APIs both HTTP 200: 498/313 total rows and 23/14 P11 rows at inspection |
| Local integration using live sources | Passed: 15 players, 4 coaches, 8 future calendar events; earliest future match selected correctly; failed-attempt status retained the prior roster |

The local live-data run used isolated temporary local D1 and loopback/runtime dispatch only, with runtime state disposed afterward. It did not publicly expose names, export roster payloads/HTML, log names or persist names to remote D1. It is a preflight, **not a substitute for deployed smoke tests**.

Reviewed staging dry-run bundle SHA-256: `4daf927e06550065016ad039d5e4e4cf9367ee12ba33bb23c26eb7fae9b070ae`. Rebuild/review if application code, dependencies or deployment configuration changes before approval.

## Prepared configuration

| Setting | Staging value / action |
| --- | --- |
| ENVIRONMENT | staging |
| PUBLIC_API_ENABLED | true on the deployed staging Worker |
| ALLOWED_ORIGINS | Exact www/non-www H43 HTTPS origins and localhost:3000 for staging browser checks |
| DB | Dedicated h43-youth-staging, actual verified generated binding |
| RATE_LIMITER | Namespace 43012, approximate 120 requests/60s/IP/route class |
| INGEST_TOKENS_JSON | Installed as a Cloudflare secret: dedicated P11 credential digest, never public vars |
| H43_API_URL | Verified live staging HTTPS origin |
| H43_INGEST_TOKEN | Generated securely; raw token stored locally with Windows CurrentUser DPAPI encryption in ignored .staging/ingest-token.dpapi; never printed or committed |
| Publication authorization | User explicitly approved displaying P11 player/coach names; enabled only for P11/current in staging |
| GitHub scheduling | Remains disabled; no remote repository variable, environment or secret was changed |

The existing manual OAuth login was reused for authorized staging preparation. No broad account credential was added to GitHub Actions. A dedicated ingestion token is distinct from operator/deployment credentials. Secret installation occurred only after the approved staging Worker deployment. The raw credential is not in Worker vars, public responses, source files or logs.

## Commands and approval gate

Preparation commands already completed, from worker/:

```powershell
node scripts/staging-config.mjs --check
npx wrangler d1 migrations apply DB --env staging --config wrangler.staging.generated.jsonc --remote
npx wrangler deploy --env staging --config wrangler.staging.generated.jsonc --dry-run --outdir dist/staging-review
```

**Executed after the user explicitly approved staging deployment and displaying P11 names:**

```powershell
node scripts/staging-config.mjs --check
if ($LASTEXITCODE -ne 0) { throw "Staging configuration check failed" }
npx wrangler deploy --env staging --config wrangler.staging.generated.jsonc
```

Completed: deployed only this target, installed the dedicated digest secret without printing it, retained the raw token encrypted, enabled the authorized P11/current publication setting and synchronized real SportAdmin names through the authenticated adapter. No production binding/route, source API or Webnode link changed. Automatic scheduled ingestion remains disabled.

## Deployed smoke tests — passed

Run `node scripts/smoke-staging.mjs https://h43-youth-api-staging.elvir-arslanovic.workers.dev` after deployment/authorization/synchronization. It checks:

1. P11 GET 200 and the documented explicit JSON shape, public fields and headers.
2. Current players/coaches compared to the public roster, without printing names.
3. Calendar event fields/content and next match against the supplied live APIs, including chronological selection.
4. Unknown team 404; public POST/PUT/PATCH/DELETE rejected.
5. Exact CORS allow/reject/preflight behavior; no-store; security headers; unauthenticated private read rejected.
6. No private identifiers, raw snapshots or credentials in public responses.

Also perform a controlled authenticated failed-attempt report on staging, confirm valid membership is retained/stale, then run a fresh real scrape to recover. Do not interrupt shared upstream services to manufacture an outage. Local tests cover failed/malformed optional feeds; record what was actually exercised remotely rather than claiming a real upstream outage occurred.

Finally compare existing Worker metadata/routes against the saved baseline and recheck both existing H43 feed endpoints. Record the deployed version, URL, counts, safe test summaries and recovery result here. All listed deployed smoke checks passed. Existing-service baseline and failure-recovery evidence is recorded below.

## Rollback and remaining issues

Before any later rollout, retain the exact deployed version/configuration. If a compatible previous staging version exists, use `npx wrangler rollback PRIOR_STAGING_VERSION_ID --env staging --config wrangler.staging.generated.jsonc`, replacing the placeholder with the recorded real staging version ID. This is a first staging deployment, so before it there is no previous version to restore. For an initial failed release, stop public delivery/withdraw publication and remove only the newly created staging Worker if needed; retain the isolated DB for diagnosis unless its separate cleanup is approved. Do not restore old names or authorization from a backup.

No automatic down migration or production database restore is required: all three migrations were applied only to a newly created staging DB. The existing unrelated metrics DB and all existing Workers remain outside rollback scope.

No critical application security finding was observed in the review or deployed smoke checks. Deployment approval, secret installation, publication setting, deployed smoke/failure recovery and existing-service baseline verification are complete. Remaining operational work is enabling the protected staging GitHub synchronization workflow once these repository changes are published and configuring its encrypted environment secret; no broad deployment token is needed. The rolling calendar's year inference assumes nearby-year data and deliberately rejects ambiguous dates. Real-world source inaccuracies remain a SportAdmin responsibility.

**Phase 3 handoff:** API staging validation completed. Phase 4 has since completed as recorded below. For unattended freshness, publish/configure and enable the protected six-hour sync workflow; manual authenticated refresh is verified. Production still requires separate explicit approval.

## Final deployed results

- Initial reviewed code deployment: `19f43e0f-384b-44d0-9e9e-24f5308b03e1`.
- Active known-good version after secret installation: `ac858204-1dab-498a-99d9-e6cc5a3f5e4d` (100% staging traffic).
- Migrations 0001–0003 applied to the dedicated staging database; publication enabled only for P11/current following user approval.
- Live synchronized roster: **15 players and 4 coaches**; both exact name lists matched SportAdmin without logging names.
- Upcoming calendar: **8 events**, with fields/content matching the live feed. Earliest eligible match matched chronological live SportAdmin data.
- P11 HTTP 200, unknown team 404, unsupported public methods 405; missing/invalid ingestion credentials 401; a P11 credential attempting another team 403; replay and older snapshots 409.
- Exact-origin CORS/preflight/rejection passed. JSON response has no-store, nosniff, no-referrer and a restrictive data CSP; no internal identifiers, snapshots or secret material were returned.
- Controlled failed scrape: no roster write, retained prior membership, public stale status; a subsequent real scrape restored available status and its new successful synchronization timestamp immediately.
- Authenticated schedule-generation refresh produced newer successful calendar/match fetch times while leaving roster version/membership unchanged.
- Final status: roster, calendar and matches all available. All eight existing Workers have their original modification timestamps, route inventory is unchanged, and both existing H43 feed endpoints return HTTP 200 JSON.
- Native rate-limit/secret/dedicated D1 bindings were verified through Cloudflare metadata. No production resources were modified.

The failed-scrape scenario was intentionally simulated through the normal orchestration/failure-report path on staging and then recovered. Shared calendar/match services were not deliberately interrupted; their failure/malformed cases remain covered by local integration tests.

### Concrete rollback reference

For a future failed staging release, restore the recorded known-good version, after verifying compatibility:

```powershell
npx wrangler rollback ac858204-1dab-498a-99d9-e6cc5a3f5e4d --env staging --config wrangler.staging.generated.jsonc
```

This command is a reference, not an action performed during validation. It targets only staging. Do not roll back successful D1 membership removals or authorization decisions. To stop public names immediately, a trusted operator can set publication_authorized=0 only for P11/current in this staging DB. The production Worker/database/route inventory is never part of this rollback.

Generated configs, Cloudflare metadata, safe smoke summaries and the encrypted local credential remain ignored. GitHub automatic synchronization has not been enabled, and no repository branch/code was pushed by this deployment task.

## Phase 4 staging extension — 2026-11-11

Active version `29980a75-2a0a-4e58-a00f-8efc074a2549` adds the [P11 preview](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/) and `/team-assets/v1.0.0/` using Worker Static Assets. There are no new databases, migrations, services or production routes. API handlers remain unchanged; `/api/*` always runs the Worker first. Dedicated D1, secret preservation and authenticated ingestion were reverified.

Deployed browser rendering, exact live roster/feed chronology, CORS/methods/no-store/internal protection and asset hash/cache/CSP checks passed. Fifteen players, four coaches and eight activities matched the API. Eight original Workers retained modification timestamps, routes were unchanged and both source APIs returned 200 JSON. Six-hour sync remains disabled and actual Webnode testing is outstanding. See [frontend delivery/embed/rollback](frontend.md) and [release blockers](backend-issues.md). The prior API-only rollback reference is historical and may remove frontend availability if restored.
