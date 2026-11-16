# Shared youth page and team onboarding

## Scope and decisions

The supplied directory has eleven cards (its original counter said ten). All eleven source pages and exact calendar/match feed labels were verified on 2026-11-11. The user approved publication of player/coach names for all listed teams. SportAdmin remains authoritative; this adds no membership editing, per-player approvals or new infrastructure. Existing P11 editorial content, images, contacts, assignments and ingestion credential must be preserved.

Webnode requires one shared page, proposed `/lagsida/`. Paste `frontend/embed-shared.html` into its HTML block, then use the revised `frontend/youth-teams.html` on `/ungdom/`. Cards link in the same tab to `/lagsida/?team=<id>`. This prepares HTML only: no Webnode page, production link or DNS is changed by the deployment. If another page path is selected, change the eleven card hrefs consistently. The cohort labels and existing directory image URLs are retained; the stale season attributes are removed. Directory images are not automatically copied into editable team hero images or treated as new image-publication approval.

The shared embed opts in through `data-team-from-url`. It requires exactly one valid team slug; missing, repeated, invalid and unknown values have a clear youth-directory fallback. The API origin is compiled configuration and cannot be overridden by a query. Existing `data-team-id` embeds and coach previews take precedence over the query, preventing URL-based team overrides. Normal card navigation loads a new page; this is not a client-side router.

## Verified registry

| Directory label | Team ID | Exact feed/title label | Actual roster group ID |
| --- | --- | --- | --- |
| Flickor 2011 | `f15` | `F15` | `369109` |
| Pojkar 2011/2012 | `p15` | `P15` | `531183` |
| Flickor 2012/2013 | `f14` | `F14` | `331240` |
| Flickor 2014 | `f12` | `F12` | `378664` |
| Pojkar 2014 | `p12` | `P12` | `386966` |
| Flickor 2015 | `f11` | `F11` | `378680` |
| Pojkar 2015 | `p11` | `P11` | `378673` |
| Flickor 2016 | `f10` | `F10` | `510420` |
| Pojkar 2016 | `p10` | `P10` | `510428` |
| Flickor 2017 | `f9` | `F9` | `565795` |
| Pojkar 2017 | `p9` | `P9` | `565803` |

Roster URL format is `https://h43lund.web.sportadmin.se/grupp/?ID=<actual-group-id>`. Several start-page IDs differ from the actual roster ID, including P11, so the Truppen navigation was followed rather than copying start IDs blindly. The strict parser verifies the team title, roster navigation identity, both complete containers and paired row/detail blocks. F9/P9 use the verified heading Deltagare; it is accepted alongside Spelare, with Ledare still required. Unknown headings, incomplete/failed pages and unexpected structures retain the last good snapshot.

`config/youth-teams.json` is the reviewed registry shared by onboarding and scheduled synchronization. Labels are current SportAdmin age names, not a promise that they stay the same next sporting year. Future source-label/group changes need explicit mapping review; never silently relabel an old snapshot. No season/date setup is required in current-team mode.

## Staging onboarding

Review from the repository root:

```powershell
python scripts/onboard_youth_teams.py --authorize-publication
python scripts/sync_youth_teams.py --validate-only
```

Apply only after review, with the existing private staging config and a scoped D1-edit Cloudflare credential in the process environment (`CLOUDFLARE_API_TOKEN`):

```powershell
python scripts/onboard_youth_teams.py --config worker/wrangler.staging.generated.jsonc --apply-staging --authorize-publication
```

The tool accepts only the dedicated h43-youth-api-staging / h43-youth-staging target and refuses routes, conflicting source mappings or a reused source group/feed label. All SQL values are bound through the [D1 REST batch API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/). It initializes current-team configuration and empty editorial state, logs an operator audit event, and never overwrites existing content, snapshots, publication settings or grants. Re-running is safe. The authorization flag applies to newly inserted partitions; changing an existing publication decision is a separate reviewed operation. No migration is necessary.

The existing administrator sees all enabled teams. New coach grants are deliberately absent pending the user's coach-email/team list. SportAdmin coach names do not confer portal access. To add coaches, configure the Access email allowlist and matching D1 user/team assignments through existing administration controls; retain P11-only scope for the existing P11 coach. Image publication remains separately controlled per team and image.

## Authenticated synchronization and cadence

Each team has a dedicated raw ingestion token. The staging Worker secret `INGEST_TOKENS_JSON` maps team IDs to SHA-256 digest arrays, exactly as before. The batch scraper's `H43_INGEST_TOKENS_JSON` is a private JSON map of team IDs to their respective raw tokens. These are different formats: never put either into frontend files. The existing P11 token is preserved; new local tokens are stored with Windows CurrentUser DPAPI in ignored staging files. Every team uses the established authenticated, newer-only, atomic names-only snapshot ingestion path.

For a protected GitHub environment, configure:

- YOUTH_ROSTER_ENABLED=true
- YOUTH_ROSTER_ALL_TEAMS=true
- YOUTH_ROSTER_SYNC_ENABLED=true
- YOUTH_ROSTER_INTERVAL_HOURS=6 (supported configurable intervals remain unchanged)
- H43_API_URL: approved staging API origin
- H43_INGEST_TOKENS_JSON: environment secret containing each team's dedicated raw token

Then publish/review the existing scrape-youth-roster workflow and observe a manual and scheduled run. All-team mode prevalidates all credentials before updates, isolates each failed team, continues other teams and returns failure if any scrape fails. Logs contain only team IDs/status/counts. The previous single-team mode remains available when all-team mode is off. No automatic GitHub workflow activation or publication is implied by local/staging onboarding.

