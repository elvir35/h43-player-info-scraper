# Phase 4: reusable Webnode frontend

Implemented and deployed to **staging only**, 2026-11-11. The [P11 preview](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/) uses the real, approved staging API. Production routes, existing Workers, Webnode pages and senior scraping remain unchanged. No Phase 5 portal was built.

**Current release: v1.2.0, compact blue header.** The duplicate badge and tall hero spacing are removed, retaining the original blue gradient/court-line background. The team title and recruitment button share a compact desktop row and stack on mobile. See [compact header release notes](compact-header-release.md). Översikt, Matcher, Kalender, Spelare and Kontakt still show one panel at a time with keyboard controls and selection preserved during refresh. Matches and calendar continue to use their separate team-filtered sources. Earlier v1.0.0/v1.1.0 remain immutable and hosted.

## Architecture and components

`frontend/src/team-page.ts` is a dependency-free browser widget; `api.ts` validates and projects API records before rendering. `team-page.css` supplies mobile-first H43 blue/navy and gold styling. v1.2.0 omits the duplicate badge because Webnode's menu already carries it; earlier frozen assets are retained. The blue is consistent with the existing mockup; gold is a proposed accent, not a claimed official brand specification. No stock team image or fictional roster/fixture is published.

The widget renders a team hero and recruitment link, welcome text, next match, up to eight activities, player-name grid, separate coach names, validated social links and contact CTA. Stockholm date/time formatting is explicit, independent of the visitor's timezone. Unknown event status is labeled unconfirmed. Missing editorial data uses generic interface copy; missing team email links to the verified club contact page. Season and absent socials are omitted. A missing/failed hero image leaves a blue court-inspired fallback; future hero images are decorative because the API currently has no image-alt field.

All names and editorial/source strings use DOM text nodes. No HTML interpolation, scripts from data, portraits, profile identifiers, third-party social SDKs or iframe embeds are used. Instagram/TikTok links require exact platform hosts and profile paths, HTTPS and no credentials/query/fragment. Invalid social/contact/image URLs are omitted or use the documented fallback. Extra API fields are never rendered. A future meaningful hero photo needs an alt-text contract extension.

Each mount owns an open shadow root with its own external versioned stylesheet. Styles are prefixed and do not reset Webnode's document. Multiple mounts and delayed HTML insertion are supported; duplicate script initialization is ignored. Top navigation switches accessible tab panels; recruitment reveals/focuses contact inside the shadow root. Responsive grids, semantic headings/lists, visible keyboard focus, live loading/error states and retry support are included. No animation or runtime framework is required.

The environment configuration in `frontend/config/staging.json` is separate from `data-team-id`. It contains public URLs only. Newly registered backend teams use the same widget and assets; change the team slug in the embed. Content changes returned by the existing API appear without editing the embed. No frontend roster copy is stored in Webnode, localStorage or a service worker.

## Exact staging Webnode snippet

Paste into an HTML block on a **staging/test page**, with publication approval for its audience:

```html
<div id="h43-team-page" data-team-id="p11"></div>
<link rel="stylesheet" href="https://h43-youth-api-staging.elvir-arslanovic.workers.dev/team-assets/v1.2.0/team-page.css">
<script src="https://h43-youth-api-staging.elvir-arslanovic.workers.dev/team-assets/v1.2.0/team-page.js" defer></script>
```

For another team, change only `p11` to its configured API slug. For multiple widgets on one page, use unique IDs and add `data-h43-team-page` to each root. The script also loads the same CSS into each shadow root; the outer link follows the requested embed shape and is cache-reused. The current widget does not load a duplicate badge. This snippet targets staging and is not a production release instruction. The proposed eventual Webnode URL remains `https://www.h43lund.se/lag/p11/`, subject to site-owner review.

## Webnode compatibility boundary

