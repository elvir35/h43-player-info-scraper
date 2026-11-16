# Production deployment for validation — 2026-11-16

**Subsequent cutover:** production editing and authenticated GitHub synchronization are now active; staging editing/ingestion are disabled. The user chose to publish Webnode manually. See [the current cutover record and exact publication instructions](production-cutover.md). The deployment-validation facts below describe the earlier preparation state.

The user approved dedicated production resources, migration and deployment for validation, and separately confirmed creation of the production Access application at its final save step. Webnode and the active staging coach portal remain unchanged. This is a validation deployment; the production coach editor is deliberately disabled until the coordinated cutover so two independent databases cannot accept coach edits.

## Deployed resources

| Resource | Verified configuration |
| --- | --- |
| Public API/assets | [h43-youth-api-production](https://h43-youth-api-production.elvir-arslanovic.workers.dev); `PUBLIC_API_ENABLED=true` |
| Public preview | [P2015](https://h43-youth-api-production.elvir-arslanovic.workers.dev/preview/shared/?team=p2015); other birth-year query slugs use the same shared implementation |
| Coach Worker | [h43-youth-admin-production](https://h43-youth-admin-production.elvir-arslanovic.workers.dev/); `ADMIN_ENABLED=false`, not ready to distribute to coaches |
| Database | Separate `h43-youth-production`; five migrations applied successfully |
| Media | Separate Standard `h43-youth-images-production`; managed public domain disabled, no custom public domains |
| Access | Exact production admin host, separate audience, existing four named approved users via the existing reusable email Allow policy |
| Secrets | Fresh per-team production ingestion credentials, only digests installed on API Worker; independent production CSRF secret; local recovery values protected with Windows CurrentUser DPAPI |

No Workers Paid subscription, DNS change, Webnode publication, additional infrastructure class or modification of existing Worker settings occurred. Resource IDs are recorded only in ignored operator configuration. Production API rate limiting and H43-only CORS are separate from staging; localhost is rejected. The admin service binding targets only the production API and both production Workers use only production D1/R2.

Reviewed application source is commit `1ee7731f7e6a3f378e9bda2eb5625163920ff362`, merged into main as `cf57b7bf7380f4e815bfac8caebdf28734807407` in [PR #2](https://github.com/elvir35/h43-player-info-scraper/pull/2). [Clean Linux CI passed](https://github.com/elvir35/h43-player-info-scraper/actions/runs/43847229918). Deployed application files were compared byte-for-byte against the reviewed source. Production v1.24.0 assets have their own immutable archive and production origin, separate from staging v1.24.0.

Recorded deployed versions after secret installation/activation:

- Public: `adb85b32-9702-4f93-b7a5-2015b4dc4905`.
- Admin: `c2f7f0ae-3749-4c0d-92e5-43f8e1c93fe6`.

## Migration evidence

The initial validation copy contains 11 teams, 11 source partitions, 11 roster snapshots, 11 synchronization statuses, 5 retained portal accounts (4 enabled), 3 assignments, 34 editorial revisions, 11 editorial states, 22 images and 135 audit records. The inactive incorrect coach identity stays inactive. No new coach grants were inferred from SportAdmin.

All ten tables passed exact row comparison after import and a local foreign-key restore check. Membership incarnation keys, image IDs/object keys, drafts, published pointers and history were preserved. Every private image was copied with its content type and verified byte-for-byte on retrieval; no plaintext backup files were written. Twenty currently published image URLs returned image content with `Cache-Control: no-store`.

The D1 HTTP endpoint rejected the initial array-form batch without changing application data. Import then used bounded parameterized statements (under 100 parameters per statement), with public delivery disabled throughout. Public delivery was enabled only after table and media verification. This is consistent preparation behind the delivery gate, not an assertion that a multi-request import is atomic. The seed-only database was checked before replacement; the helper refuses overwriting a database already containing user content.

Authenticated production synchronization subsequently retrieved real SportAdmin rosters for all eleven teams successfully. Membership keys and editorial/permissions/history stayed unchanged. A final comparison confirmed staging editorial content and membership had not changed during this validation. Staging remains authoritative for coach edits until cutover; a final refreshed copy is still required before switching users.

## Validation results

- All eleven production API responses passed documented public-contract checks, team filtering/data availability, chronological match ordering and earliest-next-match validation. No staging image origin or internal record fields were exposed.
- All published images were reachable; private storage remains inaccessible through public bucket domains.
- Unknown team: 404. Public mutation methods: 405. Missing/invalid ingestion credentials: 401. P11 credential attempting another team: 403.
- Replay and out-of-order writes: 409. Malformed JSON: 400. Oversized request: 413. Unsafe player-name payload: 422. All rejected requests left the valid snapshot unchanged.
- Newly synchronized roster timestamps appeared immediately through the public API with no-store caching.
- Expected H43 CORS origins passed; localhost and untrusted origins were rejected. Public credentials headers were absent; JSON/security headers and bounded response size passed.
- Anonymous admin HTML, JavaScript and API paths all redirect to the independently configured production Access application.
- Real browser checks covered all eleven teams at 390px and 1440px, every tab, horizontal overflow, image decoding, browser-only unavailable-data handling and retry recovery. Production desktop/mobile screenshots were saved as ignored delivery artifacts.
- Seventeen targeted production/build/smoke-tool checks passed, followed by the complete Worker/API/tooling suite: 117 passed, zero failures or skips. Existing reviewed application CI covers the Python, frontend and admin suites; application runtime code did not change for this deployment.
- Existing ten Worker settings, including both staging Workers and eight unrelated Workers, were compared with the pre-deployment baseline and are unchanged. Candidate files were checked against current staging/production raw tokens and CSRF/OAuth values; none were found.

## Remaining cutover work

1. Observe the first successful scheduled staging ingestion. Manual GitHub execution and production manual synchronization are proved; cron delivery has not yet been observed. Do not infer it from a configured schedule.
2. Obtain separate approval to publish the Webnode embed/directory changes and switch coach editing. The youth directory currently still points its eleven cards at SportAdmin; the prepared directory replacement uses shared birth-year URLs.
3. Use a short coordinated staging editing/synchronization freeze, take fresh encrypted D1/media snapshots, reconcile any withdrawals/removals, refresh production consistently, verify identities/references, then activate only the production editor. Reopen one authoritative editing portal.
4. Verify a real production coach login plus authenticated private-preview, CSRF/team isolation, image-normalization/upload, publish and recovery canaries. Existing tests and live anonymous Access checks do not replace these authenticated deployment checks. Do not announce the production coach URL as usable before they pass.
5. Configure the protected main-only GitHub production environment, install its encrypted team-token map, explicitly approve its production origin and scheduler switch, and verify dispatch plus scheduled execution. Production credentials currently exist locally encrypted/on the Worker; they are not yet in GitHub. Staging synchronization remains active.
6. Publish the separately approved Webnode changes, verify all birth-year links/mobile navigation and coach publish-to-public behavior, and announce the final coach URL. Confirm the operations contact and encrypted-backup retention window.

Automatic SportAdmin team discovery/retirement remains Phase 7.

## Commands and rollback

From `worker/`, the existing `node scripts/production-config.mjs --check` verifies the disabled preparation/recovery baseline. It does **not** inspect live activation state. The ignored `wrangler.production.validation.generated.jsonc` differs from that baseline only by `PUBLIC_API_ENABLED=true`; the admin generated configuration retains `ADMIN_ENABLED=false`.

Repeat read-only deployed checks with:

```powershell
node scripts/smoke-production.mjs https://h43-youth-api-production.elvir-arslanovic.workers.dev
```

Before any cutover, disable validation delivery if needed by deploying the disabled public baseline:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.production.generated.jsonc --env production
```

Staging/Webnode need no rollback for this validation deployment because they were not changed. Keep production storage for investigation rather than deleting it. After cutover or production editorial writes, use the reconciliation/freeze procedure in [the rollout plan](production-rollout.md); never blindly restore stale membership or withdrawn images. Production is ready for the remaining coordinated cutover checks, not yet a completed public launch.
