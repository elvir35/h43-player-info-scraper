# Production rollout review — 2026-11-16

Status updated 2026-11-16: the user approved isolated production provisioning, migration and deployment for validation. The dedicated production resources are deployed; the public API is enabled for validation and the production editor remains disabled until cutover. Webnode cutover is not approved or executed. See [production validation results](production-validation.md). SportAdmin team lifecycle automation stays in Phase 7.

## Verified today

- All eleven existing teams synchronized through authenticated ingestion. The first main-branch GitHub run succeeded and D1 observation timestamps confirm all eleven updates, with published editorial JSON, draft versions and revision pointers unchanged.
- Workflow: [Synchronize youth roster](https://github.com/elvir35/h43-player-info-scraper/actions/workflows/scrape-youth-roster.yml); [successful initial run](https://github.com/elvir35/h43-player-info-scraper/actions/runs/43845154797); [merged scheduling-only PR](https://github.com/elvir35/h43-player-info-scraper/pull/1). Merge commit e7ae03b7778bd0f6a9a532fbaac699898c0abba9 adds only the scraper/workflow dependencies and synthetic tests. The existing senior workflow is unchanged.
- Staging GitHub environment allows only branch main. It holds H43_INGEST_TOKENS_JSON as an encrypted environment secret, never a deployment credential. Non-secret variables select all teams, authenticated synchronization, the verified staging origin/account subdomain and a six-hour interval. Repository YOUTH_ROSTER_ENABLED=true activates the job. The user explicitly approved storing the existing team-scoped ingestion map and saved it through the GitHub UI. The temporary clipboard transfer was cleared.
- Hourly UTC ticks at minute 23 gate actual scraping to 00:23, 06:23, 12:23 and 18:23 UTC (01:23, 07:23, 13:23, 19:23 Stockholm time in November). A manual run proves execution/authentication, not cron delivery. First successful scheduled ingestion is still a required observation; GitHub may delay scheduled jobs. No claim of a successful scheduled run has been made yet.
- Four named-email Access allowlist entries match four enabled D1 portal users. The incorrect old coach account is not active. The existing application protects the exact staging admin host; anonymous portal HTML, JavaScript and admin API requests redirect to Access. The policy was reviewed in the signed-in dashboard because the existing API credential returns 403 for app detail. No policy was changed.
- Staging R2 managed-domain access is disabled and no custom public domain is attached. All 22 ready media objects were backed up encrypted and verified byte-for-byte. D1 backup includes 11 teams, all roster identities, drafts, published history, media metadata, permissions and audit rows; decrypt/restore into a disposable in-memory SQLite database passed row-count and foreign-key checks. One transient media download timeout was retried only for the remaining object.
- Live P11 contract, CORS, no-store, unknown-team/unsupported-method rejection, unauthenticated-ingestion denial, exact source filtering and chronological next match passed. All eleven real API/team pages and Webnode compatibility checks passed. An overly strict smoke assumption about immutable team display names was corrected; IDs remain exact and coach-edited names are preserved.
- Eight unrelated Worker configurations are unchanged. No production database or bucket currently exists for youth pages; no new production resources were created.

## Release candidate validation

106 Python tests passed, including ten new environment/origin checks. The 100 existing Worker/API/tooling tests passed, plus 16 new production-configuration/build isolation tests. All 60 local widget browser cases and 21 admin workflows passed. Three optional hosted cases were skipped locally and subsequently all three passed against staging/all-team/Webnode hosts. Type checks and frontend/admin builds passed. npm audit found zero known advisories.

The new production build path was exercised only with a clearly synthetic local host. Production outputs and archives are separate from staging; frozen staging v1.24.0 bytes remain unchanged. Synthetic output is not a deployable production artifact and was not frozen. The new generator refuses missing/shared D1, non-private/shared R2, staging/incorrect Access applications, mismatched audiences, entitlement changes and limiter collisions. Delivery defaults disabled, and --check rejects drift.

## Proposed smallest production setup

Keep Webnode and its existing domain provider. Use dedicated workers.dev hosts in the same verified Cloudflare account; no DNS move, custom domain, queue, KV or additional hosting service is required.

| Component | Proposed name | Scope |
| --- | --- | --- |
| Public API and central assets | h43-youth-api-production | New Worker; no existing routes; H43 browser origins only |
| Coach portal | h43-youth-admin-production | New Worker; authenticated assets and mutations; production-only service binding |
| D1 | h43-youth-production | Separate from staging/metrics; bound only to the two production youth Workers |
| Private media | h43-youth-images-production | Separate Standard R2 bucket; public domains disabled; same existing Images normalization |
| Access application | H43 Youth Admin — Production | Exact production admin host; independently verified audience; same four approved named users |
| GitHub synchronization | Separate production environment | New per-team ingestion credentials; no account-wide deployment token; main-only secret access |

Planned hosts are https://h43-youth-api-production.elvir-arslanovic.workers.dev and https://h43-youth-admin-production.elvir-arslanovic.workers.dev. They are proposals until resources are created and verified. The current staging hosts stay available throughout migration.

## Preparation and exact deployment sequence

1. Obtain explicit approval for the above dedicated production resources, data migration and rollout. Do not create or deploy them silently. Require a successful scheduled staging ingestion before production cutover.
2. Record fresh real account/subdomain/Worker/database inventory in ignored worker/.production/inventory.json; record verified Access organization/application, R2 privacy and existing Images entitlement in .production/access-inventory.json, and issuer/audience in .production/settings.json. Follow the input schema used by productionConfigs and its synthetic tests; never invent resource IDs or put secrets in these files.
3. From worker/, run node scripts/production-config.mjs, then node scripts/production-config.mjs --check. It generates only production configs and .production/frontend.json; both API/admin start disabled. Verify no existing Worker, route, DB or bucket is referenced.
4. Build the production-specific assets using node ../frontend/scripts/build.mjs --production-config .production/frontend.json --freeze and node ../admin/scripts/build.mjs --production-config .production/frontend.json. These write frontend/dist-production, frontend/releases-production and admin/dist-production, leaving staging output untouched. Record manifests and exact source revision. Do not use the synthetic build fixture for deployment.
5. Apply the five reviewed additive migrations only to the verified new production DB with the generated production config. Migrations seed only an unapproved source identity, not current editorial content. Import the consistent staging state separately: preserve team/member/image IDs, editor grants, active/disabled user state, drafts, revisions and audit history. Copy sanitized image bytes, object keys and content types into private production R2; verify all references and checksums. Do not rerun roster identity creation against an empty DB before copying IDs, because that would detach existing player details/photos.
6. Use a short announced coach editing freeze for the final consistent D1/R2 export and import, or stop staging mutation delivery for that cutover window. Pause staging roster synchronization during the final copy. Reconcile any publication withdrawals/removals; do not restore old membership from earlier backups. Existing public pages continue reading staging until cutover. Reopen editing only on the chosen authoritative portal after verification; do not leave two independent editable copies.
7. Configure the separate exact-host Access app and production-only CSRF secret. Generate fresh production per-team ingestion tokens and store only their digests in the production API Worker. Store raw tokens only in the production GitHub environment. Never reuse staging credentials; do not put Cloudflare deployment credentials into the scraper workflow.
8. After explicit deployment approval, deploy the reviewed disabled API/admin configs with npx wrangler deploy --config wrangler.production.generated.jsonc --env production and npx wrangler deploy --config wrangler.admin.production.generated.jsonc --env production. Verify D1/R2/service/Images/limiter bindings, Access and assets. Only then review and approve the narrow activation diff PUBLIC_API_ENABLED=true and ADMIN_ENABLED=true; the disabled-preparation --check intentionally rejects that activation diff until it is reviewed separately.
9. Perform production canary checks before changing Webnode: all-team public contract/freshness/source comparisons, unauthorized/cross-team/CSRF checks, a reversible synthetic upload/private preview/publish/recovery exercise, correct anonymous image revocation, one real coach login, media hashes, and no unexpected production routes. Use an explicit production-target smoke tool; existing staging smoke commands intentionally refuse production targets. Delete no real data for testing.
10. Prepare and approve replacing both central asset URLs in the shared Webnode embed with the verified production version. Replace the youth-directory block with frontend/youth-teams.html after review. On 2026-11-16 the actual /ungdom/ browser DOM still has 11 SportAdmin links and zero shared-page links, so this directory change is necessary for visitors to find the new pages. Validate every birth-year query URL, mobile navigation and one coach publish-to-public link after Webnode publication.
11. Enable production synchronization with its own verified environment/origin, credentials and explicit YOUTH_ROSTER_PRODUCTION_APPROVED=true. Disable staging synchronization after cutover. Verify a production dispatch and scheduled run, record production versions/configuration/manifests and announce the new coach login URL.

This sequence is the rollout checklist; the linked validation report distinguishes completed work from remaining cutover steps. The generated disabled configurations remain recovery baselines, not a statement of current live flags. A separate ignored validation configuration enables only the public production API; the production editor remains disabled. No paid Workers plan or new subscription was added; the existing approved Images/R2 usage terms remain applicable.

## Monitoring, retention and rollback

Proposed operations owner is the portal administrator; confirm the incident contact before public launch. Enable the owner's native GitHub failed-workflow notifications and check Actions/roster freshness after a failure. No Slack/email service is added. Treat a failed scrape as retention of last-known valid data, not an empty roster. Investigate missing scheduled runs or roster age exceeding two nominal intervals; use workflow_dispatch for urgent refresh after changing membership in SportAdmin.

Keep encrypted migration backups privately; test decryption/restore and retain an agreed limited recovery window rather than committing youth data or images. The orphan-image cleanup already preserves references in drafts/history. Do not add an unreviewed broad media lifecycle deletion rule.

For workflow problems set repository YOUTH_ROSTER_ENABLED=false; that stops new sync runs and preserves existing snapshots. For code/UI regressions, restore the prior compatible Worker/asset version and keep portrait-aware identity/cleanup logic. Record the last staging public version d5422257-18d2-44b5-94df-afc7943c8dc9 and admin version 4a90df93-c900-4232-9326-6d0cdc17d17a as the current fallback baseline, not production deployment IDs.

Before any production editorial write, Webnode can be pointed back to the unchanged staging assets using the saved embed. Once production coaches have edited or membership has changed, blind fallback to an old staging DB is unsafe: freeze writes, export/reconcile newer content and withdrawals/removals, synchronize authoritative membership and then reopen one portal. Turning off public delivery is safer than republishing withdrawn images or removed members. Migrations are additive; do not destructively downgrade a portrait-aware DB/backend.

## Remaining gates

- Observe the first successful scheduled staging ingestion; initial manual GitHub execution is verified.
- Explicit Webnode/coach-portal cutover approval; production provisioning and validation deployment are already approved and completed.
- Final consistent data/media refresh under a short editing freeze, followed by production editor activation, real coach login and authenticated mutation/upload canaries.
- Production GitHub environment/independent ingestion secret, approved scheduler switch and observed production scheduled execution.
- Owner/notification/backup-retention confirmation and production canary checks.
- Approved Webnode embed plus youth-directory publication and final production URL announcement.

Automatic SportAdmin team discovery/retirement remains Phase 7 and does not block these gates.
