# Decision log

A dated record of every decision that changes after the blueprint was written.
`docs/blueprint.md` plus this file are the source of truth; where they differ, the newest entry here wins.

## 12 November 2026: Revision 2

The fourteen changes in the blueprint table "Decisions changed in revision 2" are adopted as written.
Topics: eager translation, translation quality gate, translation fallback, wall ordering by reach,
prayer limits, posting limits, reports, moderator actions, crisis handling, classifier test,
circuit breakers, minimum age (working default 16), the "no cookies" wording, and the data model additions.

## 14 November 2026: Revision 2.1

The ten changes in the blueprint table "Revision 2.1, 14 November 2026" are adopted as written.
Topics: staged classifier gate, `review_all` as a standing mode, provider B candidates, primary
translator chosen per language, three-source "Needs prayer" page, two-tier soft-launch exits,
crisis message drafts, "received" confirmation wording, private link token after `#`, and `is_test`
plus late crisis marking in the data model.

## 14 November 2026: Revision 2.2, all ten proposals accepted

Accepted by the maintainer in the build prompt. The full text is in the blueprint section
"Revision 2.2"; where it conflicts with earlier sections, 2.2 wins.

| # | Change |
| --- | --- |
| 1 | Author revise flow: for fixable categories the form comes back once with the text intact, a plain explanation, and "Edit my request" / "Send it for review as it is". Held only on the second attempt or for non-fixable results. |
| 2 | `unattended` mode replaces automatic closing when no moderator has acted for 48 hours. |
| 3 | Each AI task reads an ordered model list from configuration; a weekly self-test runs through the live classifier and translators. |
| 4 | The eager translation set is automatic (languages opened in the last 48 hours, capped at 8); "Translation looks wrong" flag, three flags discard and retry once. No weekly human review. |
| 5 | The confirmation page shows three "Needs prayer" requests. |
| 6 | The shareable address is `/r/{id}` with no language; expired links show other requests; link previews never contain request text. |
| 7 | "Your prayers" status line, kept on the device only (up to 100 ids). |
| 8 | "Needs prayer" widens from 7 to 14 to 30 days when fewer than 60 requests qualify. |
| 9 | Removed: per-device prayer limits, the anomaly flag, the "half of the last 50 held" breaker, and the amber, red and black queue tiers. Kept: one prayer per device per request per day, 30 per request per network per day, 600 an hour per network, reach ordering, the posting-burst and report breakers. |
| 10 | Bus-factor protection recorded in `GOVERNANCE.md` and `docs/runbook.md`. |

## 17 November 2026: Milestone 0

| Topic | Decision | Why |
| --- | --- | --- |
| Database location | D1 created with jurisdiction `eu` | Requests reveal faith and health; EU storage keeps the privacy page simple. Europe is a workable middle for a global audience, and the wall is edge-cached, so distance affects only posting and praying. Cannot be changed on an existing database; before launch, recreating it is cheap. |
| Repository | `Pray-Wall/prayer-wall`, public, in a GitHub organisation | Revision 2.2 change 10 |
| Deputy maintainer | @andreiyurik | Named by the maintainer |
| Public contact address | doublestrike.rar@gmail.com | The maintainer's personal address is the login for the hosting account and should not be published |
| Cloudflare account | The maintainer's existing account, shared with an unrelated worker | Maintainer's choice. Consequence: the deploy token can edit every Worker in that account. |
| Deploys | Only from GitHub Actions | Keeps the Cloudflare token in GitHub's secret store and out of every other machine |
| Test integration | `@cloudflare/vitest-plugin` 1.x with Vitest 5 | The blueprint's "Vitest with the Workers test integration" was published as `@cloudflare/vitest-pool-workers`, which is now deprecated and renamed |
| TypeScript | 5.9 | Conservative choice; TypeScript 7 is current but is not yet needed |
| Platform logs | Workers observability off | Network addresses must not reach logs |
| Source link | The footer links to the deployed commit, passed in at deploy time as `GIT_SHA` | AGPL: users of the running service must be able to get its exact source |

### Assumptions verified for M0 (17 November 2026)

| Assumption | Result |
| --- | --- |
| Current Hono and Wrangler versions | Hono 4.13, Wrangler 4.16x, from the npm registry |
| Vitest integration for Workers | Works; package renamed (above); configured with the `cloudflareTest()` plugin |
| D1 location options | Jurisdictions (EU, US, FedRAMP), fixed at creation; or a location hint (six regions) that is a preference, not a guarantee. Source: Cloudflare D1 "Data location" docs. |
| D1 point-in-time recovery window | 7 days on the free plan, 30 days on the paid plan. Source: Cloudflare D1 "Limits" docs. Matches the blueprint. |

