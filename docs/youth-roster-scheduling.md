# Reviewed youth roster synchronization

SportAdmin owns membership. This workflow reuses the existing Python scraper and authenticated Worker ingestion; successful validated snapshots reflect additions/removals, while failed/incomplete scrapes retain the prior roster. Names and raw payloads must not appear in logs or committed data. The all-team registry contains public group mappings only.

Repository variable YOUTH_ROSTER_ENABLED must be true to run. YOUTH_ROSTER_ENVIRONMENT selects the protected environment (default staging). In that environment set YOUTH_ROSTER_ALL_TEAMS=true, YOUTH_ROSTER_SYNC_ENABLED=true, YOUTH_ROSTER_INTERVAL_HOURS=6, H43_API_URL to the verified staging Worker origin, and H43_WORKERS_SUBDOMAIN to the reviewed account subdomain. Store the dedicated team-token map only as environment secret H43_INGEST_TOKENS_JSON. Allow only main to access the environment; do not use a Cloudflare deployment token.

An hourly tick at minute 23 gates actual scraping to 00:23, 06:23, 12:23 and 18:23 UTC for the six-hour setting. GitHub schedules can be delayed. workflow_dispatch runs immediately through the same authentication and validation. A failed run reports counts/status only and should be reviewed in Actions. Enable native workflow failure notifications for the operations owner.

Production is not authorized by the staging workflow setup. It needs a separate environment, independently verified production origin/resources, fresh team-specific credentials and explicit production approval. The environment guard rejects cross-environment origins and rejects production unless YOUTH_ROSTER_PRODUCTION_APPROVED=true. No frontend, coach portal or Worker deployment is part of this scheduling change.

Disable further scheduled synchronization by setting the repository variable YOUTH_ROSTER_ENABLED=false. This preserves the last valid roster. After investigating upstream failures, manually rerun instead of restoring removed players from an old snapshot.
