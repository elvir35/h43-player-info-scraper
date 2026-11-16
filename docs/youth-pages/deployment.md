# Local operation, environments and release procedure

Phase 3, 2026-11-11. No credentials or resource IDs are hardcoded. The new staging D1 database and its generated ignored config are prepared from verified account metadata; the approved staging Worker deployment and smoke validation are now complete. See staging-deployment.md for current results.

## Local development

Prerequisites: Python >=3.11 and Node >=22.12. From repository root:

```powershell
python -m pip install -e ".[test]"
python -m pytest
Set-Location worker
npm ci
npm run typecheck
npm test
npm run migrate:local
npm run dev
```

`npm run dev` is `wrangler dev --env development --local`. Local D1 state lives under ignored `.wrangler/`. The configured development database identifier is explicitly LOCAL-ONLY-NOT-A-REMOTE-ID. Never use it with remote migration/deployment. Staging and production have no DB bindings in the template, and public delivery is disabled there.

`GET http://localhost:8787/api/v1/teams/p11` returns the documented public object after local migrations. The seed plus migration 0003 uses current-team mode, with no sporting season/date setup, publication authorization, names or fixtures. Public season is null; the roster is withheld until authorization, while the supplied calendar/match APIs can return live schedule data. Synthetic test configuration is confined to tests; it is not production content.

Migrations `0001`/`0002`/`0003` are versioned by Wrangler. Repeating `npm run migrate:local` skips applied migrations. Do not edit applied migration history in a deployed environment; add a new numbered migration. The runtime schema is documented in [architecture](architecture.md).

## Team/season configuration

P11 uses the current-team partition created by migration 0003. No sporting season label or start/end dates are needed. Optional historical season configuration remains available for future use. Publication defaults false. Set `publication_authorized=1` only after the applicable authorization is established. Do not use suggested dates/labels as evidence.

The provided calendar API is a rolling feed with weekday/day/month. The adapter resolves a unique matching year among previous/current/next Stockholm year; it rejects invalid or ambiguous dates. No monthly manual update is required for P11. Explicit calendar year/month fields remain optional legacy overrides. Match records provide their own year; upcoming data is selected directly by time.

To add another team, obtain these values from the club/public source rather than copying P11's mapping:

| Configuration | Required evidence |
| --- | --- |
| `teams.id`, `name` | Stable slug and approved display name |
| `sportadmin_team_name` | Exact source title/feed label |
| `group_id` | Verified public `/grupp/?ID=...` roster ID |
| Current snapshot partition | Use current mode; no sporting season/dates required. Optional real seasons remain supported. |
| Calendar dates | Automatic weekday/day/month resolution for the supplied rolling feed; explicit context is optional |
| Publication authorization | Applicable permission before exposing names |

Use the same parameterized configuration pattern: `INSERT INTO teams(id,name,sportadmin_team_name,group_id,current_season) VALUES(?1,?2,?3,?4,?5)` with parameter 5 set to the internal key current, and create a matching `team_seasons` row with season=current and empty start/end date bounds. These are parameter placeholders for trusted tooling/reviewed migrations, not literal CLI values. Configure the new team's scraper variables and dedicated credential digest. No Worker or scraper code is copied. Changing an existing source group requires a reviewed mapping change and resetting that team's affected snapshot; it must not relabel an old group's names as new data.

Welcome/social/contact/hero values are nullable trusted editorial configuration, not scraper data. HTTPS Instagram/TikTok profile URLs are validated at projection. No coach editing endpoints are introduced. Membership remains SportAdmin-owned; arbitrary DB membership edits are not an operating workflow.

## Ingestion credentials

Use a secret manager to generate at least 32 random bytes, encoded URL-safe, for each environment/team. Do not pass secrets as CLI arguments, commit them, paste them into this chat, print them in logs or put them in browser assets. Store the raw token as GitHub protected environment secret `H43_INGEST_TOKEN`. Store its SHA-256 lowercase hex digest in Cloudflare secret `INGEST_TOKENS_JSON`, shaped as team -> array of digests. One or two digests support rotation. This is a schema example, not a usable credential:

```json
{"p11":["<64-lowercase-hex-SHA256-digest-from-your-secret-manager>"]}
```