**Update:** the actual published [P11 test page](https://www.h43lund.se/p11-test/) has now passed desktop/mobile-sized Chromium embed checks. See [Webnode validation results](webnode-validation.md), including the separate host-page Lucide error and test limits. The following paragraph describes the initial Phase 4 handoff before this check.

The widget was tested in a normal HTML document with aggressive Webnode-like global CSS, delayed insertion and duplicate scripts. **It has not been inserted into an actual Webnode editor or published Webnode HTML block.** No Webnode account/theme changes were performed. Webnode's documentation says HTML blocks require a premium plan for sites created after 2023-06-26 and plugin output is visible on the published page rather than in the editor. Third-party compatibility is not guaranteed: [HTML block instructions](https://www.webnode.com/support/add-html-code/), [plugin compatibility guidance](https://www.webnode.com/support/using-third-party-plugins/).

On an authorized test page, verify the account's HTML feature, retention/execution of external script/link tags, deferred scripts or delayed insertion, host content-security policy allowing the staging asset/API origin and HTTPS images, actual content-column width, theme overlays and published mobile/keyboard behavior. An editor stripping scripts will need a Webnode-supported embed placement, not a theme rewrite or invented site-management API. Existing API CORS allows `https://www.h43lund.se`, `https://h43lund.se` and `http://localhost:3000`; a different test domain requires a reviewed staging CORS configuration change. CORS is not authentication.

## Fetching, freshness and errors

Fetch is credential-free, no-store, HTTPS, no redirects, 15-second bounded, JSON-only and limited to 256 KiB. Validate the requested team slug, matching response ID/version, nested types, string/array bounds, enums and UTC timestamps. Display loading initially; on failure discard the view and show a generic retry state. A failed refresh does not leave an unlabelled old roster on screen. The API remains responsible for last-valid snapshots and stale-source status.

Visible pages re-fetch every five minutes and on focus/visibility return when due. No-store means the next fetch reads current D1 membership/authorization; an open page can retain its previous display for up to five minutes, plus request time. Closing/hidden pages refresh when visible. For urgent changes update SportAdmin, run the existing authenticated roster sync, and reload the page for immediate display. Withdrawal still happens in the backend publication gate; no independent player removal interface exists. Schedule projections retain the API's separate bounded 300-second cache. No client persistence or offline roster is added.

## Build, local development and tests

From the repository root:

```powershell
Set-Location worker
npm ci --no-fund
npm run typecheck
npm run build:frontend
npx playwright install chromium
npm run test:frontend
npm run dev:frontend
```

Open `http://localhost:3000/preview/p11/`; use this exact host/port for staging CORS. The preview uses live data, never test fixtures. Mock test records are synthetic and exist only in `frontend/test`.

To include the real API test (opt-in because CI must not depend on upstream availability):

```powershell
$env:H43_REAL_API = '1'
node node_modules/@playwright/test/cli.js test --config ../frontend/playwright.config.mjs
```

To test the deployed preview separately:

```powershell
$env:H43_PREVIEW_ORIGIN = 'https://h43-youth-api-staging.elvir-arslanovic.workers.dev'
$env:H43_REAL_API = '1'
node node_modules/@playwright/test/cli.js test --config ../frontend/playwright.config.mjs --grep 'real staging' --output ../frontend/staging-results
node ../frontend/scripts/smoke-hosting.mjs https://h43-youth-api-staging.elvir-arslanovic.workers.dev
node scripts/smoke-staging.mjs https://h43-youth-api-staging.elvir-arslanovic.workers.dev
```

Remove those environment variables before normal local tests. Screenshots/traces are local ignored outputs; real-name screenshots must not be uploaded into public CI artifacts without separate review. CI installs Chromium and runs mocked browser tests with no deployment credentials; workflow publication remains outstanding.

Validated: **19 browser tests passed** (18 mocked + one live API), including 320/390/768/1440px widths, separate players/coaches, nulls, empty/unavailable states, HTML injection, unsafe links, malformed/mismatched/oversized responses, network/HTTP errors and retry, Stockholm winter/summer conversion, invalid/multiple team IDs, delayed/idempotent mounting, CSS isolation and refresh/removal/outage behavior. The deployed preview additionally passed its live browser test with no JavaScript/CSP errors. **47 API/tooling tests and 81 Python tests passed**, typecheck/build passed; npm audit found zero known vulnerabilities at validation time. Live API and hosting smoke checks passed.

## Hosting, release and rollback

Cloudflare Worker Static Assets reuses the existing isolated staging Worker. `worker/wrangler.jsonc` adds assets only to staging. The staging generator fixes `../frontend/dist`, no SPA fallback and `run_worker_first: ["/api/*"]`, so static files cannot take over public/private API paths. There are no new databases, migrations, R2 buckets, Pages projects or routes. v1.1.0 adds the normalized public matches list; ingestion/authorization code is unchanged. See [Cloudflare routing/bindings](https://developers.cloudflare.com/workers/static-assets/binding/) and [asset header behavior](https://developers.cloudflare.com/workers/static-assets/headers/).

Build outputs `/preview/p11/` and `/team-assets/v1.2.0/`, retaining archived v1.0.0/v1.1.0. Preview HTML/CSS is no-store with noindex/nofollow and a restrictive self-script/style CSP. All archived versioned JS/CSS/badge files have one-year immutable caching, anonymous asset CORS and nosniff. `_headers` applies to static assets only; API JSON remains no-store with its existing exact-origin CORS/security headers.

Frozen release bytes and SHA-384 manifests are checked in under `frontend/releases/v1.0.0/` and `v1.1.0/`. A normal build compares new bytes/configuration with the frozen manifest and fails on a same-version change. To release a change, increment `version` in the build script, build/test it, review it, then run `node ../frontend/scripts/build.mjs --freeze` and include the archive in review. Clean builds restore all archived versions, preserving old embeds. Never edit a frozen archive or reuse a released URL for different bytes. API environment changes also require a new asset version. Production environment/build/deployment is deliberately not configured here.

Staging preparation and deployment, after tests and inventory review:

```powershell
npm run build:frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
node scripts/staging-config.mjs
if ($LASTEXITCODE -ne 0) { throw 'Staging preparation failed' }
node scripts/staging-config.mjs --check
if ($LASTEXITCODE -ne 0) { throw 'Staging isolation check failed' }
npx wrangler deploy --env staging --config wrangler.staging.generated.jsonc --dry-run --outdir dist/staging-review
if ($LASTEXITCODE -ne 0) { throw 'Staging review failed' }
npx wrangler deploy --env staging --config wrangler.staging.generated.jsonc
```

Use the existing authenticated Cloudflare login/scoped secret store; no credentials belong in frontend config or this snippet. Generated account/resource IDs stay ignored. The deployed compact-header Phase 4 version is `52901313-b2f2-47d7-bce8-94adafa103fd`. Ingestion secret and dedicated staging D1 binding were preserved and authenticated read was reverified. No migrations were needed.

For a later failed staging release, restore this version with `npx wrangler rollback 3712610c-06c4-409e-86ba-0d234f1a47e9 --env staging --config wrangler.staging.generated.jsonc`, then rerun both smoke scripts and the deployed browser check. Confirm the rollback's static manifest/URLs as well as API compatibility. The prior API-only version `ac858204-1dab-498a-99d9-e6cc5a3f5e4d` is an emergency API reference and may remove frontend availability. Rollback never restores old membership or authorization. A frontend-only rollback can repin both URLs to retained v1.0.0; the [tabbed release notes](tabbed-release.md) describe reverting this release to the prior Worker as well. Production and Webnode link changes require separate approval.

After this deployment all eight pre-existing Workers retained their modification timestamps, route inventory was unchanged, and both existing H43 source APIs returned HTTP 200 JSON. See [backend issues and release blockers](backend-issues.md) before production or Phase 5.

## Multiple contacts — v1.8.0

The Contact tab groups each named person and their email/phone in a responsive card. The Truppen tab still contains SportAdmin players and coaches. Existing legacy contact content is retained automatically; the private coach preview uses the same widget. Use both v1.8.0 asset URLs from `frontend/embed-p11.html` when updating Webnode. Older frozen widget releases remain available. No Webnode block is updated automatically.

Staging release validation (2026-11-11): 76 API/tooling tests, 29 local widget browser cases, 9 admin workflows and 2 hosted compatibility checks passed; typecheck passed. Live API smoke verified schema, CORS, methods, unauthenticated-ingestion rejection, real roster and feeds. Public Worker version `c521baac-c494-46b5-9b41-baab93335334`; admin version `8b24f279-7075-42b4-a57a-d2d8b9ca6814`. No migrations were required.

Rollback staging to previous versions from the worker directory: `npx wrangler rollback 8344994d-31d4-413d-ae9c-2a809bda8478 --env staging --config wrangler.staging.generated.jsonc` and `npx wrangler rollback 7dec340d-6ee1-49e4-94c5-8a2b1dccb08d --env staging --config wrangler.admin.staging.generated.jsonc`. JSON contact-list content is retained, but older widgets display only the first contact. Roll back both clients together and rerun smoke checks; previous editors cannot manage the additional people.

## Registration button — v1.9.0

The compact blue header now has a prominent gold **Anmäl dig** link on every tab, pointing to https://entry.sportadmin.se/groupsOverview?uid=fjtzIS as supplied by the user. This replaces the previous contact shortcut; Contact remains available as its tab. The URL is shared build configuration, requires no API/database change, and is also used in the private coach preview. Use both v1.9.0 asset URLs from frontend/embed-p11.html. No registration is submitted by the widget.


Registration release validation: typecheck, 29 local widget cases, 9 sequential admin workflows, 2 hosted browser checks and live API smoke passed. Initial local encoding/test-run interference was corrected before release; final sequential checks passed. Eight existing Workers and production routes were unchanged. Public staging version: 6895ff5c-d471-4b49-be2b-f2bff4213744. No migration. To revert the button, repin both Webnode assets to retained v1.8.0; staging Worker rollback references are public c521baac-c494-46b5-9b41-baab93335334 and admin 8b24f279-7075-42b4-a57a-d2d8b9ca6814, using their existing staging configs.


## Match cards — v1.11.0

The selected match-card design highlights the next fixture in blue/gold with a date block, time and venue. Remaining fixtures appear as white cards, two per row on desktop and stacked on mobile, under **Därefter**. Dates/times use Europe/Stockholm; kickoff time retains its full date/time accessible label and ISO datetime. Missing opponent/venue values retain explicit fallbacks, unknown home/away stays Match, and a single fixture omits the following group. The dedicated team-filtered match API projection, chronological order, empty/unavailable states and calendar separation are unchanged. The coach's private preview uses the same renderer. No new infrastructure, dependencies, API field or database migration is required.

Use v1.11.0 in both Webnode asset URLs, from frontend/embed-shared.html or frontend/embed-p11.html. Older frozen releases remain available. This deployment does not alter the Webnode HTML blocks automatically.


Local browser checks can use a dedicated port with `$env:H43_PREVIEW_PORT='3307'` before running `npm run test:frontend` from worker/. The test runner starts its own server and fails clearly if that port is occupied; reusing a known frontend server requires the explicit H43_REUSE_PREVIEW=1 opt-in. This avoids testing an unrelated app on localhost:3000. Hosted checks use H43_PREVIEW_ORIGIN as before.

Match-card release validation (2026-11-12): 39 isolated local frontend browser cases, 11 admin workflows and three hosted checks passed, including all eleven shared team pages. Public contract smoke passed for all eleven teams. Typecheck, staging-config/credential/link checks and production-isolation checks passed. An initial local test-port collision with an unrelated app was corrected using the dedicated-port configuration; the final isolated run passed. No unrelated local service was stopped. Eight existing production Workers/routes and authenticated ingestion remained unchanged.

Public staging version: `bbb8bbea-b87a-4367-b3de-463ca2cb7002`; admin staging version: `c57af6cb-8876-46a6-8d66-788e824557d0`. Rollback to public `671d9482-b219-429b-a2a1-a5c2342d40d7` / admin `c701a00b-b82d-4e9f-80b5-89067baa1658` with their existing staging configs; no database rollback is required. Both Webnode asset URLs can also be repinned to retained v1.10.0. Team directory links and admin birth-year labels are unchanged.

## Birth-year team headings — v1.13.0

The public hero heading now uses the verified birth-year label, for example H43 Lund P2015 instead of P11, and H43 Lund F2014 instead of F12. Combined cohorts remain P2011/2012 and F2012/2013. The hero's accessible team label and default team-image alternative use the same name. Config/team-labels.json is shared with admin navigation and compiled into public/private widget builds; unknown future teams retain the configured API name. User-authored welcome copy and explicit photo alternatives are preserved. Canonical IDs, public API name fields, SportAdmin mapping, birth-year URL aliases and permissions remain unchanged.

Use both v1.13.0 asset URLs from frontend/embed-shared.html (or the fixed P11 block). The youth-directory links already use birth-year aliases and need no change for this heading-only update. No database migration or user-content mutation is required.

Birth-year heading release validation (2026-11-12): 40 local widget cases, 11 admin workflows and three hosted checks passed, including exact headings for all eleven real teams and Webnode shared-page compatibility using browser-only asset substitution. Typecheck, staging configuration and credential/link checks passed. Eight existing production Workers/routes and authenticated ingestion remained unchanged. No Webnode edit or database/user-content mutation was performed.

Public staging version: `89d2e798-03ca-4d28-8b31-07524697ed56`; admin staging version: `c89967fb-a9ca-4066-b1e0-695fec68442f`. Rollback to public `7265d358-ecb1-4f33-89a1-8d02d0435aac` and admin `4404edaa-d421-41cc-a68a-1300ab3e82ed` using the existing staging configurations, or repin public assets to retained v1.12.0. Birth-year URL aliases continue to work across both releases.

## Mobile roster readability — v1.14.0

On phones up to 600px, player names use one column instead of two narrow columns. Player and leader rows disable automatic hyphenation and mid-word splitting except as an emergency fallback for a single oversized token. Complete names remain plain text without truncation. Wider layouts are unchanged; private coach previews use the same CSS.

Staging deployment: public version `4af1d3d1-97e2-4f8e-8c5f-3eb385b4c4e3`, admin version `7d78c9ed-d93c-41fa-998b-3ed6098de988`. All 43 local widget cases and 15 admin workflows passed, plus type checking and two hosted checks (staging API integration and browser-only new-release substitution on published Webnode). Three opt-in network cases were skipped in the local run; two were subsequently run successfully against hosted systems. Synthetic mobile roster screenshots at 320/390/600px were reviewed. No member information, D1 schema, published content or production/Webnode configuration was modified.

To apply this on Webnode, replace both asset references with v1.14.0 using [the shared embed](../../frontend/embed-shared.html), or the fixed P11 embed if appropriate. Keep the current team-selection attributes. Existing pinned v1.13.0 embeds remain unchanged until repinned; all old releases are retained. The youth-directory links need no change. Rollback by selecting the prior asset version; no data rollback is needed.

Other roster feedback is documented separately in [the optional roster details proposal](roster-details-proposal.md). Leader responsibilities, shirt numbers and positions are proposed, not implemented, and depend on reliable person matching.

## Upcoming/played match filters — v1.15.0

Matcher now has accessible Kommande and Spelade filter buttons. Upcoming fixtures are earliest first and retain the highlighted next card; played fixtures are newest first and show the source result in explicit home–away order when present. Missing results say Resultat saknas. Each view has empty/unavailable feedback and calendar events never enter either list. Selection and keyboard focus survive the existing periodic refresh, independently for each widget. Public and coach-preview rendering share the implementation.

Use both v1.15.0 asset URLs in [the shared embed](../../frontend/embed-shared.html) or the fixed P11 embed. Publishing a staging release does not change Webnode’s pinned links. Old releases remain hosted. API fields are additive, bounded and documented in [the API contract](api-contract.md). No database migration or additional infrastructure is required.

Staging versions: public `e1976cf7-9c12-4e05-91df-218918fe4b75`, admin `fc161f49-14d2-40bf-8f4f-132ea7d8d429`. Validation: 93 Worker/API tests, 47 local widget browser cases and 15 admin workflows passed, plus type checking. Three opt-in network cases were skipped in the local run. Hosted contract/history checks compared all eleven teams against the real matches source, including score/null schemas, chronology and preserved Access protection. No D1 migration, membership mutation, new service or production/Webnode edit occurred. Retain the older immutable assets; selecting v1.14.0 restores the prior UI while safely ignoring the additive API fields. To revert both staging Workers, the prior public/admin versions were `4af1d3d1-97e2-4f8e-8c5f-3eb385b4c4e3` and `7d78c9ed-d93c-41fa-998b-3ed6098de988`; keep old assets available for any currently pinned embed.

## Played result card presentation — v1.16.0

Played cards now use a two-row scoreboard: home team and home score, followed by away team and away score. H43’s current birth-year team label is highlighted, and each row explicitly labels home/away. History dates include the year; kickoff time and venue are supporting metadata below the score. Upcoming cards are unchanged. Missing scores display dashes with Resultat saknas rather than suggesting a zero score. If the source cannot resolve home/away, the card does not assign scores to team names and retains an explicit orientation note. All fields remain safe plain-text rendering from the existing API; no API/D1 changes are required.

Use both v1.16.0 asset references in [the shared embed](../../frontend/embed-shared.html) or the fixed P11 embed. Webnode is not republished automatically, and older immutable releases remain available for rollback.

Validation for v1.16.0: 48 local widget browser cases and 15 admin workflows passed; type checking, asset builds, credential scan and staging configuration checks passed. Three opt-in network cases were skipped locally. Score-specific coverage verifies both home/away orientations, zero scores, absent scores, unknown home side, mobile layout and refresh/keyboard behavior. Synthetic mobile screenshots were visually reviewed. Public staging version `dae9c297-69eb-418f-8319-b851918611b0`; admin staging version `6cbcf1e6-17d6-4046-9e35-232e4b45eabd`. No API/schema/data or Webnode changes. For rollback use both v1.15.0 asset URLs, or prior staging Worker versions public `e1976cf7-9c12-4e05-91df-218918fe4b75` and admin `fc161f49-14d2-40bf-8f4f-132ea7d8d429`.

## Club-only match labels — v1.17.0

At the user’s request, H43 scoreboards now show **H43 Lund** without a cohort suffix. Page headings, accessible team identification, team navigation, canonical IDs and source mapping retain their birth-year/team identity. Opponent names and home/away score order are unchanged. Use both v1.17.0 asset URLs in the shared or fixed embed; Webnode is not republished automatically.

Validation: four focused browser tests (desktop/mobile scorecards, home/away/zero/unknown score cases, unchanged birth-year heading and all-cohort routing), type checking, builds, staging guards and credential/link scan passed. Hosted JavaScript and CSS match the frozen tested release byte-for-byte. Public staging version `6d5cce9e-fd3d-4b5e-82de-dde6d7e89489`; admin staging version `01eeb9dd-cce8-4071-b016-f444a49e1bcb`. No API/schema/data changes. Roll back using v1.16.0 assets or the preceding staging Worker versions public `dae9c297-69eb-418f-8319-b851918611b0` and admin `6cbcf1e6-17d6-4046-9e35-232e4b45eabd`.

## Compact scoreboard rows — v1.18.0

Removed Hemmalag/Bortalag row captions at the user’s request. Team names and scores remain in home–away order; H43 Lund stays highlighted. The fixture’s home/away badge and honest unknown-orientation fallback are unchanged. Use both v1.18.0 asset URLs in the shared/fixed embed to apply on Webnode; no Webnode edit was performed.

Three focused mobile/desktop/filter/score-orientation tests, type checking, builds, staging guards and credential/link checks passed. Hosted JS/CSS match the frozen tested release. Staging versions: public `c1c825b1-ec79-447b-888a-8c08da115acf`, admin `e2a0b2e0-01e6-476f-8073-12c27ae115e5`. No API/schema/data change. Roll back to v1.17.0 assets or prior public/admin versions `6d5cce9e-fd3d-4b5e-82de-dde6d7e89489` and `01eeb9dd-cce8-4071-b016-f444a49e1bcb`.

## Optional roster details — v1.19.0

Truppdetaljer in the coach portal allows optional shirt number and position for current players, and responsibility for current leaders. The public Truppen view renders only nonempty published details below names; existing one-column mobile names and scorecard refinements are preserved. Draft preview shares this renderer. SportAdmin remains authoritative for names and membership; details never create members or portal grants. See [the identity design and compatibility notes](roster-details-proposal.md).

Use both v1.19.0 asset references in [the shared embed](../../frontend/embed-shared.html) or fixed P11 embed for public display. The admin portal updates on reload. An older public embed continues to display names only. No Webnode or production change is performed automatically.

Validation: 96 Python tests, 96 Worker/API tests, 49 local widget browser cases and 16 admin browser workflows passed, plus type checking and a final focused editor workflow with desktop/mobile layout checks. Three hosted cases were opt-in/skipped locally; two subsequent hosted checks passed (real staging API and browser-only Webnode asset substitution). All eleven teams synchronized successfully with 240 players and 63 leaders; no optional editorial values were invented or published. No new D1 schema, service or external infrastructure was introduced. Staging versions: public `cc593d7a-c898-43de-a3c3-088d4fea7c4c`, admin `7e6722e4-90e7-42f9-b051-1c82faa4005b`.

Rollback the UI by selecting v1.18.0 assets. Keep the identity-aware public backend after identity synchronization; older strict backend/client releases do not understand the private source-ID/member-key additions. A backend downgrade needs explicit review and must not restore old membership snapshots. Previous Worker versions (for reference, not an automatic downgrade instruction): public `c1c825b1-ec79-447b-888a-8c08da115acf`, admin `e2a0b2e0-01e6-476f-8073-12c27ae115e5`. The staging pre-sync snapshot export is stored privately with Windows CurrentUser DPAPI encryption. Scheduled GitHub synchronization is still not activated by this work.

## Optional roster portraits — v1.20.0

The player editor now includes optional photo upload/removal controls, using the existing private upload service. Public Truppen rows show small 72px portraits alongside names and optional number/position, lazy-loaded with name-based alt text. Failed images disappear while names remain, and invalid URLs are ignored. No placeholder portrait is invented. Mobile keeps its single-column roster. Leader responsibilities and all existing match-card refinements remain unchanged.

Use both v1.20.0 asset URLs in [the shared embed](../../frontend/embed-shared.html) or fixed P11 embed to show photos publicly. Refresh the admin portal for upload controls; no Webnode link is changed automatically. Public older embeds continue names-only rendering. Image storage/processing reuse existing bindings and resources. Keep both portrait-aware backends on any asset rollback because older validators/cleanup do not support portrait references. See [the security review](admin-security.md) for publication and retention boundaries.

Staging rollout: public Worker `a447f10c-4a27-4f76-a82c-3b6a6cdeb000`, admin Worker `3dd18ab9-b46a-4176-adef-c7f20de139b1`. Validation passed: 100 API tests, 53 local widget browser cases, 17 full admin workflows plus focused portrait upload/removal runs at both 390px and 1440px, type checking and two hosted browser checks. Three network cases were opt-in/skipped locally; two were subsequently run against staging/published-host simulation. Hosted checks also confirmed all eleven public teams, three existing team-image URLs, exact frozen asset bytes, protected admin access and eight unchanged production Workers/routes. No real player photo was uploaded or published by these checks. No new database/resource/billing plan or Webnode edit was made.

UI rollback: select v1.19.0 public assets to hide portraits while keeping portrait-aware backend/cleanup logic. Do not blindly roll back either backend to the previous versions (`cc593d7a-c898-43de-a3c3-088d4fea7c4c` public / `7e6722e4-90e7-42f9-b051-1c82faa4005b` admin) once portrait references exist; earlier cleanup and validation cannot safely manage them. Private revision retention remains unchanged.

## No-image player fallback — v1.21.0

At the user’s request, players without an image now show their real name beside a neutral no-image SVG icon in the portrait slot. Missing/unsafe URLs and failed image loads all use this fallback. Valid portraits replace the icon; leader rows are unchanged. The icon is inline code with the accessible label Bild saknas and needs no external placeholder request. Existing mobile name wrapping remains intact.

Use both v1.21.0 asset URLs in the shared/fixed embed to apply on Webnode. Deployed public version `25849b89-d822-483a-9835-956a8b7a05af`; admin version `7f093ce7-c196-4d65-8f6c-815ef86dc766`. Validation: 56 widget browser cases, three focused admin metadata/portrait workflows and type checking passed; three optional hosted cases skipped. Mobile screenshots were reviewed and hosted JS/CSS matched the frozen tested release. No API/schema/data/production changes. UI rollback can use v1.20.0 assets; retain portrait-aware backend/cleanup as documented above. Prior staging versions were public `a447f10c-4a27-4f76-a82c-3b6a6cdeb000` and admin `3dd18ab9-b46a-4176-adef-c7f20de139b1`.

## Uncropped player thumbnails — v1.22.0

Player photo slots and admin upload previews now use contain instead of cover so tall/full-body images fit completely without cropping the head or feet. The existing neutral background fills unused space. Upload normalization already uses aspect-preserving scale-down, so no storage reprocessing or re-upload is required to apply the presentation fix. Name/no-image fallback icons remain unchanged.

Use both v1.22.0 asset URLs in the shared/fixed Webnode embed; admin rendering updates on reload. Validation: ten focused widget cases (tall source images at mobile/desktop sizes, missing/broken images, no-image icons and long names) plus two mobile/desktop admin upload workflows and type checking passed. Mobile screenshot review confirmed the synthetic image’s top/bottom markers are both visible. Hosted JS/CSS match the tested frozen release. Public staging version `6560e46b-86f2-4199-a4f6-e062ed34ec2d`; admin `2d9c393a-a637-411d-8900-f4f65f8de532`. No API/storage/data/Webnode changes. Asset-only rollback can select v1.21.0; keep portrait-aware backend and cleanup protection. Previous staging versions were public `25849b89-d822-483a-9835-956a8b7a05af` and admin `7f093ce7-c196-4d65-8f6c-815ef86dc766`.


## Click-to-enlarge player portraits — v1.23.0

Player photos are now keyboard-accessible buttons opening a native modal dialog with the player name, uncropped full image, dimmed backdrop and a close button. Escape, close and backdrop clicks dismiss it and restore focus to the thumbnail. Missing/unsafe/failed thumbnails remain noninteractive no-image icons beside names. An unavailable enlarged image shows a safe message. Dialogs live inside the widget shadow root and are removed when periodic data refresh replaces the roster, preventing a removed portrait from lingering in an open overlay. The same component works in authenticated coach draft previews using existing private image URLs. No new endpoint, permission, storage or image transformation is introduced.

Use both v1.23.0 references from [the shared embed](../../frontend/embed-shared.html) or fixed P11 embed to apply on Webnode. Admin previews update on portal reload. No Webnode or production configuration was edited.

Validation: type checking, builds, 56 existing widget regression cases, four new modal cases at 320/390/1440px and unavailable-image/refresh behavior, two private coach portrait workflows, and six hosted checks passed. Three opt-in network cases skipped in the local suite; the relevant real API and browser-only Webnode substitution checks subsequently passed against staging. Initial new test failures were corrected to account for native browser-chrome focus traversal and browser reuse of already-loaded image resources. Mobile modal screenshot review confirmed the full synthetic portrait remains visible. Hosted JS/CSS bytes match the frozen release, staging configuration/credential guards pass, and the admin portal still redirects unauthenticated requests to Cloudflare Access. No real player photo was uploaded or published during validation.

Deployed staging versions: public `ae817803-7082-4d81-8272-26a0bcbeaee9`; admin `cffc2fcd-4afb-404d-8758-45a397173cb0`. UI rollback can select v1.22.0 asset URLs, preserving portrait-aware backend/cleanup logic. Prior staging versions: public `6560e46b-86f2-4199-a4f6-e062ed34ec2d`; admin `2d9c393a-a637-411d-8900-f4f65f8de532`. No migrations or new resources were required.


## Calendar status copy — v1.24.0

Removed Status ej bekräftad from calendar event rows at the user’s request because unknown source metadata does not establish that an activity awaits approval. Event titles, times, locations, source status normalization and cancellation filtering are unchanged. Removed its unused CSS rule. The coach preview shares the updated renderer. Existing unknown-status calendar coverage now verifies the label is absent in the visible calendar.

Validation: type checking, frontend/admin builds, four focused calendar/tab browser checks, two hosted browser checks (including real staging API integration), staging configuration and credential guards passed. Hosted JS/CSS bytes match the frozen release. Deployed public staging version `d5422257-18d2-44b5-94df-afc7943c8dc9`; admin `2f487f4c-6711-43a4-aff5-68eb2f387523`. Use both v1.24.0 URLs from the shared/fixed embeds for Webnode; no Webnode edit, production deployment or schema/data change was made. Asset-only rollback may select v1.23.0, preserving portrait-aware backends. Prior staging versions: public `ae817803-7082-4d81-8272-26a0bcbeaee9`; admin `cffc2fcd-4afb-404d-8758-45a397173cb0`.