## Validation and rollback

Test query selection, legacy fixed embeds, invalid/repeated/unknown teams, all directory links and filters, Swedish names, Deltagare, failure retention, repeatable bound onboarding, mapping conflicts, per-team feed isolation and existing admin workflows. Hosted smoke checks compare each published roster to a fresh authenticated snapshot, check feed availability/chronology and enforce cross-team token denial without logging names. Webnode editor paste/publish remains an operator action.

Keep old immutable asset releases. To revert shared navigation, restore the former Webnode directory block or use fixed team embeds with retained assets. Revert the staging Worker through its recorded previous version and verify smoke checks. Newly onboarded data is additive; disable an affected team after review instead of deleting its roster/history. Do not undo requested roster removals by restoring stale membership snapshots.

## Completed staging rollout — 2026-11-11

All eleven teams were onboarded and synchronized successfully: 240 player names and 63 coach names total, without storing extra personal details. All eleven calendar and match projections returned available data, and each public roster matched its authenticated snapshot. Each team's token was rejected when used for a cross-team write. P11 welcome/social/contact hashes and the existing coach-assignment count remained unchanged. The existing administrator can access the new teams; no unprovided coach emails were inferred or granted access.

Widget v1.10.0 and the matching private preview are deployed. Public staging Worker version: `671d9482-b219-429b-a2a1-a5c2342d40d7`; admin version: `c86a4b77-89c5-4f29-a787-6905a0820594`. Example: https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/shared/?team=f12 . No new Worker, database, bucket or migration was introduced. All eight pre-existing production Workers and route inventory were unchanged.

Validation: 94 Python tests; 77 API/tooling tests; 37 local widget/directory cases; 11 admin workflows; three hosted browser checks (P11, browser-only Webnode asset substitution, and all eleven shared pages); plus full-contract smoke for all eleven teams and six focused contract/config tests after generalizing the smoke validator. Typecheck, candidate credential scan and documentation link checks passed. Desktop/mobile shared-page screenshots were inspected. No new roster names were committed as fixtures or logged in test output. Existing public source images in the supplied directory remain links.

For a Worker rollback to the preceding tested release, use public version `6895ff5c-d471-4b49-be2b-f2bff4213744` and admin version `1d41be7b-d776-4bb3-b152-383075e47ebc` with their existing `--env staging --config ...staging.generated.jsonc` configurations. A rollback does not remove additive team rows or rewind membership; the prior widget still supports fixed team IDs. Keep the new team-scoped ingestion bindings if synchronization continues.

Remaining operator steps: create/publish the Webnode `/lagsida/` block; replace the `/ungdom/` block with `frontend/youth-teams.html` (the identical plain-text copy `frontend/webnode-youth-teams.txt` is provided for copying); supply new coach email/team assignments; publish the new youth scraper/workflow code and configure protected GitHub environment secrets to activate and observe six-hour synchronization. Read-only GitHub inspection confirmed that only the existing senior scraper workflow is currently published. No GitHub code/secret/workflow was remotely changed during this onboarding. The successful manual synchronization is not a claim that scheduling is active.

## Birth-year public URLs — v1.12.0

The user requested birth-year URL identifiers. The reviewed mapping lives in config/team-slugs.json; it is compiled into both public and private-preview widget builds. Examples: `/lagsida/?team=f2014` resolves internally to f12, and `/lagsida/?team=p2015` to p11. Combined cohorts use `p2011-2012` and `f2012-2013`. All eleven directory links in frontend/youth-teams.html and its identical plain-text copy are updated. Other public slugs are f2011, p2014, f2015, f2016, p2016, f2017 and p2017.

Canonical D1/API IDs, upstream team mappings, roster snapshots, ingestion credentials and coach grants stay intact; no database migration or permission change is needed. Existing age-based URLs continue to resolve. Fixed team embeds and authenticated previews still ignore query overrides. Unknown/invalid/repeated selections retain their existing safe fallback behavior. This changes visitor-facing URL identifiers, not the public API contract or team membership.

For Webnode, replace both asset URLs in the shared page with v1.12.0 from frontend/embed-shared.html, then paste the updated frontend/webnode-youth-teams.txt into the ungdom directory block. The public path remains `/lagsida/`. Updating the directory alone would send birth-year aliases to an older widget that cannot resolve them, so update the widget first. No Webnode or production change is performed automatically.

Birth-year URL rollout validation (2026-11-12): 40 local widget browser cases, 11 admin workflows, hosted P11 compatibility, all eleven real birth-year shared URLs (including roster/match comparisons), and the published Webnode shared-page check with browser-only asset substitution passed. The historical Webnode check initially opened a shared page without a team; it was corrected to use `/lagsida/?team=f2014`. Typecheck, staging configuration, credential scan and directory-copy equality checks passed. No production/Webnode update was made; eight pre-existing Workers/routes and authenticated ingestion remained unchanged.

Public staging version: `7265d358-ecb1-4f33-89a1-8d02d0435aac`; admin staging version: `4404edaa-d421-41cc-a68a-1300ab3e82ed`. To revert, use public `72430c41-4a49-45bb-8dc6-a5110dd74dda` and admin `c57af6cb-8876-46a6-8d66-788e824557d0` with existing staging configs, and restore legacy directory URLs before repinning shared assets to v1.11.0. No database or membership rollback is required.