For local ingestion only, an ignored `worker/.dev.vars.development` file may provide `INGEST_TOKENS_JSON` with a genuine local-only digest map. The raw local token stays in the scraper shell's `H43_INGEST_TOKEN` environment variable. For remote secrets, use Wrangler's secret prompt/input with the explicit target environment/config; never include the raw credential in shell command text.

The Python client reads `H43_API_URL` and `H43_INGEST_TOKEN`. Base URL must be the verified HTTPS Worker origin, without path/query/credentials. Explicit local testing can use `H43_ALLOW_LOCAL_HTTP=true` with localhost/127.0.0.1 only. It never follows redirects carrying credentials.

```powershell
# Environment variables are set securely before this command; no token argument.
python scripts/sync_youth_roster.py --team-id p11 --team-name P11 --group-id 378673
```

It reads the active season/version, scrapes SportAdmin, and conditionally writes the complete snapshot. A scrape failure reports only attempt time/status and preserves membership. Failed storage/authentication reports no secret/body. If content committed but the response/status write failed, the next run reads current state; do not restore old names to recover.

## Scheduled and urgent synchronization

The existing opt-in youth workflow keeps its six-hour default and supported configurable intervals. For validation only set `YOUTH_ROSTER_ENABLED=true`; for real ingestion also set `YOUTH_ROSTER_SYNC_ENABLED=true`. Neither was enabled by this work.

`YOUTH_ROSTER_ENVIRONMENT` selects a protected GitHub environment, default staging. Configure that environment's `H43_API_URL`, secret token and reviewed team variables. Require protected branches/reviewers for production. Verify staging has a separate token and DB; never test against production by changing only a hostname in an unprotected workflow.

For an urgent SportAdmin membership update, manually dispatch the same workflow after changing membership in SportAdmin. The normal authentication/schema/CAS rules still apply. No manual player removal or approval endpoint exists.

Aggregate roster responses have no cache. Authenticated POST `/api/v1/internal/teams/:teamId/refresh` with `{}` bumps the schedule cache generation, bypassing old keys globally on subsequent D1 reads. It does not edit or scrape membership. Use the private credential via a secure HTTP client, not Webnode. For an authorization withdrawal, a trusted operator disables the season's publication setting; names stop on the next public read even if scraping is down.

## Remote setup (staging completed; production unapproved)

1. Verify the actual Cloudflare account and create/select **separate** development, staging and production D1 databases as approved. Record actual IDs/names; attach each only to its intended Worker. Do not reuse a production DB for local/staging tests. Restrict account users/API tokens who can edit those Workers or administer D1.
2. Prepare a reviewed config change with the actual remote bindings, or an ignored `wrangler.remote.jsonc` while preparing it. Environment-specific bindings are explicit, not inherited. Keep secrets out of vars. Verify rate-limit namespaces are unique in the account (43011/43012/43013 are proposed labels, not verified existing allocations).
3. Configure verified hostnames/routes. Template workers_dev/preview URLs are disabled. Set exact staging browser origins and production H43 origins; never add wildcard/localhost to production origins. Configure `INGEST_TOKENS_JSON` separately in each environment.
4. Back up before remote migrations using private approved storage. Apply migrations with explicit environment/config and remote target only after the relevant environment is approved. The equivalent local command was tested; no remote command has run here.
5. Verify source mapping and publication authorization; test staging ingestion, concurrency/failure retention, public projection, rate binding, CORS and urgent refresh. Ensure public responses omit internal metadata and names are not cached/logged.
6. Obtain explicit user approval for the exact production Worker version, bindings, migrations, configuration and routing change. A passed local dry run or staging test is not production approval. Only then perform the reviewed manual deployment/migration. No CI deployment action or broad Cloudflare token is included.
7. Set `PUBLIC_API_ENABLED=true` only after all checks and required publication authorization. Review the GitHub production environment/secret setup before enabling synchronization there. No Webnode links or assets change in Phase 3.

Remote Wrangler commands must always specify `--env staging` or `--env production` and the reviewed config. No default/root environment is configured to access a remote database. A deployment token, if later used, must be account/resource-scoped to the intended Worker/D1 operations and stored in an encrypted environment secret, separate from ingestion credentials. Do not use a global API key.

