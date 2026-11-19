# Youth pages — privacy and security launch gates

Date: 2026-11-19. Status: proposed plan; no controls implemented or production changes made by this document.

### Scope changed — 2026-11-19

The user selected removal of the roster and cessation of youth scraping. [Roster retirement](roster-retirement.md) now governs this work. The unpublished team/person publication-control prototype was withdrawn; no publication-controls table was deployed. Individual matching and approval controls below are superseded, not additional launch requirements. The youth workflow is now disabled in GitHub. Staging API/widget v1.26.0 and the additive portrait-denial migration are deployed and verified across all eleven teams. Production API/admin/widget deployment and the approved historical roster cleanup are complete; see [the production report](roster-retirement-production.md). General privacy/security gates for retained team photos, contacts and operations remain applicable.

A read-only check before this change found staging roster/image delivery still public and the sampled production roster dated 2026-11-16. GitHub has scheduled run records, but these alone do not prove ingestion occurred. With roster synchronization now retired, this is historical context rather than a requirement to restart it.

Production infrastructure and some public pages are already active. “Before go-live” here means before broader promotion and acceptance of launch readiness; existing exposure must be addressed now. Previous deployment approvals and team-wide publication approvals are not evidence of each person's lawful publication basis. Earlier test results do not prove these new controls.

## Scope and principles

- SportAdmin remains authoritative for membership. Ordinary roster additions/removals remain automatic; do not introduce membership editing or approval of every scrape.
- Public visibility is a separate concern. A member can stay in the team without appearing publicly, or allow a name without allowing a photograph.
- Reuse Workers, D1, private R2, Access and existing scheduling. No new service is proposed.
- Do not infer permission from an unchecked “ej foto” field or presence in a public roster. SportAdmin's documented flag is not yet verified as available to this integration.
- Owners below are proposed roles; H43 must confirm the people responsible. No legal compliance certification is implied.

## 1. Immediate containment and inventory — before further promotion

Owner: portal administrator and developer.

1. Inventory production and staging API/image URLs, Webnode embeds, directory links, GitHub exports/artifacts and stored photographs. Record locations and counts privately; do not put actual names, image URLs identifying children or permission evidence in GitHub.
2. Check remaining staging dependencies, then disable or Access-protect staging public team and image delivery. Keep recoverable backups private. Blocking only the preview HTML or editor is insufficient.
3. Identify any known publication objection or uncertain image authorization and withhold the affected content promptly. If reliable person-level withholding is unavailable, use a reviewed broader team roster/photo disablement rather than assume editing membership or hiding CSS removes exposure. Prepare the exact control before changing production.
4. Confirm an interim removal contact and procedure, covering name, portrait, group photograph and direct image URL. Keep only the minimum private record needed to action a request.

Acceptance: anonymous requests cannot retrieve the retired staging roster or its images; production dependencies still work; known restricted content is unavailable from every controlled public path. Verify direct image URLs as well as pages.

## 2. H43 decisions and publication documentation — launch blocker

Owner: H43 board or delegated privacy lead.

1. Document purposes, categories of data and lawful basis for public names, leader/contact details, optional player number/position, individual portraits and team photographs. Review existing permission wording before deciding whether fresh permissions are needed. If relying on legitimate interests, document that assessment and children's interests; if relying on consent, document its scope, evidence and withdrawal process.
2. Review whether existing permissions cover the public H43 website and these processing arrangements. Keep website and social-media purposes clear. Do not make optional photograph permission a condition of team participation.
3. Confirm responsibility for requests, urgent safety issues and decisions about lifting a restriction. A coach must not independently override a restriction imposed by the club.
4. Update the privacy notice and family/coach information: sources, purposes, legal bases, recipients/providers, international-transfer assessment, retention, rights and contact details. Review processor agreements/roles for Cloudflare, Webnode, SportAdmin and GitHub, including transient GitHub Actions processing.
5. Record a DPIA screening and perform an assessment if required. Agree retention for snapshots, removed memberships, editorial history, uploaded images, audit records, exports and backups; avoid indefinite retention by default.

