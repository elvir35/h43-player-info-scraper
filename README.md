# H43 Lund Squad Scraper

## Youth roster retirement — 2026-11-19

The user chose to remove youth roster display and stop scraping. The youth GitHub workflow is disabled; v1.26.0 removes public/editor roster UI, returns empty compatibility fields, rejects retired ingestion and blocks known player portraits. Matches, calendar, team images and named editorial contacts remain. The production API/widget/editor are deployed and historical roster cleanup is complete. Webnode asset repinning remains the user's task. See the production report in docs/youth-pages/roster-retirement-production.md. See [the retirement release plan](docs/youth-pages/roster-retirement.md). Older phase notes below are historical. The separate senior-team scraper is unchanged.

## Coach portal (Phase 5, local candidate)

The Swedish editor, Access JWT verification, team-scoped permissions, private drafts/preview,
published revision history and R2 photo flow are locally implemented/tested. **Not deployed:**
real Access/R2 configuration and explicit Phase 5 staging approval remain required.
See [admin architecture/setup](docs/youth-pages/admin-architecture.md),
[admin security](docs/youth-pages/admin-security.md) and
[coach guide](docs/youth-pages/coach-user-guide.md).
Run `npm run dev:admin` from `worker/` for the loopback-only synthetic demonstration.

## Youth team frontend (Phase 4)

