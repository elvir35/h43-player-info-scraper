# Roster retirement — production delivery, 2026-11-19

## Outcome

The user explicitly approved production deployment and deletion of historical private roster data. Production API/assets and the Access-protected coach portal now run the roster-free v1.26.0 release. Production editing is enabled again; staging editing remains disabled. No Webnode editing or publication was performed.

Production API: https://h43-youth-api-production.elvir-arslanovic.workers.dev

Production editor: https://h43-youth-admin-production.elvir-arslanovic.workers.dev/

Production API version after removing the obsolete ingestion secret: `a89ffae8-adf3-48e2-9b7c-bd160b6d5c59`. Production editor version: `a6ce3eab-08c5-4037-80ce-b5a74a12b41e`. Staging API version after secret removal: `fef9c07c-483b-4506-a207-aa3ed3089e67`.

The public API keeps empty v1 compatibility roster fields. All retired roster/read/failure/refresh endpoints reject requests with 410. Known portraits cannot be served or republished from old editorial revisions. Team pages retain welcome content, team photos, contacts, social links, registration, calendar and match sections. Coaches should reload the portal to receive the updated editor.

## Data deletion and preservation

Both dedicated D1 databases received additive migration 0006. During a temporary production editing freeze, cleanup removed the 11 roster snapshots and synchronization-status rows originally present in each environment, cleared roster overlays from drafts and historical revisions, and disabled the obsolete roster-publication configuration. Editorial revision IDs, publication pointers, non-roster content, contact details, coach identities and team permissions were preserved. Draft versions advanced where content was cleaned; maintenance audit entries record the operation without player names.

Each environment contained 18 known historical portrait objects, including one no longer in the active public roster. All 36 objects were deleted from private R2 and verified absent using remote object reads; the corresponding media rows were removed. Production retains 13 other image records and staging retains 3. Minimal opaque portrait-denial IDs remain to prevent an old reference becoming public again; they contain no names or source-person identifiers.

Local cleanup removed 104 inventoried old backup/media/export/capture files (44 encrypted backups/media and 60 generated captures/exports), sanitized the remaining media-backup manifest, removed 128 obsolete diagnostic/test logs, and removed five obsolete local token/deletion-journal files. The old youth ingestion secrets were removed from both API Workers. The GitHub youth workflow remains disabled; the replacement source workflow has no schedule, scraping or credential use. The separate senior-team workflow/data are unchanged.

Two sanitized Windows CurrentUser-DPAPI recovery copies replace the mixed roster backups. Both were decrypted only in memory, restored into disposable SQLite databases with all six migrations, and passed foreign-key checks with empty roster/status tables and no roster overlays. Recovery must use retirement-aware code and these cleaned copies, not a pre-retirement restore.

## Validation

- 92 Worker/API/tooling tests, 116 Python tests (including eight cleanup preservation/path-validation tests), 44 widget browser cases and 22 portal browser cases passed. The changed smoke-tool unit cases also passed.
- Type checks, syntax checks and separate immutable staging/production asset builds passed. Synthetic desktop/mobile screenshots were reviewed.
- All eleven production team APIs returned 200 with empty rosters, no roster timestamps and expected public projections. Calendar sources were available; match feeds returned valid empty lists at validation time. The next-match selection and played-match behavior remain covered by synthetic source tests.
- All 17 previously active public portrait URLs returned 404. Direct private-storage absence was separately verified for all 18 historical portraits per environment.
- Ten current public production team-image URLs passed delivery checks. Team contacts/content and access assignments were preserved by cleanup comparisons.
- Unknown-team 404, unsupported-method 405, retired-endpoint 410, CORS, no-store/security headers and anonymous portal redirects to Cloudflare Access passed. Production `ADMIN_ENABLED=true`; staging remains false. No fresh interactive coach sign-in was performed in this delivery.
- Final database checks: zero roster snapshots, sync-status rows, remaining portrait media records, draft overlays or historical revision overlays in both environments.

## Managed-history limitations

The deletion above covers live D1 records, identified R2 portraits and inventoried project-local copies. It does not certify immediate physical erasure of provider-managed recovery history, downloaded copies, prior chat attachments or SportAdmin's source records. Cloudflare documents D1 Time Travel retention as 7 days on Workers Free and 30 days on Workers Paid. Treat pre-cleanup managed recovery points as restricted historical personal data until the applicable provider retention expires; never restore them to public service without reapplying retirement and cleanup. No attempt was made to destroy/recreate the databases to change that retention. [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Current coach accounts, manually entered contacts and team photos are deliberately retained. Their publication basis, privacy information and retention remain H43's responsibility; roster retirement is not a GDPR compliance certification. Retired encrypted GitHub ingestion-secret entries, if retained in the environments, no longer have server authority because the API bindings were removed and all ingestion handlers are retired.

## Webnode handoff and recovery

The user updates the shared HTML block using [frontend/webnode-production-embed.html](../../frontend/webnode-production-embed.html), selecting v1.26.0 for both CSS and JavaScript. Until then, older immutable widgets may retain an empty Truppen tab. The backend already prevents roster disclosure. Directory/birth-year URLs are unchanged.

After updating Webnode, check one mobile team page, the four tabs, contact links and the coach-editor link. Do not point Webnode or coaches back at a pre-retirement backend/database. If a regression cannot be fixed immediately, withhold affected delivery rather than restoring roster-serving code or deleted portraits. Existing managed recovery is not permission to republish retired data.

See [the retirement design and deployment sequence](roster-retirement.md) and [the remaining general privacy/security plan](privacy-launch-readiness.md).
