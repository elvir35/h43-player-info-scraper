# Compact blue header v1.2.0

User-approved direction: apply the compact mockup, omit the duplicate badge and preserve the original blue box background. Released to the existing [staging preview](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/) on 2026-11-11. No Webnode page, production route, API handler, database schema or ingestion setting was changed.

Deployed staging Worker version: `52901313-b2f2-47d7-bce8-94adafa103fd`.

## Result

- Original blue radial gradient, navy base and court-line decoration are preserved. Future configured hero photos keep their existing safe loading/fallback behavior.
- The header's forced 340/380px minimum height, badge and bottom club label are removed. Default desktop height is approximately 134px versus 380px before, with a 32px team heading, short welcome line and recruitment button alongside it.
- On mobile the heading is 27px and the recruitment CTA stacks below the identity text. The default header is approximately 182px. Content may grow for longer real team names/welcome content/season; no fixed height clips text.
- All five tabs, keyboard navigation, contact CTA, future editorial fields and separate exact-team matches/calendar sources remain unchanged.

## Embed and versioning

The existing Webnode HTML block must use **v1.2.0 for both JS and CSS**, then be republished. Staging preview uses it automatically. v1.0.0 and v1.1.0 remain hosted byte-for-byte; no released immutable URL was overwritten. Full snippet is in [frontend.md](frontend.md).

The frozen archive is `frontend/releases/v1.2.0/`. To revert just this visual update, repin both embed URLs to v1.1.0. The previous staging Worker version is `3712610c-06c4-409e-86ba-0d234f1a47e9`; use existing staging-only rollback procedures if needed and verify asset availability before choosing embed versions. Never restore older membership or authorization when rolling back code.

## Validation

Typecheck/build passed. Twenty mocked browser cases and the live P11 integration test passed; responsive cases at 320/390/768/1440px check a compact default header, no duplicate badge, the original navy base and no horizontal page overflow. Existing null, error, XSS, timezone, source separation, team isolation, tab keyboard/ARIA and refresh behavior remain covered. Desktop/mobile screenshots were visually reviewed.

Post-deployment checks passed: live API/hosting smoke scripts (including all three immutable releases), live preview browser rendering and browser-only substitution of the new assets into the Webnode test page. All eight pre-existing Workers retained their timestamps, route inventory was unchanged and staging bindings/ingestion authentication were preserved. Candidate public-file checks found no actual credentials. Substitution does not edit the published page; actual v1.2.0 publication remains the site owner's embed update. Local real-name screenshots remain ignored; no test payloads or credentials were embedded in the release.
