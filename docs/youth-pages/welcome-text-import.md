# SportAdmin welcome-text import — 2026-11-16

Completed a one-time import of the existing SportAdmin welcome heading and article body into the shared youth-team pages, at the user’s request. F2014 (`f12`), P2015 (`p11`) and F2012/2013 (`f14`) were excluded and verified unchanged.

## Imported teams

| Team | SportAdmin welcome source | Public page |
| --- | --- | --- |
| H43 Lund F2011 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=331232) | [View team](https://www.h43lund.se/lagsida/?team=f2011) |
| H43 Lund P2011/2012 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=224843) | [View team](https://www.h43lund.se/lagsida/?team=p2011-2012) |
| H43 Lund P2014 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=378656) | [View team](https://www.h43lund.se/lagsida/?team=p2014) |
| H43 Lund F2015 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=378680) | [View team](https://www.h43lund.se/lagsida/?team=f2015) |
| H43 Lund F2016 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=510417) | [View team](https://www.h43lund.se/lagsida/?team=f2016) |
| H43 Lund P2016 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=510425) | [View team](https://www.h43lund.se/lagsida/?team=p2016) |
| H43 Lund F2017 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=565792) | [View team](https://www.h43lund.se/lagsida/?team=f2017) |
| H43 Lund P2017 | [Landing page](https://h43lund.web.sportadmin.se/start/?ID=565800) | [View team](https://www.h43lund.se/lagsida/?team=p2017) |

## Scope and preservation

Only welcomeTitle and welcomeDescription were imported. The exact welcome article was selected, excluding news, sidebar fixtures/calendar, page navigation, images and image captions. Paragraphs, emphasis and HTTPS links were converted to the existing safe editorial format; scripts, raw HTML and image content were not imported. Source wording, including training times and age-based welcome headings, was retained rather than inferred from the calendar. The main team heading continues to use its configured birth-year label.

The youth directory currently links P2016 to its roster page; the welcome source was resolved through that page’s Hem navigation to start/?ID=510425. Do not assume roster and landing IDs are interchangeable.

No team had unpublished draft differences at preflight. All existing photos, contacts, social settings, seasonal messages and roster details were preserved. The import does not add ongoing welcome-text synchronization: coaches can continue editing these texts in the portal. SportAdmin remains authoritative for roster membership and calendar/match feeds remain separate.

## Execution and validation

The current isolated staging API/D1 serves these existing public Webnode widgets. Existing Cloudflare administrative credentials were refreshed and used with bound D1 queries. A private local-only adapter reused the existing server content validation, authorization, optimistic draft/publication version checks, save/publish functions and audit behavior under the active authorized portal administrator. No Worker was deployed, no Access policy was changed, and no production infrastructure or Webnode HTML was modified. The adapter was not exposed as an endpoint.

A Windows CurrentUser DPAPI-encrypted before-state backup and private operation journal are retained under worker/.staging/welcome-import. Version preflight rejects replay/concurrent coach changes. All eight imports were validated before applying; each publication was checked against its stored revision and audit record. Excluded teams were compared for unchanged draft JSON/version, published pointer, timestamps and configuration.

The public API returned exact imported heading/body for all eight teams. All eight actual Webnode URLs rendered the welcome heading/text and safe HTTPS links at desktop and 390px mobile widths without horizontal overflow. Representative desktop/mobile screenshots were visually reviewed. Evidence: artifacts/welcome-import-2026-11-16/validation.json and per-team screenshots. No application-code or schema changes required a new unit-test suite.

## Recovery

Previous publications remain in the existing revision history where they existed. Restoring earlier content should preserve any subsequent coach edits; use the normal editor/history flow after checking the current version. Teams receiving their first publication also have their original empty/editorial state in the encrypted backup. Do not replay this operation or overwrite later edits from that backup automatically.
