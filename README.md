# H43 Lund Squad Scraper

This repository scrapes the publicly visible player and coach/leader lists for H43 Lund Herrar A from SportAdmin:

https://h43lund.web.sportadmin.se/grupp/?ID=125511

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
python scripts/scrape_players.py --output data/players.json
```

Validate an existing generated file:

```bash
python scripts/scrape_players.py --validate-only --output data/players.json
```

## JSON Schema

The scraper writes `data/players.json` as UTF-8 JSON without a generated timestamp, so scheduled runs only commit when player data actually changes.

```json
{
  "schema_version": 2,
  "group": {
    "club": "H43 Lund",
    "team": "Herrar A",
    "sportadmin_group_id": "125511",
    "source_url": "https://h43lund.web.sportadmin.se/grupp/?ID=125511"
  },
  "players": [
    {
      "name": "Olof Lundahl Olsson",
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

Player `position`, coach `role`, `age`, `image_url`, and `profile_url` may be `null` when SportAdmin does not publicly present the value. SportAdmin currently exposes detail toggles and image lightboxes, but not separate public profile pages for this group, so `profile_url` is normally `null`.

## Validation

The scraper fails when:

- the HTTP response status is not successful
- the response does not look like the expected H43 Lund SportAdmin squad page
- no players are found
- no coaches/leaders are found
- any player or coach is missing a name
- duplicates remain after deterministic normalization
- the new player or coach count drops by more than 35% compared with an existing `data/players.json`

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
- runs the live scraper
- validates `data/players.json`
- commits and pushes only `data/players.json` when it changed

The workflow uses the built-in `GITHUB_TOKEN`. Repository-level permissions default to `contents: read`; the scrape job grants `contents: write` only because it may need to commit the generated JSON.

## Static HTTPS Access

For browser `fetch()` from a Webnode HTML block, publish `data/players.json` through a static HTTPS URL.

With GitHub Pages:

1. Push this repository to GitHub.
2. In repository settings, enable GitHub Pages from the branch that contains `data/players.json`.
3. Fetch the JSON from a URL like:

```text
https://OWNER.github.io/REPOSITORY/data/players.json
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