## 17 November 2026: Milestone 1

| Topic | Decision | Why |
| --- | --- | --- |
| "Needs prayer" in M1 | Plain ordering by reach, oldest first on ties, with the 7 / 14 / 30-day widening | The shuffle and edge cache are M4 work; the three-source page needs translations (M6). Until then the page is the neediest 20. |
| Paging cursor | `(reach_count, published_at, id)` for "Needs prayer"; `(published_at, id)` for "Newest" | The blueprint's cursor used `prayed_count`; Revision 2 moved ordering to reach, so the cursor follows the sort key |
| Card in M1 | Shows the prayer count as text. No "I prayed" button, no menu, no "Ask for prayer" link | Those arrive with the features behind them (M2, M3, M4, M6); a control that does nothing would mislead |
| Card label wording | "Personal request", "For someone else", "For an event or group" | The form's "Myself" reads wrongly on a card seen by someone else |
| New design token | `--on-blue`: white in light mode, `#0B1730` in dark mode | White text on the dark-mode blue (`#8FB4F2`) fails contrast |
| Interface text format | `{ "key": { "message", "description" } }` per language | JSON has no comments; this keeps the explanation of each phrase beside it and is a format translation tools read |
| Plurals and "time ago" | The runtime's built-in plural rules and relative-time formatting | No hand-written plural logic per language; Arabic needs six forms |
| Unknown language code | `/xx` redirects to `/en` | Blueprint: unknown codes fall back to English |
| Static files | Served by Workers static assets from `public/` | Blueprint choice; the Worker is not invoked for them |
| Sample data | 40 invented requests in 12 languages, loaded into the live database by a hand-run workflow | Lets the wall be checked where it runs. **Must be deleted before any real person posts** (see runbook). |
| Arabic interface text | Drafted by the builder, **not yet reviewed by a native speaker** | Needed to build and test right-to-left; the go-live checklist still applies |

### Assumptions verified for M1 (17 November 2026)

| Assumption | Result |
| --- | --- |
| Every colour pair meets 4.5:1, including the dark column | Yes, all 22 pairs; lowest is muted text on the page background in light mode at 5.07. `node scripts/contrast.mjs` re-checks. |
| The wall transfers under 50 KB, under 10 KB of JavaScript, no images | About 4 KB compressed (12.7 KB uncompressed) for 20 cards plus the stylesheet; no JavaScript; no images |

## 17 November 2026: Milestone 2

| Topic | Decision | Why |
| --- | --- | --- |
| Country on a request | **New, asked for by the maintainer.** An optional list on the form, blank by default ("Prefer not to say"); shown on the card in the reader's language. Stored as a two-letter code in `requests.country`. Never derived from the network address. | Makes the wall feel global without publishing a location the author did not choose. An automatic country would break the promise that nothing but a daily hash is derived from the network address, and can endanger people where prayer is risky. |
| Country, revised the same day | **The maintainer chose pre-selection.** The form pre-selects the country Cloudflare reports for the visitor's connection; the author can change it or choose "Prefer not to say". The detected value is used only to fill the form and is stored only if the author submits it. | The maintainer wants the wall to look global. The builder recommended an opt-in suggestion instead and recorded the cost: most people leave a default alone, so most requests will carry a country the author did not actively choose, which matters where prayer is risky. **The privacy page (M7) must say that the country is suggested from the network address**, and the earlier promise that nothing but a daily hash is derived from it no longer holds as worded. |
| Country, revised again the same day | **The maintainer replaced the list with a tick box.** The form shows the country Cloudflare reports for the connection and an unticked "Hide my country" box. On posting, that country is stored unless the box is ticked. The author cannot choose a different country. | Building and sorting 246 country names in the reader's language was the heaviest part of the form, and the live worker was over the free plan's 10 ms processor limit for about one request in ten. The privacy consequence recorded above is unchanged: the country comes from the network address, and the privacy page (M7) must say so. |
| Private page transport | The page's script puts the token from after `#` into a form and posts it to `/{lang}/mine`; the result is rendered by the server. There is no `/api/mine`. | **Differs from the blueprint**, which names `POST /api/mine`. Same guarantee (the token travels only in a POST body and never in an address), far less script, and the page also works with JavaScript off by pasting the link. Awaiting the maintainer's confirmation at the M2 review. |
| Delete | "Delete now" shows a confirmation step, then deletes the row | A single tap must not be able to destroy a request; works with JavaScript off |
| Order of checks on a post | Bot check, then fixed text rules, then limits, then the duplicate check | A post refused for a fixable reason (a phone number, too long) does not use up the author's daily allowance |
| Same-origin check | `Sec-Fetch-Site: same-origin` first; a matching `Origin` only when that header is absent | Pages served with `Referrer-Policy: no-referrer` (planned for M7) send `Origin: null` on their own form posts |
| Hold reasons | `review_all`, `soft_limit`, `duplicate`, `bot_check_unavailable`, `bot_check_misconfigured` (our Turnstile secret is wrong; added after the first live test showed that case failing silently); the most specific one is recorded | Tells the moderator why a request is in the queue |
| Held requests | `expires_at` is 14 days after posting until a moderator publishes | Blueprint: an unreviewed held request is deleted after 14 days |
| "Written in" | The twelve proposed launch languages plus "Another language" (`und`) | The list of launch languages is still an open question; this is the blueprint's proposal |
| Posting when not configured | The form is replaced by "Posting is paused for now" until the Turnstile keys and the master secret exist | Fails closed: posting never runs without the bot check |
| Master secret | Generated once by the Deploy workflow; no person sees it | It cannot leak from a chat, a laptop or a password manager, and losing it is harmless |
| Device id | A random value in the browser's storage, sent with a post; only its daily hash keys a one-day counter. It is not stored with the request. | Per-device posting limit without identifying anyone |
| Remembering the link | The browser keeps up to 20 tokens and shows a "My request" link in the header | Blueprint: "the link is also remembered on that device" |
| Phone-number rule | Seven or more digits in any script, separated only by spaces, dashes or brackets. Dots are not separators. | Dates such as 12.11.2026 must not be refused |
| Not built in M2 | "Pray while you wait" on the confirmation page; the "Need to talk to someone now?" link; `requests_total` | They need the prayer button (M4), the support page (M5) and publishing (M3) |

