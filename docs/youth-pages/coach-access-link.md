# Coach access link — v1.25.0

Deployed to the existing production Workers on 2026-11-16. Webnode remains a manual publication task for the user.

Each team's footer now contains **Ledare – redigera lagsidan** and **Saknar du behörighet? Kontakta Elvir.** The contact link opens an email to `elvir.arslanovic@gmail.com` with the team name in the subject. It appears on every tab and stacks on mobile. No new service, database migration or permission grant is involved.

The editor URL is derived from the configured API environment, so production widgets link to the production portal. It uses the reviewed birth-year alias, for example `/?team=f2014`. The existing alias map resolves this to the canonical ID after login. A requested team is selected only if it appears in the server-authorized team list; an unassigned team shows the contact address instead of silently opening another team. Empty-team and initial portal-error states also include the contact address.

The admin Worker accepts one bounded `team` parameter only on authenticated `GET /`. Duplicate parameters, unknown query parameters, unsafe values and API/asset queries remain rejected. The selector grants no access and does not change server-side authorization on reads or mutations. Cloudflare's anonymous login redirect preserves the requested team.

The public footer gives the contact route before Cloudflare sign-in. An attempted application-specific Cloudflare deny-message edit did not persist after dashboard reload; it is not claimed as deployed or relied upon. Cloudflare may still show its standard denial screen for an identity outside its allowlist. No allowlist, policy, audience or authentication setting was broadened.

## Validation

- Type checking passed.
- 118 Worker/API/tooling tests passed, including authentication and query isolation.
- 24 admin browser workflows passed, including authorized deep links, unassigned requested teams and users without assignments.
- 61 distinct local frontend cases passed after updating the existing contact-card assertion to count only contact-panel email links; three optional network cases were skipped locally. The new mobile footer and corrected contact test were rerun successfully.
- Live checks passed for all eleven production footer links, contact emails, mobile overflow and protected login redirects. A real signed-in administrator followed the F2014 footer link and the portal selected F2014.
- All eleven public API contracts and twenty currently public image URLs still passed the production smoke checks.

Production deployment versions: API/assets `a4cd272a-3b5b-48e0-8f9a-536ea07c169e`; admin `a9612fe0-9da1-464e-83ec-2249c349bd39`. Production remains the editing/synchronization authority; staging editing remains frozen. Staging build artifacts were frozen for reproducibility but were not deployed.

## Publish in Webnode

Replace the existing shared-page block with [webnode-production-embed.html](../../frontend/webnode-production-embed.html), which pins **both** CSS and JavaScript to production **v1.25.0**. Then publish. A page still pinned to v1.24.0 will retain its old footer. Earlier immutable assets remain hosted.

The earlier v1.24.0 public assets remain available for a UI rollback. Retain the team-selector-aware admin backend and its existing authentication; this change requires no data rollback. See [the production cutover record](production-cutover.md) before changing editing or synchronization environments.
