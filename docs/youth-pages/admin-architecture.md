# Phase 5 coach administration architecture

Implemented locally on 2026-11-11. **Not deployed. Phase 5 is not complete until approved staging authentication and deployment are validated.** Production and the live Phase 4 staging Worker remain unchanged. Existing P11 display authorization does not authorize team photographs or this new deployment.

## Discovery and assessment before implementation

The existing `worker/src/index.ts` publishes nullable welcome/image/social/contact fields from `team_seasons`; there was no coach login, permission table, draft, editorial history or image bucket binding. Phase 4 uses reusable vanilla TypeScript/CSS with scoped Shadow DOM, immutable assets and exact team-filtered schedule feeds. Public aggregates are no-store; only schedules have a 300-second cache. The existing Python scraper and ingestion token remain outside editorial administration.

Read-only account inspection with the existing Cloudflare OAuth login returned HTTP 403 for Access organizations/apps/identity providers and R2 buckets. Its zone list did not include h43lund.se. This establishes **insufficient visibility**, not that Access/R2 are absent. No account setting or resource was created. Actual metadata is private in ignored local `.staging` files; no IDs or credentials were invented.

The smallest extension is one separate admin Worker using the existing staging D1, one private R2 bucket and Cloudflare Access. Separation keeps admin APIs/assets off the unauthenticated public hostname. No ORM, password database, queue, KV, new framework or replacement scraper is introduced. `jose` verifies Access signatures; `jpeg-js` fully validates and normalizes bounded photos. Node compatibility is isolated to the admin Worker. Public API remains read-only and has no admin route forwarding.

## Boundaries and flow

```text
Coach -> Cloudflare Access (explicit email/approved IdP or OTP)
      -> admin Worker: JWT signature/issuer/audience/time + D1 user/subject/role
      -> team assignment and CSRF checks
      -> D1 drafts -> atomic published revision pointer + audit
      -> existing public Worker reads published pointer only
      -> existing Webnode widget fetches new published content

Upload -> browser resize/JPEG -> authenticated bounded Worker upload
       -> full server decode/re-encode -> private R2 + team-scoped metadata
       -> public image route only for current authorized published reference

Private preview -> same protected shared widget -> draft projection
                -> public API service binding for read-only SportAdmin projection
```

