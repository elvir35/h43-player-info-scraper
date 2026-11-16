# Phase 4 backend observations and release blockers

Evidence checked on 2026-11-11 against the real P11 staging API, existing feed APIs and public SportAdmin navigation. These are separate from frontend implementation; no backend data fix or production change was made in Phase 4.

| Observation | Evidence and disposition |
| --- | --- |
| P11 mapping verified for the current fixture | The group 378673 roster links to calendar 378669 and matches 378675. The [SportAdmin match page](https://h43lund.web.sportadmin.se/match/?ID=378675) identifies H43 Lund P11 and includes KFUM Lundagård F2015. The current friendly's opponent label alone is not evidence of mis-mapping. Live smoke checks compare exact P11 feed records and chronological next match; passed. Continue monitoring upstream labels for future teams. |
| Missing editorial content | API returns null season, welcome title/description, hero URL, social links and contact email. Expected nullable contract; generic UI fallback/omission works. No season/date setup is required. Phase 5 may populate content through authorized editorial functionality. |
| Unknown calendar status | The source does not assert a confirmed status. API preserves `unknown`; UI says status unconfirmed. Upstream cancellation coverage remains uncertain. |
| Source formatting | A calendar venue includes an empty parenthesized suffix, e.g. `Gunnesbohallen ()`. Displayed as returned; no hidden frontend cleanup. If corrected later, normalize in the source adapter with tests. |
| Source freshness | Calendar/match `sourceUpdatedAt` is null; fetch time is not scrape time. UI does not claim upstream freshness. Upstream monitoring/contract improvements require source-owner work. |
| Hero accessibility | There is no hero-alt field in the current API. Images are decorative behind team heading/copy. Extend the contract if future photos convey information. |

## Production release blockers

1. Publish/review the repository workflows and configure the protected staging environment's dedicated synchronization credential/variables. The existing six-hour youth roster workflow is **not enabled**. No code was pushed and no GitHub secret/workflow was remotely configured during Phase 4.
2. Enable the configurable six-hour synchronization, observe successful scheduled executions and assign freshness/failure alert ownership. Manual authenticated synchronization and failure retention/recovery were verified in Phase 3. Phase 4 reverified available roster status, exact current SportAdmin membership and preserved ingestion authentication; last successful sync observed was `2026-11-11T12:13:22.320761Z` (checked around 12:40 UTC). This is point-in-time evidence, not a claim that scheduling is active.
3. Published Webnode embed validation is now complete for desktop/mobile-sized Chromium at `/p11-test/`: tags/assets/API, style integration, no mobile overflow and section/recruitment navigation passed. See [validation evidence and limits](webnode-validation.md). Editor UI, physical devices, other browsers and a full accessibility audit were not exercised. A separate inline host-page `lucide is not defined` error needs site-owner review; it did not prevent the widget rendering.
4. Complete separate production binding/credential/publication/retention/monitoring review and obtain explicit production deployment approval. The user approved staging names/deployment; this does not grant production approval. Staging is a public URL, noindex is not access control.

Phase 4 has no critical new security finding from its tests. The preview, central assets and actual published Webnode test embed are validated within the documented scope; operational production blockers remain. No Phase 5 administration portal has been implemented or started. Later editorial content must keep SportAdmin authoritative for membership and must not introduce roster editing or ordinary approval states.