## Rollback and retention

Record the deployed Worker version, migration versions and reviewed configuration. Prefer reverting the Worker to the prior compatible version with Wrangler rollback after reviewing compatibility. Do not revert successful roster removals or authorization withdrawal. Migrations here are additive; future destructive migrations need a tested forward repair/restore plan and a pre-migration backup.

If restoring D1, stop public delivery first, restore only the intended environment, reconcile later authorization changes and obtain a fresh accepted SportAdmin snapshot before re-enabling names. A database backup is not current publication authority. Store exports/backups privately in ignored `.backups/`, never repository artifacts; set owner-approved retention. Current storage holds latest snapshot per team/season and one attempt-status row; no per-player revision history. Inactive seasons/backups/logs still require an operational retention policy.

## Validation and limits

Local workerd/D1 security tests, real Python -> local Worker integration, TypeScript check, Python fixture/client tests, local migrations and development dry run are covered. Npm lockfile is committed; patched sharp/undici overrides address advisories in local tooling, with zero findings in the subsequent full audit. Remove/reassess overrides when a supported upstream tool release incorporates the fixes. No runtime npm dependencies are bundled.

See [security review](security-review.md) for remaining gates. Real account permissions, secret rotation, production rate behavior, publication settings and rolling calendar assumptions are not established by local tests. The frontend and coach portal are later phases.

## Prepared staging configuration (2026-11-11)

The dedicated h43-youth-staging database has now been created and migrations 0001–0003 applied. Existing Workers and the unrelated metrics database were not modified. The staging Worker is deployed and validated. The generated, ignored `worker/wrangler.staging.generated.jsonc` comes from verified resource metadata in ignored `.staging/inventory.json`; no real IDs are hardcoded in the checked-in template. It contains only the staging environment, a dedicated DB binding, no custom routes and workers.dev enabled for the new staging name.

From worker/, regenerate/verify with `node scripts/staging-config.mjs` and `node scripts/staging-config.mjs --check`. A shared DB, conflicting limiter namespace, altered binding or added production environment fails the guard. Preparation and dry run do not deploy a Worker.

After explicit staging deployment approval, the reviewed deploy command is `npx wrangler deploy --env staging --config wrangler.staging.generated.jsonc`. Install a newly generated dedicated ingestion digest secret only on that Worker, retain the raw token in approved encrypted storage, synchronize P11 through the existing Python adapter and enable publication only once authorized. No secrets are stored in the generated config.

The live staging URL is https://h43-youth-api-staging.elvir-arslanovic.workers.dev; deployment and publication were explicitly approved. After deployment and synchronization, run `node scripts/smoke-staging.mjs https://h43-youth-api-staging.elvir-arslanovic.workers.dev`. It refuses production targets, checks the public contract/methods/headers/CORS/auth boundary and compares P11 names, calendar events and next-match chronology against live sources without logging names. Failures report a generic summary only. Deployed failure-retention probing and baseline rechecks must also be recorded before Phase 4. See staging-deployment.md for the approval state and evidence.

## Staging validation update — 2026-11-11

The user explicitly approved staging deployment and displaying P11 player/coach names. The dedicated h43-youth-api-staging Worker is now deployed with its separate staging DB and team-scoped secret. Live roster/schedule, public contract/CORS/method/header, replay/team isolation, controlled failed-scrape recovery, cache refresh and existing-service baseline checks passed. No production resources or Webnode links changed; no Phase 4 implementation was started. See [staging deployment results and rollback](staging-deployment.md) for the authoritative current operational state. Six-hour GitHub automation remains disabled pending repository workflow publication and protected environment secret setup; manual authenticated refresh is verified.

### Verified local manual refresh after deployment

On this Windows user account, from worker/, `python .staging/run-sync.py` decrypts the dedicated staging token using CurrentUser DPAPI and delegates to the existing synchronization CLI. It reports only status/counts. The helper, encrypted token and generated resource configuration are ignored local operational files, not public assets or Git artifacts. The command is staging-only and has been verified against the live Worker. For another machine or CI, securely provision/rotate a dedicated credential rather than copying plaintext into source or chat.