The reusable names-only Webnode widget is deployed to the [P11 staging preview](https://h43-youth-api-staging.elvir-arslanovic.workers.dev/preview/p11/).
See [frontend build, tests, exact embed and rollback](docs/youth-pages/frontend.md) and
[remaining backend/production release blockers](docs/youth-pages/backend-issues.md).
Production pages and senior functionality are unchanged; no coach portal is implemented.

## Youth roster synchronization (Phases 2–3)

SportAdmin owns player and coach membership. The separate youth scraper reads
the public P11 roster (group `378673`) and returns names only. It does not use
the senior portrait/age schema or write to the senior data files.

```bash
python scripts/scrape_youth_roster.py
python scripts/scrape_youth_roster.py --team-id p11 --team-name P11 --group-id 378673
```

The default output contains status and counts, never names. Optional
`--output .roster-payloads/p11.json` writes a private UTF-8 transport payload
atomically. Do not commit live youth payloads or publish them as artifacts.

A complete, validated page synchronizes both lists, including automatic
additions/removals and verified empty sections. Missing/changed/incomplete
sections, HTTP failures and persistence failures retain the last valid roster.
There are no player approval states, roster editor or manual removals. Applicable
publication authorization must be established before enabling public delivery.

Phase 3 implements D1 persistence, authenticated ingestion and the versioned
public Worker API alongside the Phase 2 parser. The in-memory store remains
test-only; no temporary operational membership store is used. See
[local development and deployment](docs/youth-pages/deployment.md) and the
[security review](docs/youth-pages/security-review.md). No production deployment
or frontend/coach portal is included.

The new `scrape-youth-roster.yml` workflow reuses GitHub Actions but is disabled
unless repository variable `YOUTH_ROSTER_ENABLED=true`. It validates
and logs counts only unless `YOUTH_ROSTER_SYNC_ENABLED=true` connects the
protected environment's `H43_API_URL` and dedicated `H43_INGEST_TOKEN` secret. `YOUTH_ROSTER_INTERVAL_HOURS` defaults to `6` and supports
`1, 2, 3, 4, 6, 8, 12, 24`; an hourly UTC trigger gates due scraping. Manual
dispatch bypasses the hour gate. Team variables are `YOUTH_ROSTER_TEAM_ID`,
`YOUTH_ROSTER_TEAM_NAME`, and `YOUTH_ROSTER_GROUP_ID`, defaulting to P11.
No variables/secrets were enabled and no production deployment was performed.
For authenticated synchronization use `python scripts/sync_youth_roster.py`
with credentials set securely in environment variables, never command arguments.
Worker checks run from `worker/`: `npm ci`, `npm run typecheck`, `npm test`.

Run all senior/youth fixture tests with `python -m pytest`. See the
[architecture](docs/youth-pages/architecture.md),
[integration evidence](docs/youth-pages/sportadmin-integration.md),
[synchronization contract](docs/youth-pages/api-contract.md), and
[delivery plan](docs/youth-pages/implementation-plan.md).

## Senior squads

This repository scrapes the publicly visible player and coach/leader lists for H43 Lund senior squads from SportAdmin:

- Herrar A: https://h43lund.web.sportadmin.se/grupp/?ID=125511
- Damer A: https://h43lund.web.sportadmin.se/grupp/?ID=147067

It extracts only information shown on the public group page. It does not log in, call member-only APIs, or expose private/member-only data.

## Usage

Install locally:

```bash
python -m pip install -e ".[test]"
```

Run tests using stored fixtures:

```bash
pytest
```

Run the live scraper:

```bash
python scripts/scrape_players.py --all
```

Run one squad only:

```bash
python scripts/scrape_players.py --squad men
python scripts/scrape_players.py --squad ladies
```

Validate an existing generated file:

```bash
python scripts/scrape_players.py --all --validate-only
```

## JSON Schema

The scraper writes UTF-8 JSON without a generated timestamp, so scheduled runs only commit when squad data actually changes.

- `data/players.json` contains Herrar A
- `data/ladies_players.json` contains Damer A

```json
{
  "schema_version": 3,
  "group": {
    "club": "H43 Lund",
    "team": "Herrar A",
    "sportadmin_group_id": "125511",
    "source_url": "https://h43lund.web.sportadmin.se/grupp/?ID=125511"
  },
  "players": [
    {
      "name": "Olof Lundahl Olsson",
      "number": "31",
      "position": "H6",
      "age": 25,
      "image_url": "https://publicpages.sportadmin.se/api/file/squad/9799/5193930?a=491&g=...",
      "profile_url": null
    }
  ],
  "coaches": [
    {
      "name": "Per-Albin Borhammar",
      "role": null,
      "age": 37,
      "image_url": "https://publicpages.sportadmin.se/api/file/squad/9799/4046516?a=491&g=...",
      "profile_url": null
    }
  ]
}
```

Player `number` is `"-"` when SportAdmin does not publicly present a jersey number. Player `position`, coach `role`, `age`, `image_url`, and `profile_url` may be `null` when SportAdmin does not publicly present the value. SportAdmin currently exposes detail toggles and image lightboxes, but not separate public profile pages for this group, so `profile_url` is normally `null`.

## Validation

The scraper fails when:

- the HTTP response status is not successful
- the response does not look like the expected H43 Lund SportAdmin squad page
- no players are found
- no coaches/leaders are found
- any player or coach is missing a name
- duplicates remain after deterministic normalization
- the new player or coach count drops by more than 35% compared with the matching existing generated JSON file

Duplicate players are removed deterministically by keeping the first public page occurrence for each normalized `(name, position, age)` identity. Duplicate coaches are handled the same way using `(name, role, age)`.

## SportAdmin Structure

The public squad page uses repeated `div.userRow` elements. Each row has an `onclick` handler that toggles a hidden detail block. Detail ids ending in `_1` are public player entries. Detail ids ending in `_2` are public coach/leader entries.

For each player row:

- the visible row contains the thumbnail, displayed name, visible position, and visible age
- the matching hidden detail block contains a table with labels such as `Nummer`, `Position`, and `Ålder`
- the scraper prefers detail table values over visible row text
- generated styling and layout-only classes are avoided

For each coach/leader row:

- the visible row contains the thumbnail and displayed name
- the matching hidden detail block may contain labels such as `Nummer`, `Roll`, and `Ålder`
- `Roll` is exposed as `role` when SportAdmin publicly provides it
- generated styling and layout-only classes are avoided

## GitHub Actions

`.github/workflows/scrape-players.yml` runs daily at `05:17 UTC` and can also be started manually with `workflow_dispatch`.

The workflow:

- checks out the repository
- installs Python dependencies
- runs fixture-based tests
- runs the live scraper for both senior squads
- validates `data/players.json` and `data/ladies_players.json`
- commits and pushes only the generated JSON files when either changed

The workflow uses the built-in `GITHUB_TOKEN`. Repository-level permissions default to `contents: read`; the scrape job grants `contents: write` only because it may need to commit the generated JSON.

## Static HTTPS Access

For browser `fetch()` from a Webnode HTML block, publish the generated JSON files through static HTTPS URLs.

With GitHub Pages:

1. Push this repository to GitHub.
2. In repository settings, enable GitHub Pages from the branch that contains the `data/` folder.
3. Fetch the JSON from a URL like:

```text
https://OWNER.github.io/REPOSITORY/data/players.json
https://OWNER.github.io/REPOSITORY/data/ladies_players.json
```

Alternative static hosts such as Cloudflare Pages, Netlify, or Vercel work as long as they serve the file over HTTPS with browser-readable CORS headers.

## Webnode Fetch Example

```html
<div id="h43-players"></div>
<script>
fetch("https://OWNER.github.io/REPOSITORY/data/players.json")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load player data");
    return response.json();
  })
  .then((data) => {
    const root = document.getElementById("h43-players");
    root.innerHTML = data.players.map((player) => `
      <article class="h43-player">
        ${player.image_url ? `<img src="${player.image_url}" alt="${player.name}">` : ""}
        <h3>${player.name}</h3>
        <p>${[player.position, player.age ? `${player.age} år` : ""].filter(Boolean).join(" · ")}</p>
      </article>
    `).join("");

    const coaches = document.createElement("section");
    coaches.innerHTML = data.coaches.map((coach) => `
      <article class="h43-coach">
        ${coach.image_url ? `<img src="${coach.image_url}" alt="${coach.name}">` : ""}
        <h3>${coach.name}</h3>
        <p>${[coach.role, coach.age ? `${coach.age} år` : ""].filter(Boolean).join(" · ")}</p>
      </article>
    `).join("");
    root.appendChild(coaches);
  })
  .catch((error) => {
    document.getElementById("h43-players").textContent = error.message;
  });
</script>
```
