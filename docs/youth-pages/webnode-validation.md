# Published Webnode embed validation

Checked 2026-11-11 at [P11 test](https://www.h43lund.se/p11-test/), following the user's request to inspect the published page. This supersedes the earlier Phase 4 handoff's statement that a real Webnode block had not been tested. The user published the page; this validation made no website or Cloudflare deployment changes.

## Observed results

- Published page returns HTTP 200 and retains the intended root, external CSS and deferred script tags.
- v1.0.0 JavaScript, CSS and badge return 200; the real API returns 200 with exact `Access-Control-Allow-Origin: https://www.h43lund.se` and no-store.
- The widget renders in its shadow root with the H43 theme: hero fallback, next match, eight calendar events, 15 players and four separate coaches.
- Desktop Chromium at 1440px renders inside the existing 1200px content column without visibly changing the site header/footer.
- Mobile Chromium at 390px renders without horizontal document overflow. The existing mobile menu and team layout are visible.
- The Spelare link scrolls to the roster and the recruitment CTA scrolls to contact while staying on the same page. The site's smooth scrolling needs time to settle before checking positions.
- Missing welcome/photo/social/email fields use the expected fallback/omission behavior.
- The widget loads with the site's cookie banner present and continues working after choosing necessary cookies.

## Separate host-page finding

The browser reports `ReferenceError: lucide is not defined` from inline HTMLDocument handlers on the Webnode page (observed near lines 706/711). The team widget does not use Lucide and renders successfully despite the error. Site-owned icon initialization should be reviewed separately; no global script was edited during this check. No widget asset/API network failure or CORS error was observed in the final run.

## Limits and remaining work

This verifies the actual published HTML block in desktop/mobile-sized Chromium, not Webnode's editor UI, physical mobile devices, Safari/Firefox, every surrounding website interaction or a full accessibility audit. Existing automated fixture/error/security tests remain separate evidence. Staging API/assets still serve this published test page; it is not a production backend rollout.

Screenshots and network diagnostics are retained locally under `frontend/staging-results/webnode/` (ignored because they contain real published names). Production release still requires the workflow/secrets/six-hour sync, observed scheduled executions, monitoring and separate production review/approval described in [backend-issues.md](backend-issues.md).