Acceptance: privacy lead approves the documented approach and confirms the basis for existing public content. Evidence is held privately and can be located without exposing it through the API or GitHub. Separate choices are a recommended design, not a claim that every purpose legally requires consent.

## 3. Verify SportAdmin integration and person matching — design blocker

Owner: developer, with H43/SportAdmin administrator.

1. Investigate a supported, authorized source for “ej foto” and public-name restrictions. Verify semantics, coverage, timestamps and availability; do not bypass authentication or scrape private member records without a separate authorized design.
2. Verify existing source identities and membership-incarnation keys across duplicates, renames, team moves, departure/rejoining and changed group IDs. Do not attach a privacy decision using display name alone.
3. Choose one documented mechanism: supported restriction synchronization where feasible, or minimal private D1 restrictions with an explicit manual notification process from SportAdmin. Membership synchronization stays unchanged.
4. Define precedence: a restriction wins over positive publication settings, scraped membership and restored/old drafts. A missing flag or failed fetch cannot clear a restriction. Only an authorized, audited review can lift it. Unknown/missing image permission is withheld where H43's selected policy requires verified authorization.
5. Resolve uncertain identity conservatively: do not transfer portrait permission to a guessed person. Preserve existing restrictions and withhold affected publication until reviewed. Define how person-level restrictions persist across membership incarnations without guessing that two people are the same.

Acceptance: reviewed design and synthetic examples demonstrate correct identity/precedence. If reliable person matching cannot be established, document a broader withholding/manual path and do not claim automated privacy synchronization.

## 4. Implement publication controls using existing infrastructure — launch blocker

Owner: developer; H43 privacy lead reviews behavior.

1. Add the smallest additive D1 model for separate name/photo publication restrictions and minimal private decision metadata, following Step 3. Keep evidence documents and sensitive reasons outside public records. No routine roster approval queue.
2. Apply server-side rules to public API projections and image-serving endpoints. Withhold associated details for hidden people; do not leak names via alt text, captions, accessible labels or image metadata. Return no privacy flags, reasons or evidence publicly.
3. Provide authorized administrators a clear restriction/removal action. Coaches can report an issue and see permitted publication status without unnecessary reasons. Enforce team scope, authorization and audit logging on mutations. Define any permitted coach action as restrictive only, not authority to clear a club restriction.
4. Apply restrictions to preview, publish, historical revision restoration, ingestion and backup recovery. Historical content must not republish a restricted portrait. Public photo URL revocation must remain effective when the object is retained privately for an agreed recovery period.
5. Handle team/group photographs through an explicit review-and-unpublish process. Do not add face recognition. Inventory copies/variants and remove or replace affected images; a person's portrait setting alone cannot identify everyone in a group photo.
6. Make restrictions effective on the next server response without waiting for the six-hour scrape. Review cache headers/variants and test bounded propagation; do not claim to revoke files already saved by third parties. Prevent older in-flight publication writes from defeating a newer restriction.

Acceptance: a synthetic member remains in SportAdmin/D1 while their public name/photo can be withheld independently; the next scrape, stale draft and rollback cannot undo the restriction. Direct image requests are denied. Set and verify a concrete propagation target before release, proposed at most 60 seconds for controlled endpoints, excluding already downloaded browser copies.

## 5. GitHub data containment and security hardening — before broad launch

Owner: repository/account administrator and developer.