Cloudflare documents that Static Assets' internal router does not forward `ctx.access`, nor do Service Bindings propagate it. The admin Worker verifies `Cf-Access-Jwt-Assertion` with Cloudflare's JWKS rather than trusting email headers or downstream context. All admin assets run the Worker first, authenticate, then use `ASSETS.fetch()`. Preview calls to the public service binding require no propagated identity because that target is already a read-only public API. Sources: [Access/Workers limitations](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Static Assets routing](https://developers.cloudflare.com/workers/static-assets/binding/).

## Data model: migration 0004

`worker/migrations/0004_coach_editorial.sql` is additive. It does not modify roster tables, source mappings or schedule storage.

| Table | Purpose |
| --- | --- |
| admin_users | Explicit email allowlist, verified Access subject binding, admin/coach role, enabled flag and optimistic permission version |
| admin_team_assignments | Coach/team association, publish permission, optimistic version |
| team_content_state | Separate draft JSON/version, current published revision pointer, update actor/time, photo authorization and configuration version per team/partition |
| team_content_revisions | Immutable published content, previous revision, rollback source, publisher and time; composite team/partition identity |
| team_images | Private generated object key, owning team/partition, bounded dimensions/bytes, pending/ready/deleting state and uploader/time |
| admin_audit | Actor, action, team/partition, revision and timestamp; no scraped people or full draft text |

The migration initializes drafts from existing compatible editorial columns. It seeds **no users, credentials or photo permissions**. Existing published columns remain the public fallback until the first portal publication. Existing external hero URLs must be re-uploaded to private R2 before they become portal-managed images; P11 has no existing configured photo. Future team/partition onboarding must initialize its content-state row alongside `team_seasons`. No scraped membership or event arrays are copied into editable content or history.

## API and permission model

All routes are on the separate admin Worker under `/api/admin/v1`. A verified user must also be enabled in D1; first verified login binds their Access subject to their explicitly provisioned email. Later subject mismatches are rejected. No email header, role field or requested team confers authority.

| Route | Method | Permission / behavior |
| --- | --- | --- |
| me | GET | Verified explicit user; identity and session-bound CSRF token |
| teams | GET | Only assigned teams; admin sees all enabled teams |
| teams/:id/content | GET | Team-scoped draft, published record, allowed history and permissions |
| teams/:id/draft | PUT | Team editor; exact content schema + expectedVersion |
| teams/:id/publish | POST | Current publish permission + expected draft version/head |
| teams/:id/rollback | POST | Same, with a historical revision owned by this team/partition |
| teams/:id/images | POST | Team editor; private normalized JPEG upload |
| teams/:id/images/:uuid | GET | Team-scoped private ready image |
| preview/teams/:id | GET | Team-scoped aggregate with draft overlay; never changes public state |
| users | GET/PUT | Admin; manage explicit users/roles/enabled state, optimistic version |
| teams/:id/assignments | PUT | Admin; manage coach assignment/publish permission |
| teams/:id/settings | PUT | Admin; display name and separately established photo-publication permission; source identity remains read-only |

`/teams/:id/preview` is an authenticated HTML frame using the same frontend source, compiled with a same-origin private API base. Every preview API/image request rechecks identity/team scope. Normal public bundles continue omitting credentials. Admin APIs have no permissive CORS. The public Worker rejects admin routes and only exposes the current published image through `GET /api/v1/teams/:id/images/:uuid` after checking the D1 head and photo permission.

Draft input is exactly `{expectedVersion, content}`. Content has all of: `welcomeTitle` (120), `welcomeDescription` (5000), `seasonMessage` (600), `heroImageId` (UUID or null), `heroAlt` (160), `photoPublicationConfirmed` (boolean), `instagramUrl`/`tiktokUrl` (2048 each), `instagramLabel`/`tiktokLabel` (40 each), `contactEmail` (254) and `contactText` (600). Text/URL/image fields are nullable; blank text normalizes to null. JSON requests are bounded to 64 KiB and unknown keys are rejected. Publish input is exactly `{expectedVersion, expectedPublishedId}`; rollback additionally requires `revisionId`. Permission updates also require their current expectedVersion. Photo/settings changes use an independent config version. Image upload input is raw `image/jpeg`, not multipart or an arbitrary URL. Errors expose only safe code/request ID; stale versions return 409.

## Editing and atomicity

Draft saves require the current version and reference only ready, same-team images. Stale/concurrent writes return 409. Every SQL mutation rechecks enabled user, role/team permission and current partition. A publish/rollback transaction inserts the revision, updates the pointer/draft version and inserts its audit event in a D1 batch; failure rolls all of them back. Rollback creates another revision, never rewrites history or SportAdmin data. A failed acknowledgment must be resolved by reloading content/history before retrying; optimistic versions prevent silent replays.

Drafts never enter the public projection. Public/editorial reads and images are no-store; a new publication or image withdrawal is visible on the next request. Already displayed browser content can remain until the widget's five-minute refresh or manual reload. Schedule caches are unrelated and remain unchanged. No new cache-invalidation service is necessary.

## Images and retention

### Free-plan decision and verified prerequisite — 2026-11-11

The user selected **Cloudflare Images Free** because team-page photo uploads will be rare; social media remains the normal channel for frequent photos. Do not upgrade Workers or Images automatically. The JPEG implementation described below is the existing local candidate, not the accepted final Free-plan implementation.

The authenticated Images Transformations dashboard reports **0 / 5,000** unique transformations and explicitly states: **"You don't have any zones on your account. Add a zone to enable transformations."** The current `workers.dev` staging hostname is not a club-controlled Cloudflare zone. No domain/DNS change is authorized by the choice of Images Free. Determine whether an appropriate zone exists in another club-controlled account before designing the URL-based integration; preserve Webnode hosting and existing DNS.

Official documentation distinguishes remote-image transformations from hosted Images storage. [Images Free pricing](https://developers.cloudflare.com/images/pricing/) includes 5,000 unique transformations monthly and rejects new transformations over the limit without charging. [Transformations setup](https://developers.cloudflare.com/images/optimization/transformations/overview/) requires enabling the feature on a zone. The [upload-to-R2 binding tutorial](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/) explicitly lists Images Paid as a prerequisite, while the general binding/pricing pages do not clearly establish Free entitlement to that raw-byte path. Therefore do not assume a free Images binding or silently provision an Images Paid subscription. Account-specific entitlement must be verified before relying on a binding.

The Free integration remains blocked on domain availability and a reviewed origin-access design. Preserve authentication, draft-image privacy, metadata removal, output limits and current-publication authorization. Never expose unprocessed originals merely to make URL transformations work, and never fall back to an original image after transformation/limit failure. Transform once at upload and persist the sanitized result to private R2 if the verified Free route supports those requirements; normal public image reads should not consume new transformations. A failed transform must leave the existing photo and publication unchanged. R2 usage billing remains separate. No application code, subscription or deployment was changed during this feasibility check; existing tests do not validate a Free integration.

Coaches choose JPEG/PNG/WebP up to 10 MiB. The browser rasterizes/resizes to a maximum 1600px edge and JPEG, then uploads at most 2 MiB. The server trusts none of those checks: it permits JPEG only, enforces streamed bounds, strictly decodes with memory/resolution limits, caps dimensions at 2048px per edge and four megapixels, and re-encodes without EXIF/GPS/comments. Normalized output is capped at 3 MiB. SVG, GIF and arbitrary bytes are rejected.

Uploads go through the authenticated Worker rather than direct presigned R2 URLs. These small files need server validation/re-encoding and continuous team/CSRF checks; proxying avoids extra S3 signing credentials and a separate finalize protocol. R2 credentials never reach the browser. Objects use generated keys and pending metadata before upload; failed uploads cannot become ready or published.

No Cloudflare Images capability was verified, so no additional image-processing product is enabled. The JPEG fallback is CPU-bound: the admin staging template proposes a 1,000ms CPU limit and requires a suitable Workers paid plan plus a real representative-image timing check before launch. The 10ms Workers Free CPU allowance must not be assumed sufficient. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). If a measured image exceeds the bound, upload fails privately; consider the existing Images binding only after its availability/cost is reviewed.

A daily maintenance trigger claims up to 100 uploads older than seven days that have no draft or revision reference. Claiming marks them deleting; subsequent saves/publications cannot attach them. R2 deletion precedes metadata deletion; failures retry next run. Referenced historical images remain available for rollback. Monitor backlog and errors; seven days is eligibility, not a guaranteed deletion deadline. Revisions/audit are retained pending an owner-approved wider retention policy. There is no public cleanup or database-administration endpoint.

## Setup, staging and approval

Preferred eventual production address: `https://admin.h43lund.se`, contingent on DNS/zone ownership and separate production approval. Proposed isolated staging address: `https://h43-youth-admin-staging.elvir-arslanovic.workers.dev`; **not deployed**. Staging shares only `h43-youth-staging` between the two named youth Workers, with dedicated private `h43-youth-images-staging`. Production must use separate D1/R2, Access AUD/policy, origin, CSRF secret and credentials.

1. A Cloudflare operator must supply/verify Access organization, a self-hosted application protecting the entire admin Worker hostname (including assets, APIs and previews), explicit allowed users and approved OTP/IdP. Do not protect only a path or only preview deployments. Signed-in dashboard inspection on 2026-11-11 shows Zero Trust onboarding, and Workers explicitly requires Zero Trust setup before Access protection can be enabled. Access configuration is therefore still a prerequisite, rather than only an API-permission issue.
2. Provision/review the dedicated staging R2 bucket with r2.dev and custom public domains disabled; verify supported Workers plan/CPU and scoped account permissions. No resource has been created by Phase 5.
3. Put verified public metadata in ignored `.staging/admin-settings.json`: `origin`, `issuer`, `audience`, `bucketName`. Use actual values; placeholders are not deployment configuration. Refresh `.staging/admin-inventory.json` with organization/app/bucket privacy evidence. The generator refuses missing/403/unverified/public/production targets.
4. `node scripts/admin-staging-config.mjs` generates both admin/public staging configs; `--check` compares them to verified inputs. It adds the same private R2 binding to the public Worker. Normal Phase 4 config generation refuses to drop an existing Phase 5 media binding. Only the two explicitly named staging youth Workers may share this DB.
5. The user's requested administrator and P11 coach bootstrap is prepared privately in ignored `.staging/admin-bootstrap.json/.sql`. Review it with the operator. `node scripts/admin-bootstrap.mjs INPUT .staging/admin-bootstrap.sql` only prepares SQL, never executes it. Actual addresses are not in public assets/docs/fixtures. Do not use synthetic test identities in real Access/D1.
6. Complete local tests/dry-run review, obtain explicit Phase 5 staging approval, then back up the staging D1 privately and apply migration 0004/approved bootstrap. Verify publication/name/source state remains unchanged before deployment.
7. Install a newly generated 256-bit-or-stronger `CSRF_SECRET` through Cloudflare's secret store on the admin Worker. Keep existing ingestion secrets unchanged. Never put either secret into vars, frontend code, shell arguments, logs or Git. Deploy only the reviewed staging targets. Configure daily cleanup and monitor it.

Commands from `worker/` after environment review and the stated approval:

```powershell
npm ci --no-fund
npm run typecheck
npm test
npm run build:frontend
npm run build:admin
npx playwright install chromium
npm run test:frontend
npm run test:admin-ui
node scripts/admin-staging-config.mjs --check
# Stop on any nonzero result. The following commands require explicit staging approval.
npx wrangler d1 migrations apply DB --env staging --config wrangler.admin.staging.generated.jsonc --remote
npx wrangler d1 execute DB --env staging --config wrangler.admin.staging.generated.jsonc --remote --file .staging/admin-bootstrap.sql
npx wrangler deploy --env staging --config wrangler.admin.staging.generated.jsonc --dry-run --outdir dist/admin-review
npx wrangler deploy --env staging --config wrangler.staging.generated.jsonc --dry-run --outdir dist/public-review
# Deploy reviewed targets and securely install CSRF_SECRET; do not use the root/production env.
```

The generated configs contain actual verified IDs locally, never tracked IDs/secrets. Explicit secret installation order may temporarily leave the new Worker returning ADMIN_NOT_CONFIGURED; it must never bypass checks to make login work. Nothing in CI deploys or holds account/ingestion credentials. Staging validation must include actual allowed/denied logins, P11/P12 isolation, expired sessions, images, draft/preview/publication/rollback, public widget rendering and unchanged SportAdmin/production baseline.

## Local development, release and rollback

`npm run dev:admin` starts `http://127.0.0.1:3001` with synthetic users, signed fixture JWTs, mock JWKS and temporary D1/R2. This loopback Node harness is deliberately not a deployable Worker. Its `/__test/*`, identity-selection header and public-data bridge do not exist in the deployed bundle. It never touches the live database or real Access accounts. `npm run test:admin-ui` runs the real editor/private preview/public rendering workflow against that harness.

Public frontend v1.3.0 adds optional season message, photo alternative text, social labels and contact text. Existing v1.2.0 embeds already reflect the original editable fields; to show all new optional fields, repin once to reviewed v1.3.0 after staging approval. Subsequent coach content changes need no embed changes. Older immutable archives are retained. v1.3.0 is a local candidate, not a hosted release; freeze its bytes only after review.

Keep migration 0004 in place during a compatible code rollback; do not delete editorial rows or restore scraped membership. Temporarily disable admin delivery if authentication fails; retain private R2 and D1 for recovery. Recorded pre-Phase-5 staging public version is `52901313-b2f2-47d7-bce8-94adafa103fd`. Reverting to that version returns the old public content projection, so coordinate any published editorial rollback and image availability deliberately. Prefer a new revision for content rollback. Never restore revoked photo/roster permissions from backups.

The remaining blockers are Access setup, R2 activation/private bucket provisioning, a suitable Workers CPU plan and representative image timing, an operator-approved retention/monitoring owner, explicit staging approval and real staging login/deployment tests. Production domain verification remains a later production prerequisite. No production or Phase 6 work is authorized by this implementation.

## Final local verification record

66 API/configuration/security tests, 6 admin browser workflows, 20 public frontend browser cases and 81 Python tests passed. Two opt-in hosted frontend checks were skipped; Phase 5 is not hosted. Typecheck/build, JavaScript syntax checks and the admin development dry run passed; full npm audit reported zero known vulnerabilities. Candidate public files contain none of the actual local OAuth/ingestion credentials, and relative documentation links validate.

The existing OAuth session was refreshed through Wrangler's normal mechanism during final verification. All eight pre-existing Workers retained their modification timestamps, route inventory and dedicated staging D1/ingestion authentication were unchanged, the live Phase 4 API/preview/v1.2.0 assets returned 200, and both original H43 feeds returned 200. Live JSON still has the Phase 4 schema, confirming Phase 5 was not deployed. Access/R2 read attempts still return 403 after refresh; the dashboard reaches sign-in. No permission or account setting was broadened.

For immediate review, the loopback synthetic demo can run at `http://127.0.0.1:3001` using `npm run dev:admin`. It is not a staging URL or real coach authentication. Stop that local process when review is finished.

## Signed-in account review — 2026-11-11

Subsequent setup update: the user activated Zero Trust Free and explicitly approved saving/applying the two-email staging policy. The dashboard confirmed "Policy saved successfully" and "Application successfully configured" for **H43 Youth Admin — Staging**, with destination `h43-youth-admin-staging.elvir-arslanovic.workers.dev` and policy **H43 staging portal — named users**. The policy allows only the two user-specified bootstrap emails; no wildcard/domain/everyone rule was added. The existing Cloudflare identity provider was selected; email one-time-pin login has not been configured or tested. Application session duration is 24 hours. These are saved Access resources, not evidence of a deployed/protected admin Worker: Workers Access enforcement, signed assertion validation, login tests, verified application AUD/configuration and the remaining R2/CPU prerequisites must still be completed before staging launch. No application code, D1 migration, paid subscription or production resource was deployed/changed by this step.

The user's dashboard login was verified in the existing Cloudflare account. Zero Trust shows its onboarding screen; the Workers dashboard explicitly says to set up Zero Trust before requiring Access sign-in. No organization/application/policy configuration was created or changed.

Workers Plans shows **Free** as the current plan, with 10ms CPU per request. This does not establish adequate CPU for the current server-side JPEG decode/re-encode path. The dashboard offers Paid at $5/month plus usage; any subscription change requires the account owner's cost approval. A suitable plan still needs an actual representative-image timing check before launch.

The authenticated R2 API returns HTTP 403, code 10042: "Please enable R2 through the Cloudflare Dashboard." R2 activation is therefore missing; this response does not verify a bucket or its privacy configuration. The operator must complete account activation/billing steps, then provision/verify the dedicated private staging bucket. No bucket, service subscription, credential, migration or deployment was changed during this review. Staging deployment approval remains a separate gate after prerequisites and generated configuration are verified.

## Current staging launch — 2026-11-11

This section supersedes earlier pre-deployment blockers for the **text-only** release. The user requested completion and launch after agreeing to postpone photo uploads. The portal is deployed at https://h43-youth-admin-staging.elvir-arslanovic.workers.dev/ with verified Access issuer/audience, a dedicated CSRF secret and the existing isolated youth staging D1. No R2 binding, Images subscription, paid CPU setting or cleanup cron is present. `IMAGE_UPLOADS_ENABLED=false` rejects uploads before reading/decoding bytes; the API advertises the unavailable feature and the Swedish interface explains it. Drafts cannot attach a new image while disabled. Existing image implementation is retained for future reviewed use, not enabled on staging.

Migration 0004 was applied successfully; the approved administrator and P11-only coach assignment were initialized. Your real administrator login, draft save/private preview, publication into the public staging API/widget, and history rollback succeeded. A real welcome headline was temporarily used for testing and the original content restored; the three revisions and audit records remain. Roster snapshot/timestamps, memberships, feeds and ingestion credentials were unchanged. Anonymous requests to HTML, JS and admin API redirected to Access. Real coach sign-in still requires the coach to use their own approved account; local tests cover coach permissions and cross-team denial, and remote D1 confirms only the P11 publishing assignment. Do not claim a real coach login was exercised.

Current deployed versions: admin `38c48bbf-77e2-4a0d-a3e5-ec31651736e2` (includes secret installation), public staging `f7c60722-d4cb-4461-8bc8-feb904e1e1ec`. Public frontend v1.3.0 is frozen and hosted; older pinned assets remain. Existing Webnode snippets were not changed. Existing core welcome/social/contact fields work with older widget versions; the optional season message, contact text and custom social labels need the v1.3.0 embed.

Validation: typecheck/build, 68 API/security/configuration tests, six established admin browser workflows plus the new text-only browser case, and 20 public browser cases passed (two optional hosted checks skipped). Live contract/CORS/method/security/live-roster/live-schedule/chronological-match checks passed. D1 audit confirms a draft save, two publications, a rollback and real identity binding. The eight pre-existing production Workers and route inventory are unchanged. Credential scanning and documentation/whitespace checks passed.

Rollback: keep additive migration 0004 and audit/history. For editorial mistakes, use a new rollback revision in the portal. To stop the portal, redeploy only its reviewed staging configuration with `ADMIN_ENABLED=false`; never bypass Access. If public-code rollback is necessary, `npx wrangler rollback 52901313-b2f2-47d7-bce8-94adafa103fd --env staging --config wrangler.staging.generated.jsonc` restores the pre-portal public version; it no longer serves editorial revisions, so review content effects before execution. No rollback was executed. Production release, photo uploads and publication of six-hour GitHub automation remain separate work.

## Editorial visibility and formatting update — 2026-11-11

Widget v1.4.0 places welcomeTitle in the overview h2, seasonMessage in an overview note, and contact email/text in the Contact tab. The actual published Webnode test block was verified still pinned to v1.2.0, which ignores the optional season/contact-text fields. At inspection time, title/email/contactText were empty in both current draft and published content; the seasonMessage was populated/published. Do not invent or overwrite the user's missing values. Save and Publish remain separate intentional operations.

A shared bounded text renderer now supports bold, italic, h3 subheadings, ordered/unordered lists, paragraphs/line breaks and HTTPS links. It creates DOM nodes and text nodes only; it never parses HTML. Raw HTML remains rejected by the admin schema and literal if encountered in untrusted public fixtures. Unsafe URL schemes, credentials and custom ports cannot become active links. Formatting applies only to editorial body fields, never player/coach names or fixture titles. The admin toolbar inserts the supported text notation and provides a rendered preview; it is not an unrestricted HTML or WYSIWYG editor. No new runtime dependency, database schema or infrastructure was needed.

Admin assets are bundled so the editor and private/public preview share identical formatting logic. Deployed staging versions: public `da86853e-791e-4d7a-958e-40184c662df3`, admin `1f6c81e7-9360-4bb6-856a-3be33c9cfd12`. v1.4.0 is frozen alongside older immutable releases; Webnode is unchanged and must repin its two asset URLs using `frontend/embed-p11.html`. Roll back assets to v1.3.0 only with awareness that formatting markers will display literally; content remains ordinary strings and no migration rollback is needed.

Validation: typecheck/build; 21 public browser cases (20 existing plus one focused editorial/unsafe-markup regression); eight admin browser workflows, including formatted preview/publication/contact/season-message round trip; and two deployed/Webnode-host browser checks passed. Webnode compatibility was tested by substituting the new version in the test browser only. User P11 content was preserved; real publishing was exercised on synthetic local fixtures for this update. Photo uploads remain disabled pending the user's review of `image-cost-review.md`; no paid service or production setting was changed.

## Social/contact layout — v1.5.0

By user request, the overview now presents valid configured social accounts in a blue/gold Follow the team card directly below the welcome heading and before long editorial copy. No social card appears when no valid account exists. Social links retain validation, new-tab isolation and configured labels. Contact has one email action with the address as the button label; the duplicate address/button pair is removed. Public and private previews share the renderer. No editorial data or API/schema/authentication change was made.

Deployed public staging version `877085ba-fd1f-4a03-b5e8-35ca44d74d00`, admin staging version `c10b6ae9-db41-416d-803c-181aadf0b2f7`. Widget v1.5.0 is frozen; use the updated `frontend/embed-p11.html` to explicitly repin Webnode. Older releases remain immutable. 23 local frontend cases, eight admin workflows and two deployed/Webnode-browser compatibility cases passed. Additional desktop/mobile checks verify social placement before long text, visible links without overflow and exactly one email link in Contact. Eight production Workers/routes and authenticated roster ingestion remain unchanged.

## Images-backed uploads enabled — 2026-11-11

This supersedes the earlier text-only/photo-deferred status. The user authorized proceeding with the included image allowance and billing, then personally completed both Images and R2 checkout terms/overage authorizations. The active Images configuration is transformations-only, $0 base fee, with hosted Images/Stream storage unchecked. Workers remains Free. Included allowances are not spending caps; usage overages remain automatic as reviewed in image-cost-review.md.

The dedicated Standard bucket `h43-youth-images-staging` was created with Western Europe location hint. Authenticated managed/custom-domain APIs confirm public access is disabled. Only the two youth staging Workers bind it. The admin Worker adds the Images service as IMAGE_PROCESSOR and enables IMAGE_UPLOADS_ENABLED; the public Worker binds only R2 for read-only current-publication delivery. No credentials are added to frontend assets. The generator requires verified zero-base-fee/no-hosted-storage entitlement plus private bucket evidence and sets no paid CPU limit.

Production/staging upload processing now uses the Images binding, never the JavaScript JPEG decoder. The browser still limits/normalizes JPEG/PNG/WebP to a JPEG upload of at most 2 MiB. Server-side streamed limits and JPEG markers precede Images.info dimension/type validation (2048px edge, four megapixels). One transformation scales down to 1600px and encodes WebP; a bounded 3 MiB result, WebP signature and output dimensions/type are checked before creating a pending R2 reservation. WebP discards source EXIF/GPS/XMP metadata. Only sanitized output reaches private R2. No transform occurs on public image reads. Missing binding, quota, service or decode failure never falls back to an original or a CPU-heavy encoder and cannot replace current content. The legacy JPEG normalizer is used only by the explicitly development-only local harness; service-bound processing has focused mock contract/failure tests plus a successful live test.

Additive migration 0005 records content_type, defaulting existing rows to image/jpeg and permitting image/webp. Both authenticated and public readers use this validated stored type; filenames follow it. Migration 0005 applied successfully to staging only. Daily cleanup retains the existing seven-day eligibility and draft/history reference checks.

Deployed public staging version `c9e4948a-4cd1-4aca-90d7-db5b0381ae02`; completed admin deployment `7bccaf64-bc78-4793-8909-01e12705716b`. The earlier interrupted portal deployment was completed and its enabled controls verified in a fresh browser tab. No widget version bump or Webnode link change was needed for MIME/storage support.

Validation: typecheck/build, 74 API/security/configuration/processing tests and eight admin browser workflows passed. A real 1600x1000 synthetic gradient uploaded through the authenticated portal and native Images service, producing 17,170-byte WebP. Private preview rendered; downloaded output decodes correctly with no EXIF/GPS/XMP/source comment. D1 confirms zero saved draft/history references and the public route returns 404. No test image was saved or published. A browser-control interruption prevented discarding/closing the test tab's local unsaved preview; close that test tab without saving. The private orphan is eligible for scheduled cleanup after seven days. The actual P11 photo-publication permission was not enabled or inferred from billing authorization; administrator club authorization and per-image coach confirmation still apply.

Live public contract/headers/CORS/method/live-roster/calendar/match chronology checks passed. Eight existing production Workers/routes and authenticated scraper ingestion are unchanged. No production deployment occurred. To stop uploads, redeploy admin staging with IMAGE_UPLOADS_ENABLED=false; retain private media/history and current type-aware API readers. Do not roll the public media reader back to a JPEG-only version after WebP photos have been published.

## Overview team-photo layout — v1.6.0

By user request, team photos no longer serve as a cropped/dimmed banner background. The compact blue gradient/court-line header is retained. Overview displays its welcome heading, complete team photo, social card, introduction and season message in that order. The responsive photo has full opacity, object-fit:contain and a 520px maximum desktop height, preserving the entire source image without text overlays. Broken-image failure removes the photo frame, and an absent image adds no placeholder. The image is hidden along with Overview when switching tabs. Existing API heroImageUrl/heroAlt fields and image authorization/storage remain unchanged.

Staging public version `aca594cb-5be9-42bf-859b-3e76b8502633`, admin `25455944-fd96-46eb-a4b3-e74027d31057`. Both public and private previews use the shared renderer. Immutable widget v1.6.0 is frozen with all earlier versions retained; repin both Webnode asset URLs using frontend/embed-p11.html. No user content, images, permissions or database rows were modified by this layout change.

Validation: typecheck/build, 26 frontend browser cases, eight admin workflows and two deployed/Webnode compatibility cases passed. New tests cover whole-photo placement at 320/390/1440px, full opacity/containment, no image in the header, no horizontal overflow, tab visibility and the authenticated draft preview. Real published P11 photos were visually checked on desktop/mobile. Webnode compatibility used test-browser-only substitution; the published embed was not changed.

## Contact phone and Truppen — v1.7.0

The coach editor adds optional public contactPhone alongside contactEmail. Strict schema validation accepts existing JSON revisions without the new key, returning null, and continues rejecting unknown privilege/content keys. Draft save, preview, publication, rollback and audit use existing team-scoped JSON revision storage; no database migration or infrastructure was required. Public API contact.phone is nullable and additive. Both server and frontend constrain telephone syntax, and the browser renders a digits-only tel link while retaining a readable display number. Email and phone each appear once; phone-only contacts are supported without an unnecessary club fallback.

The former Spelare tab is now Truppen, containing separate players and leaders sections from the same read-only SportAdmin roster. Automatic leaders no longer appear in Contact. Existing free-form editorial text is preserved, including any coach names the user wrote manually.

Deployed public staging version `8344994d-31d4-413d-ae9c-2a809bda8478`, admin `7dec340d-6ee1-49e4-94c5-8a2b1dccb08d`. Widget v1.7.0 is frozen with previous releases retained. Use frontend/embed-p11.html to repin both Webnode URLs; deployment itself does not change the published block. All user contact values/rosters/images were preserved; synthetic phone values were used only in local tests.

Validation: typecheck/build, 75 API/security/configuration cases, 28 frontend cases, eight coach workflows and two deployed/Webnode-browser checks passed. Tests cover valid/invalid phone strings, private draft versus public publication, removal/reload, old JSON compatibility, one mail/phone link, phone-only fallback, executable URL rejection and separate squad/contact rendering. Production remains outside deployment scope.

## Multiple named contacts (v1.8.0)

Contact people are editorial JSON, independent of SportAdmin roster membership. The editor supports an ordered list of up to 20 people, each with optional name and at least one validated email/phone. Existing revision JSON is normalized on read; legacy first-contact fields remain compatible projections. Server validation rejects unknown fields, oversized lists, invalid links and inconsistent legacy projections. Save/preview/publish, optimistic concurrency, team authorization and audit logging use the existing mechanisms; no migration, new binding or service is required. Deleting a contact only affects the draft until publication.

## Editor navigation update (2026-11-11)

Top-of-form anchor navigation targets editorial sections and administrator-only settings. Anchor activation opens details elements and focuses/scrolls the target without recreating inputs or discarding unsaved values. Contact starts collapsed. The preview shortcut appears after successful save-and-preview; only successful saving reveals and focuses the private preview. Existing authorization and publication boundaries are unchanged.

Validated with 11 admin browser workflows, including desktop/mobile anchors, collapsed-contact value retention, preview focus/scroll and unpublished-contact isolation. Candidate credential/configuration checks passed; the staging portal still redirects unauthenticated requests to Access. Eight existing production Workers/routes were unchanged. Admin staging version: 1d41be7b-d776-4bb3-b152-383075e47ebc. No API, migration or widget-version change. Rollback from worker/: npx wrangler rollback 03c0dee1-825d-4260-b0ba-789221993dfb --env staging --config wrangler.admin.staging.generated.jsonc.


## Birth-year labels in the admin portal — 2026-11-12

Admin navigation and the editor heading now use the verified cohort labels in config/team-labels.json (for example P11 → P2015, F12 → F2014, with combined cohorts preserved). The mapping is bundled into the admin assets; unknown future teams fall back to their configured names. Canonical IDs, database display names, exact upstream feed labels, coach assignments and public widget content are unchanged. No database migration or widget release is required.

Validation: all 11 admin browser workflows passed, including birth-year label visibility and mobile layout; staging configuration, credential scan and anonymous authentication checks passed. The eight pre-existing production Workers and routes remained unchanged. Admin staging version: c701a00b-b82d-4e9f-80b5-89067baa1658. Previous version for rollback with the existing staging configuration: c86a4b77-89c5-4f29-a787-6905a0820594.


## Team context and account removal — 2026-11-12

A sticky selected-team banner and birth-year headings identify the page being edited. The administration section first shows coaches assigned to that team and offers removal from only that team. Account roles and portal-wide removal are in the separate, initially collapsed “Alla portalanvändare · gäller samtliga lag” section. Removed/inactive accounts are grouped in a further collapsed list, with reactivation available.

`POST /api/admin/v1/users/remove` is administrator-only and requires the existing verified Access JWT, same-origin CSRF protection and JSON `{ "email": "coach@example.test", "expectedVersion": 1 }`. It returns `{ "version": 2 }`. Bound SQL atomically disables the account, increments its version, records an audit event and clears all team assignments. Stale versions return 409 with no assignment/audit changes. Self-removal returns 422; non-administrators are denied. No new migration or infrastructure is needed.

Removal is reversible account deactivation, not deletion of historical identities or authored revisions/images. Reactivation uses the existing versioned users PUT and does not recreate removed assignments. D1 authorization denies disabled users on each request, including existing authenticated sessions. The portal does not modify Cloudflare Access policies; those remain a separate sign-in allowlist. Team-only removal uses the existing versioned assignments PUT and preserves other teams’ grants. Permission changes are blocked in the UI while an editorial draft has unsaved changes.

Staging validation: 91 Worker/API tests, 13 admin desktop/mobile browser workflows and type checking passed. Deployed admin version `87e71ddf-ea68-4c46-a48f-1a836ba2fd13`. Anonymous me/users/removal routes redirect to Access. Eight existing production Workers and all existing routes were verified unchanged. No migration or live account changes were performed. Rollback: restore previous staging admin version `fbc38e40-1653-401c-90cc-b1add01de064`; D1 schema is unchanged and disabled users remain safely denied.

## Editor navigation and notifications — 2026-11-12

The team context and section links share a sticky wrapper outside the editorial form, keeping links available when the administrator scrolls into permissions. A ResizeObserver measures its actual height for anchor offsets. Mobile links use one horizontally scrollable row. Notifications have a close button; success/information messages expire after 6.5 seconds (paused while hovered/focused), while errors remain until dismissed or replaced. The notification is below the editor to avoid covering the navigation.

Validation: 15 desktop/mobile admin browser tests passed, including automatic/manual dismissal, persistent errors, anchor clearance, scroll visibility and no horizontal page overflow. Admin assets built successfully and the credential/link scan passed. Staging admin version `28458dca-51a4-42d8-b354-d860827399d0`; no API, database, public widget or production configuration changes. Rollback to prior admin version `87e71ddf-ea68-4c46-a48f-1a836ba2fd13` if needed.


## Prominent publish confirmation — 2026-11-13

Successful editorial publication now displays a large green confirmation panel below the sticky team navigation, scrolls it into view and focuses it. The panel names the published team and links to its public Webnode shared page in a new tab using the existing birth-year slug map, with noopener/noreferrer. It replaces the previous transient sidebar notification for publication; ordinary save/error notifications retain their existing behavior. Confirmation persists until dismissal, a team reload/switch or a new edit; starting another publish removes stale confirmation before the request. Failed publication never creates a success panel. The dismissal control restores focus to Publish without triggering a mutation or the shared busy-state wrapper.

Validation: 21 admin browser workflows passed; after refining dismissal focus, three focused desktop/mobile/failure checks passed again. Reviewed 390px and 1440px screenshots confirm the link and confirmation fit below navigation without overflow. Existing staging configuration and credential/documentation checks passed. Deployment is admin staging only, version `4a90df93-c900-4232-9326-6d0cdc17d17a`; unauthenticated access still redirects to Cloudflare Access. No live team content was published during verification. Public widget remains v1.24.0; no Webnode embed update, API/database migration or production deployment is required. Rollback the staging admin Worker to `2f487f4c-6711-43a4-aff5-68eb2f387523`; portrait-aware backend/cleanup logic remains intact in that version.
