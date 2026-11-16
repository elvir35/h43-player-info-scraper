# Optional roster details — implementation, 2026-11-13

The user authorized implementation of this proposal. The sections below preserve the original design rationale; the current behavior is recorded here.

## Current implementation

Public SportAdmin roster rows for P11 and F14 expose numeric person tokens in `userInfo<number>_<section>` row/detail identities. They are not row positions. The scraper now retains that numeric token privately as optional `sourceId` alongside each normalized name; it does not collect contact details, portraits or authentication-protected content. The parser still validates complete sections and duplicate identities. No guarantee of permanent vendor ID stability is assumed.

The authenticated ingestion Worker assigns an opaque random `memberKey` for each team/season/category membership. It preserves the key only when the same source ID and exact normalized name are present in consecutive valid snapshots. Removal, rejoining, name changes, role-category changes, or an intervening names-only snapshot produce a new key. This conservative rule avoids silent reassociation; spelling changes require the coach to re-enter optional details. Failed scrapes leave the previous valid snapshot and keys intact.

Private member keys are exposed only through the authorized team editor, never the public API. Raw source IDs stay in scraper/ingestion storage and are omitted from editor/public responses. Duplicate display names remain separate identities. The existing D1 snapshot JSON holds identities, and existing editorial revision JSON holds `rosterDetails`; no migration, table, database or other infrastructure is introduced.

Coaches can edit optional shirt numbers (one to three digits, preserving leading zeros and allowing duplicates), position text (up to 60 characters) and leader responsibility text (up to 60 characters) under Truppdetaljer. Names/membership stay read-only. Positions are free text to allow rotation and mixed positions; unknown values remain blank. Responsibilities are display labels and never affect portal roles or team grants. Existing publishing permissions, draft/preview/publication/history/rollback and audit controls apply.

New/changed details must reference a member in the current authorized team/category. Saves compare the roster observation version in the same conditional database write to reject concurrent roster changes. Unmatched historical details remain private and are excluded from all public/preview projections. Re-publishing an old revision cannot resurrect details for a departed/rejoined person. Clearing a field and publishing removes it publicly. A cached old editor that omits existing details is rejected rather than silently erasing them.

Public roster entries add only nonempty `shirtNumber`/`position` for players and `responsibility` for leaders. Name-only entries remain unchanged. All display text is rendered through DOM text nodes; empty optional data adds no placeholder role.

## Rollout and compatibility

Deploy the updated Worker before running the identity-aware scraper. Legacy names-only snapshots and ingestion requests remain accepted, but members without identities have read-only detail controls until resynchronized. The updated Python client reads both legacy and identity-aware snapshots. After identity-aware ingestion, older strict Worker/client versions cannot safely read the extended private snapshot format: prefer an asset-only rollback while keeping this backend, rather than blindly restoring an older backend or rewinding membership. An intentional backend downgrade requires a reviewed export/identity-stripping procedure and loses optional-detail associations. Existing immutable public embeds continue showing names only until repinned to v1.19.0. Coach preview uses the current shared renderer. Production deployment is not authorized by this staging work.

## Original proposal (historical)

## Implemented correction

Widget v1.14.0 shows player names in one column at viewport widths up to 600px. Player and leader names disable automatic hyphenation and ordinary word splitting; exceptionally oversized unbroken text can still wrap as a last resort instead of overflowing. Names remain complete plain text, without truncation or reduced font sizes. The private coach preview uses the same stylesheet. Wider layouts retain their existing columns. Published Webnode embeds must select both new immutable asset URLs to receive the fix.

## Confirmed repository findings

The public roster heading is already **Ledare**, not Tränare. It contains the SportAdmin Ledare section, which can include coaches, administrators and other team functionaries. The internal `coaches` array name is a legacy API field, not a claim that every listed person coaches or has portal editing rights. SportAdmin membership never grants portal access automatically.

Current scraper snapshots store normalized player and leader names only. The public roster records contain only `displayName`. Responsibilities, shirt numbers, positions and stable per-person source identifiers are not currently synchronized. No field editor or proposed API/storage contract below has been implemented. A name alone is not a reliable identity: duplicates, spelling corrections and renamed people must not transfer details to someone else.

## Recommended design

Keep SportAdmin authoritative for membership and names. Add optional editorial details for existing members, using the existing D1 and draft/preview/publish flow. This requires no additional service, queue or database product.

- Leader responsibility: optional label such as Tränare, Lagledare, Lagadministratör, Materialansvarig or another validated plain-text responsibility. Display it below the leader name. Use Ledare when unspecified; never infer Tränare for everyone.
- Player shirt number: optional short validated number, preserving the entered display value (for example 01). Decide the club’s allowed range and whether duplicate numbers should warn rather than block publication before implementation.
- Player position: optional validated position label (or a small club-approved list). Leave it blank when unknown; younger players may rotate positions. Allow clearing a previously published value.
- Portal UI: a separate “Truppdetaljer” editor listing the synchronized players and leaders. Names and membership remain read-only; coaches edit only their assigned team’s optional fields. Team publishing permission remains required to publish details. Team responsibility labels never change portal roles or login permissions.

Prefer verified values from SportAdmin if its public page already exposes these fields reliably. First inspect which fields and stable identifiers are publicly available and decide per field whether it is source-managed or portal-managed. Never bypass access restrictions or silently mix conflicting sources.

## Identity and synchronization investigation before implementation

1. Check whether public roster pages expose a stable per-person identifier that is suitable for both players and leaders. Store it internally, scoped by team/source and person category; do not add it to public responses unnecessarily.
2. If stable identifiers are unavailable, propose an explicit operator-assisted association method before enabling editing. Do not silently key editable details solely by display name or use fuzzy matching. Ambiguous identities show names only until resolved.
3. Store editorial details separately from synchronized names so ordinary scraping cannot erase coach edits. Reconcile against the latest valid roster: an absent person and their details stop being displayed after a validated removal. Failed scrapes retain the last valid membership snapshot and its existing stale-data behavior.
4. Preserve private publication history. Quarantine unmatched details after identity changes, and require explicit association before reusing them. Define rejoining-team and new-season behavior rather than reattaching old information automatically.

## API, safety and rollout

Propose an additive public roster projection: optional `responsibility` on leader rows, and optional `shirtNumber`/`position` on player rows. Final names and schemas need review; older name-only clients must remain supported. The widget renders all values as plain text and preserves the mobile layout.

Use existing verified Access identities, team-scoped authorization, CSRF protection, bound D1 queries, strict length/value validation, optimistic versions and audit records. Publish metadata atomically through the existing content revision system and merge only matching active members into public output. Check any club publication requirements for the additional player details before enabling them publicly.

Acceptance tests must cover names-only compatibility; private draft versus published details; clear/edit/rollback; cross-team denial; duplicates and renames; additions/removals/rejoining; failed and valid-empty scrapes; Swedish text; invalid/oversized/XSS values; number validation; stale edit conflicts; no internal identifier exposure; and desktop/mobile display.

## Delivery sequence

1. Ship the mobile names correction independently.
2. Review the public SportAdmin identity/field findings and agree on ownership, matching and allowed values.
3. Implement the optional metadata editor, additive API fields and display using existing D1 and portal infrastructure.
4. Validate in staging before any production rollout. This proposed enhancement does not block the existing production-launch plan.
