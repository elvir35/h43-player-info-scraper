# Tabbed widget v1.1.0

Staged on 2026-11-11 following the user's requested visual change and separation of match/calendar sources. [Preview](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/). Staging deployment version: `3712610c-06c4-409e-86ba-0d234f1a47e9`.

## Behavior

The team hero remains visible. The top bar is a five-button tablist: Översikt, Matcher, Kalender, Spelare and Kontakt. Exactly one associated panel is visible and exposed to accessibility navigation. Selected styling, roving tabindex, linked tab/panel IDs, ArrowLeft/ArrowRight wraparound, Home/End and visible focus are supported. The selected tab and tab-button focus survive five-minute refreshes; each team instance has independent selection. Recruitment opens the Kontakt panel. Mobile tabs remain usable without document overflow.

Matcher contains upcoming fixtures only, from the dedicated [matches API](https://h43-matches-api.vercel.app/api/matches). The existing Worker adapter performs exact configured team filtering, normalizes dates/fields and excludes past/played/cancelled/postponed matches. A bounded additive `upcomingMatches` array now exposes those already-fetched normalized records; `nextMatch` remains its first record. The widget does not synthesize fixtures from calendar events or make a second raw browser feed request.

Kalender contains the next eight activities from the dedicated [calendar API](https://calendar-api-black.vercel.app/api/calendar), filtered in the Worker by exact configured team label (`P11` for this team). It includes P11 training/match/other activities as supplied by that calendar, never other teams' events. Calendar and match availability remain independent. No database schema/migration, new feed scraper or new infrastructure was needed.

## Embed update

The existing published Webnode page pins v1.0.0. It will keep the original layout until its HTML block is updated with both URLs below and republished. No Webnode edit was made by this release.

```html
<div id="h43-team-page" data-team-id="p11"></div>
<link rel="stylesheet" href="https://h43-youth-api-staging.elvir-arslanovic.workers.dev/team-assets/v1.1.0/team-page.css">
<script src="https://h43-youth-api-staging.elvir-arslanovic.workers.dev/team-assets/v1.1.0/team-page.js" defer></script>
```

Both archives remain immutable and hosted with their original hashes. Static cache headers now cover every archived version, retaining one-year immutable caching on older assets as well. v1.0.0 ignores the additive public field. v1.1.0 accepts an old API without the list during an API rollback, displaying its existing dedicated `nextMatch` only. Ingestion/publication/roster contracts and 256 KiB response bounds are unchanged.

## Validation and rollback

Twenty mocked Chromium tests passed, covering exclusive panels, source separation, keyboard/ARIA behavior, team isolation, selection/focus retention during refresh, null/failure/XSS states and all-tab interaction at 320/390/768/1440px. Forty-eight API/tooling tests passed, including mixed P11/P110/other-team feeds, complete chronological match projection and independent source availability. Live staging API/hosting checks compare the full P11 match list and calendar records with their respective feeds and verify both frozen asset versions.

The opt-in live preview browser test captures overview, matches, calendar and mobile screenshots. A second opt-in browser test substitutes v1.1.0 asset URLs in a local browser response from the actual Webnode host, checking all tabs and mobile layout without altering the published page. Run these with `H43_REAL_API=1`, `H43_WEBNODE_CHECK=1` and the staging `H43_PREVIEW_ORIGIN`; see frontend/test/team-page.spec.mjs. This browser-only substitution is distinct from validating a republished v1.1.0 Webnode block. The host page's separate Lucide error remains outside this widget.

For a frontend-only rollback, repin both Webnode asset URLs to v1.0.0. For a compatible staging Worker rollback, the preceding version is `29980a75-2a0a-4e58-a00f-8efc074a2549`; use the existing guarded staging configuration and rerun API/asset/browser checks. It may remove v1.1.0 hosting, so repin embeds first. No membership snapshot or authorization is restored by a code rollback. Production resources and routes are outside this procedure.

The six-hour workflow, secrets/publication/monitoring and production-approval gates remain tracked in [backend-issues.md](backend-issues.md). Phase 5 was not started.