1. Retain the youth flow: transient scrape to authenticated ingestion; logs contain status/counts only. Audit exception output, test fixtures, workflow logs/artifacts, generated assets and repository history for real personal data. Use synthetic people in automated tests and public screenshots.
2. The older senior workflow commits data/players.json and data/ladies_players.json. Map consumers before replacing delivery, stop new exports, remove tracked data and prepare coordinated history cleanup if appropriate. This is a separate senior-data issue, not evidence that youth rosters are currently committed. History rewriting needs an explicitly reviewed execution plan and cannot erase existing external clones.
3. Add generated-data ignores and CI checks; ignores do not untrack existing files. Avoid roster artifacts and payload logging. GitHub still processes data transiently while Actions runs the scraper; zero GitHub processing would require a separately scoped scheduler migration.
4. Protect the authoritative release branch with required checks and reviewed changes where workable; block force pushes/deletion and confirm who can access production workflow secrets. Verify MFA/recovery on Cloudflare, GitHub, Webnode and administrative email; verify Access session settings. Recheck the actual settings rather than treating earlier observations as current proof.

Acceptance: no real youth data in committed fixtures/generated bundles or retained public artifacts; no youth workflow data commits; branch/account protections verified. Senior consumer migration/history cleanup has an owner and reviewed schedule, or is completed before claiming that no player data is accessible on GitHub.

## 6. Validation, operations and release decision — final gate

Owner: developer supplies evidence; H43 privacy lead and launch owner sign off.

Required automated tests use synthetic identities:

- Independent name/photo restrictions; duplicates, renames, transfers, rejoining and identity ambiguity.
- Restriction survives scrape success, valid empty roster, scrape failure, missing permission data, replay and concurrent updates.
- Anonymous API and direct-image denial; no hidden identity in JSON, HTML, alt text or variants; no private decision metadata exposed.
- Unauthorized/cross-team changes denied; coaches cannot clear club restrictions; audit entry created.
- Old draft publish, revision restore, cache behavior and backup recovery preserve restrictions.
- Group-image removal workflow and safe preview; missing image fallback reveals a name only when name publication is permitted.

Required operational checks:

1. Re-run relevant existing API, scraper, frontend/admin, CORS and upload tests. Record current versions and results; previous passes are historical.
2. Observe a genuine scheduled production ingestion, not just a manual dispatch or cadence-skipped run. Confirm failure notifications and an owner, including stale-data escalation.
3. Test private backup recovery in isolation, applying current publication restrictions before any public access. Document recovery access and retention.
4. Rehearse an urgent name/photo removal and a former coach's access revocation, including both Access and D1 permissions. Confirm direct URLs and staging cannot bypass the result.
5. Review full Webnode cookie/analytics/social-embed behavior and the updated privacy/contact links. User handles Webnode publication unless separately authorized.
6. Record incident ownership and assessment/reporting procedure, coach instructions and actual support contact. Announcements are prepared, not sent without authorization.
7. Prepare reviewed code/config rollback. Never restore a pre-restriction database or older server that bypasses restrictions. If safety cannot be preserved during rollback, withhold affected public delivery.

Go/no-go: broader launch requires completed Steps 1–4, youth-data containment and baseline account/branch protections in Step 5, and Step 6 evidence with named operational and privacy owners. Any remaining senior-data cleanup is explicitly listed with scope; do not label the entire repository free of player data until verified. Existing production changes require the normal reviewed deployment approval; this plan grants none.

## Deferred work

Automatic SportAdmin team discovery/retirement remains Phase 7. Face recognition, a new consent platform, replacing GitHub Actions solely to avoid transient processing, and additional hosting infrastructure are not part of this launch plan.

## Reference guidance

- [SportAdmin roles and privacy policy](https://www.lime-sportadmin.com/sv/juridik/integritetspolicy/)
- [SportAdmin photo restriction guidance](https://www.lime-sportadmin.com/sv/hjalp/sakerhet/anvandarvillkor-gdpr-fotomedgivande/)
- [IMY: public membership registers](https://www.imy.se/vanliga-fragor-och-svar/far-en-idrottsforening-publicera-sitt-medlemsregister-pa-internet/)
- [RF: children's personal information](https://www.rf.se/bidrag-och-stod/personuppgifter/hur-paverkas-idrotten/barns-personuppgifter)
- [Previous security observations, not a fresh audit](security-status-2026-11-16.md)
- [Historical production cutover](production-cutover.md)
