# Production cutover — 2026-11-16

The user authorized steps 3–6 of the launch checklist, then explicitly chose to perform Webnode publication personally. No Webnode edits or announcements to coaches were made by the agent.

## Completed

- Staging coach editing was still enabled at live inspection, despite the earlier assumption that it was frozen. It was explicitly disabled before production activation. Only production now accepts coach edits.
- Fresh encrypted backups were taken of both databases. Under the freeze, all editorial content, media metadata, memberships/incarnation identities and permissions matched exactly. No new staging edits needed copying; production roster observations were already newer. No records were deleted or overwritten to repeat an unnecessary migration.
- Production coach editing is enabled behind the independent exact-host Cloudflare Access application. Existing four allowed identities and team assignments were preserved. A real administrator signed in successfully through Cloudflare. Individual coach sessions were not impersonated; their team restrictions remain covered by existing authorization tests and the preserved grants.
- Through the authenticated production UI, a synthetic gradient image was processed into private WebP, saved in a draft and rendered in the private preview. Its public image URL returned 404 and the public welcome section remained unchanged. The image was removed from the draft, the draft was verified identical to its original JSON, and unchanged original content was published successfully. Publication confirmation and audit records were verified. The test image was never published. Its unreferenced private object is left to the existing orphan cleanup policy.
- GitHub environment `production` is limited to branch `main` and has the separately generated production token map stored as the encrypted environment secret `H43_INGEST_TOKENS_JSON`. No Cloudflare deployment credential was added to the workflow. The temporary clipboard transfer was cleared after the user saved the secret.
- Production environment variables select the production API, all eleven reviewed teams, authenticated ingestion, six-hour cadence and explicit production approval. Repository `YOUTH_ROSTER_ENVIRONMENT=production` selects that environment before job execution. Staging environment `YOUTH_ROSTER_SYNC_ENABLED=false` explicitly disables ingestion there; its secrets remain isolated for recovery.
- [Production dispatch #2 succeeded](https://github.com/elvir35/h43-player-info-scraper/actions/runs/43857621072), including environment validation, Python tests and authenticated synchronization of all eleven teams. This is a manual dispatch; neither it nor the earlier staging dispatch proves automatic cron delivery.

Final checks confirmed all eleven production roster observation times fall within that run (11:25:43–11:25:58 UTC), unchanged team permissions and original public editorial content, successful private WebP processing and a withheld test-image public URL, and expected publication/upload/draft audit records. The production API smoke checks passed all eleven teams and twenty published image URLs. Eight unrelated Worker configurations are unchanged. Production API version remains `adb85b32-9702-4f93-b7a5-2015b4dc4905`; the active production admin is `94415171-3043-4997-9d8a-e8c572547a3b` and frozen staging admin is `2c4c4038-e3b0-40dc-bade-a9413bf218a7`.

A browser-only rehearsal substituted production asset URLs into the published Webnode page locally for P2015, F2014 and F2012/2013 at 390px and 1440px. Team selection, all tabs and absence of widget overflow passed; eleven prepared directory links were checked. This did not publish anything. The rehearsal also reported `lucide is not defined` from existing inline Webnode code; the same error was reproduced on the untouched published page. It is a host-page issue observed in this browser, not a new production-widget regression, and was not changed because the user is handling Webnode personally.

The production portal is [here](https://h43-youth-admin-production.elvir-arslanovic.workers.dev/). Continue public rollout using the manual steps below before sending the launch announcement.

## Webnode publication — user action

1. In the shared `/lagsida/` page, **replace** the existing widget HTML block with the complete contents of [webnode-production-embed.html](../../frontend/webnode-production-embed.html). It uses shared query selection (`data-team-from-url`) and both production v1.24.0 asset URLs. Do not leave a second old widget/script block on the page. Publish.
2. In `/ungdom/`, replace the existing youth-directory HTML block with [youth-teams.html](../../frontend/youth-teams.html). Its eleven cards point to `/lagsida/?team=...` using birth-year slugs. Publish.
3. Verify at least [P2015](https://www.h43lund.se/lagsida/?team=p2015), [F2014](https://www.h43lund.se/lagsida/?team=f2014) and [F2012/2013](https://www.h43lund.se/lagsida/?team=f2012-2013), then all eleven cards. Check mobile tabs, names/images, contacts, calendar and both match filters. Confirm browser requests use the production API/asset hostname. Until this change, the existing Webnode widget continues reading staging and will not show new production edits.
4. Ask an existing coach to log in with their approved email, preview and publish a real change for their team, then verify it on the published Webnode page. The signed-in administrator canary has passed; a real individual coach session remains a useful launch acceptance check.
5. Send [the prepared Swedish announcement](coach-launch-message.md) after the public pages are verified. It contains the production login URL and email-code instructions. The agent has not sent it to anyone.

## Synchronization and operational follow-up

GitHub's hourly tick at minute 23 gates actual ingestion to 00:23, 06:23, 12:23 and 18:23 UTC for the six-hour interval. In Stockholm during November that is 01:23, 07:23, 13:23 and 19:23. GitHub may delay delivery. Observe the first successful production run whose event is `schedule` and whose synchronization step actually ran; a cadence-skipped hourly run is not evidence of ingestion. Use manual dispatch for an urgent refresh when needed.

No scheduled event was available in the workflow history at cutover. The user's reported successful sync is consistent with the successful manual dispatch; this distinction does not undo the approved portal/scheduler switch, but remains an explicit operational verification item.

Keep the encrypted cutover backups private. The portal administrator is the proposed operational owner; agree on retention and failure-notification handling. The existing GitHub workflow failure notifications and last-known-valid roster retention remain the smallest maintenance approach. Automatic SportAdmin team discovery/retirement stays in Phase 7.

## Recovery

Staging public delivery remains available, but staging editing and ingestion are disabled. Production is now the editing authority. After production edits, never reopen the old staging editor or switch the workflow back without freezing edits and reconciling newer content, memberships and image withdrawals. The existing baseline is not a current production backup.

To pause ingestion, set repository `YOUTH_ROSTER_ENABLED=false`. To pause editing, deploy an explicitly reviewed production admin configuration with `ADMIN_ENABLED=false`, keeping Access and private R2 intact. Reverting public UI assets must preserve portrait-aware backend authorization and cleanup logic. Do not restore a stale snapshot simply to reverse this cutover.

The earlier [production validation report](production-validation.md) and [rollout plan](production-rollout.md) are historical preparation evidence; this record supersedes their statements that production editing and synchronization have not been activated.