### Assumptions verified for M2 (17 November 2026)

| Assumption | Result |
| --- | --- |
| Is the Workers rate-limiting binding a better fit than a table? | No. Its window can only be 10 or 60 seconds and it counts per Cloudflare location, so it cannot express hourly or daily limits. The `rate_limits` table is used. Source: Cloudflare Workers "Rate Limiting" binding docs. |
| Is Turnstile free at this volume, and what does it store? | Free on the free plan. By default the widget returns a token and sets no clearance cookie; a `cf_clearance` cookie is set only with the optional pre-clearance, which the runbook says to leave off. **Partly verified**: the cookie behaviour is from Cloudflare's docs, but what else the widget keeps in the browser needs a check with the browser's developer tools on the live form, and the privacy page (M7) must be written from that check. |
| Does the part of a link after `#` survive copying and sharing on iOS and Android? | **Not verified.** It is standard browser behaviour, but the blueprint asks for a device test. The maintainer should post once from a phone, share the link to themselves, and open it. |
| Is 10 ms of processor time enough once hashes are computed? | **Not reliably.** Live, over 24 hours with the country list in place: median 6.45 ms, 90th percentile 12.75 ms, 99th percentile 17.81 ms. The country list was removed in response; to be measured again. The site stays on the free plan until launch; the paid plan is decided at M7 from the new figures. |

## Proposed, awaiting the maintainer's decision

The accepted 2.2 changes conflict with four later passages. None affects M0. Each needs a yes or no
before the milestone named.

| # | Conflict | Proposal | Needed by |
| --- | --- | --- | --- |
| P1 | Changes 2 and 9 remove the red and black queue tiers, but the M3 acceptance criteria and one M7 load test still test "60 then 150 held items: cap, then `closed`" | Rewrite both to test `unattended` mode; keep `closed` only as a mode the maintainer sets by hand | M3 |
| P2 | The build prompt keeps the soft Turnstile challenge on prayers "off by default (or anomaly-only)", but change 9 removes the anomaly flag | Build it behind a configuration switch that is off, with no automatic trigger | M4 |
| P5 | The blueprint's API table has `POST /api/mine`; M2 posts the token to `/{lang}/mine` instead (see Milestone 2) | Keep the server-rendered form post | M2 review |
| P3 | Change 6 makes `/r/{id}` the address to share; the API table lists `/{lang}/r/{id}` | `/r/{id}` redirects to `/{lang}/r/{id}`, which stays the rendered page | M4 |
| P4 | The build prompt's summary of change 4 omits the cap on the eager set | Use the cap of 8 from the 2.2 text | M6 |
