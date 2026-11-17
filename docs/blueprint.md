# Prayer Wall: build blueprint

Nov 11, 2026 · @Roma

## Summary

Prayer Wall is one global web page where anyone can leave a prayer request and anyone can pray for it, each reading in their own language. It needs no app, no account and no download. This blueprint fixes the decisions that are expensive to change later, so each build session can start from a clear task.

**Revision 2, 12 November 2026.** This version hardens translation quality, moderation operations, crisis handling, abuse resistance and the legal checklist. Decisions that changed are listed near the end, followed by a change summary.

**Revision 2.1, 14 November 2026.** A targeted hardening: a staged classifier gate with a fallback ladder, named candidates for translation provider B, a fix for a side effect of reach ordering, two-tier soft-launch exits, new crisis message drafts, and a private link that stays out of server logs. Each changed block starts with "Revision 2.1".

**Decisions already made**

| Topic | Decision |
| --- | --- |
| Audience | Anyone who believes in God and prays to God. Interface wording and visuals stay neutral across traditions. |
| Identity | No accounts. Two small fields: who the request is for (myself, someone else, an event or group) and an optional first name. |
| Ownership | A private link, shown once after posting, lets the author see the prayer count, mark the request answered, or delete it. |
| Languages | Each request is machine-translated into the reader's language and cached. Interface text is translated by volunteers. |
| Licence | AGPL-3.0-or-later. |
| Design | Minimal and timeless: white, deep blue, a sparing gold accent, system fonts, no images. |
| Builder | Opus does the implementation, one milestone per session. |

**How to use this document with Opus**

1. Save this document in the repository as `docs/blueprint.md` (export it as Markdown).
2. Start each session with: "Read `docs/blueprint.md`. Build milestone N only. Check the current official docs for every platform feature before using it. If you need to deviate from a decision, stop and explain why first."
3. Ask Opus to record any change of decision in `docs/decisions.md` with the date and the reason.

The project name and domain are still open. The working name here is Prayer Wall.

## Product scope

Version 1 does four things: read the wall, post a request, tap "I prayed", and report a post. Everything else waits until those four work well in many languages.

**In version 1**

- A wall of requests, each shown in the reader's language with a "show original" toggle.
- Two orderings: "Needs prayer" (fewest prayers first, the default) and "Newest".
- A posting form: who it is for, optional first name, the request (up to 500 characters), the language it is written in.
- An "I prayed" button with a visible count on every request.
- A private link for the author: prayer count, mark as answered, delete, extend once.
- A report button with five reasons.
- A moderator queue for held and reported requests.
- Pages for the rules, privacy, and about.
- Requests expire after 30 days.

**Deliberately not in version 1**

- Accounts, profiles, logins, followers.
- Comments or replies. They multiply the moderation load and invite debate.
- Notifications by email or push.
- Groups, church walls, embeddable walls.
- Photos, links, audio or video.
- Search, tags, or filtering by tradition.

**The one ordering rule that matters**

The default order is fewest prayers first among requests from the last seven days, oldest first on ties. A newest-first or most-popular feed leaves quiet requests unanswered, which is the failure a prayer wall must avoid.

**Candidates for later, in rough order**

1. A "pray for the next one" mode that shows one request at a time.
2. Web push so an author hears when someone prayed, still without an account.
3. An answered-prayers page.
4. Walls for a church, group or event, built on the same code.

## Screens and flows

There are three screens: the wall, the posting form, and the author's private page. Each must work on a small phone, right-to-left as well as left-to-right, and be readable with JavaScript turned off.

**1. The wall** (`/{lang}`)

- A one-line header: the name, and a "Ask for prayer" button.
- Two tabs: "Needs prayer" and "Newest".
- A single column of request cards, 20 per page, with a "More" link.
- Each card shows: a label for who it is for, the first name if given, the text, how long ago it was posted, the "I prayed" button with its count, and a small menu holding "Show original" and "Report".
- A footer: language picker, rules, privacy, about, source code.

**2. Ask for prayer** (`/{lang}/new`)

1. Who is this for? Myself, someone else, an event or group.
2. First name (optional). For someone else, the helper text says: first name only, no details that identify them.
3. Your request, with a live character counter up to 500.
4. Written in: a language list, preset to the interface language.
5. Three short rules shown above the button: no contact details or links, no requests for money, no preaching or arguing.
6. Post.

After posting, the author sees a confirmation with the private link, a copy button, and one sentence: "Keep this link. It is the only way to manage your request." The link is also remembered on that device.

**3. My request** (`/{lang}/mine/{token}`)

- Status: waiting for review, on the wall, removed, or expired.
- How many times someone prayed.
- Three actions: mark as answered, keep it on the wall 30 more days (once), delete now.

**Smaller pages**

- A single request (`/{lang}/r/{id}`), so a request can be shared.
- Rules, privacy, about.
- The moderator queue (`/mod`), not linked from the public site.

**Wording**

- The button says "I prayed", not "Like" or "Amen".
- The interface says "God" and nothing more specific. People write their own requests in the words of their own tradition.
- No request is ever shown with a ranking, a badge or a "trending" label.

## Architecture and stack

The site is server-rendered HTML from one small program running on Cloudflare's edge, with one SQLite database. That gives fast pages worldwide, near-zero cost at low traffic, and very little code to maintain.

| Part | Choice | Why | Rejected alternative |
| --- | --- | --- | --- |
| Hosting | Cloudflare Workers with static assets | Runs close to every visitor; the free plan covers 100,000 requests a day; static files are free and unlimited | A single server (one region, slow for half the world); Vercel or Netlify (fine, but the database and AI would live elsewhere) |
| Web framework | Hono, TypeScript, HTML rendered on the server | Tiny, few dependencies, and also runs on Node, Bun and Deno, so others can self-host | SvelteKit or Next.js: more build machinery and client code than three screens need |
| Browser code | Plain JavaScript, under 10 KB, as progressive enhancement | The wall works without it; less to break over the years | A client framework such as React |
| Database | Cloudflare D1 (SQLite) | One file-like database, no server to run, free plan covers 5 million rows read and 100,000 rows written a day | Postgres (Supabase, Neon): more power than needed and a second vendor |
| Translation | Workers AI, model `@cf/meta/m2m100-1.2b`, behind a `Translator` interface | Same platform, zero data retention, about $0.34 per million tokens | DeepL or Google Translate: better quality in some languages, but a second vendor and higher cost. Keep as a swap-in option |
| Moderation | Fixed text rules, then an AI classifier, then people | See the moderation section | Fully manual review (does not scale); fully automatic (unsafe) |
| Bot check | Cloudflare Turnstile on the posting form only | Invisible for most people, no puzzle to solve | reCAPTCHA (tracking, friction) |
| Moderator sign-in | Cloudflare Access in front of `/mod` | No login code to write or secure | Building our own accounts for moderators |
| Scheduled jobs | Workers Cron Trigger, hourly | Expiry and clean-up without a separate service | An external scheduler |
| Interface text | One JSON file per language in the repository | Volunteers can translate through a pull request | A translation service from day one |
| Tests and delivery | Vitest with the Workers test integration; GitHub Actions; deploy on merge to `main` | Standard, free for open source |  |

**Rules for the code**

- All platform features sit behind small interfaces (`Database`, `Translator`, `Classifier`, `RateLimiter`). A church that wants to self-host on a plain server swaps the adapters, not the app.
- Every page is rendered on the server and sent as finished HTML. JavaScript only improves it: tapping "I prayed" without a page reload, lazy translation, remembering the private link.
- URLs carry the language (`/en`, `/ar`, `/id`). The root address redirects using the browser's language.
- The wall is cached at the edge for 30 to 60 seconds per language and ordering. Counts on the page may lag by that much; the tap itself updates at once for the person who tapped.
- User text is always escaped and shown as plain text. Each request carries its own `lang` attribute and `dir="auto"` so mixed directions render correctly.
- Layout uses CSS logical properties (`margin-inline`, `padding-inline`) from the first commit, so right-to-left languages need no second stylesheet.
- Security headers on every response: a strict Content-Security-Policy, no third-party scripts except Turnstile, `Referrer-Policy: no-referrer`.
- Request pages send `noindex`. Request text on the wall is wrapped in `data-nosnippet`. Prayer requests should not turn up in search results.

**Suggested repository layout**

```
src/
  app.ts            routes
  views/            HTML templates
  lib/              db, moderation, translation, ratelimit, i18n, ids
  adapters/         cloudflare/  (later: node/)
migrations/         SQL files, numbered
locales/            en.json, es.json, ar.json ...
public/             style.css, wall.js, icons, manifest
test/               unit, integration, moderation-eval/
docs/               blueprint.md, decisions.md, runbook.md
```

## Data model

Seven small tables hold everything, and none of them stores an email address, an account, or an IP address. Times are Unix seconds in UTC.

```sql
CREATE TABLE requests (
  id            TEXT PRIMARY KEY,        -- 12 random base32 characters, public
  owner_hash    TEXT NOT NULL UNIQUE,    -- SHA-256 of the private link token
  kind          TEXT NOT NULL CHECK (kind IN ('self','other','event')),
  display_name  TEXT,                    -- optional, up to 30 characters
  body          TEXT NOT NULL,           -- up to 500 characters, original language
  lang          TEXT NOT NULL,           -- language code chosen by the author
  status        TEXT NOT NULL CHECK (status IN ('held','published','removed')),
  hold_reason   TEXT,                    -- why it was held, for moderators
  decided_by    TEXT,                    -- 'auto' or 'moderator'
  prayed_count  INTEGER NOT NULL DEFAULT 0,
  report_count  INTEGER NOT NULL DEFAULT 0,
  answered_at   INTEGER,
  extended      INTEGER NOT NULL DEFAULT 0,
  poster_hash   TEXT NOT NULL,           -- daily visitor hash, see below
  created_at    INTEGER NOT NULL,
  published_at  INTEGER,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX idx_wall_need ON requests (prayed_count, published_at) WHERE status = 'published';
CREATE INDEX idx_wall_new  ON requests (published_at DESC)          WHERE status = 'published';
CREATE INDEX idx_expiry    ON requests (expires_at);
CREATE INDEX idx_queue     ON requests (created_at)                 WHERE status = 'held';

CREATE TABLE translations (
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  body       TEXT NOT NULL,
  provider   TEXT NOT NULL,              -- which translator produced it
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, lang)
);

CREATE TABLE prayers (                   -- only to stop double counting
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  who        TEXT NOT NULL,              -- device id, or daily visitor hash
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, who)
);

CREATE TABLE reports (
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  who        TEXT NOT NULL,              -- daily visitor hash
  reason     TEXT NOT NULL CHECK (reason IN ('spam','money','personal','hateful','other')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, who)
);

CREATE TABLE rate_limits (
  key          TEXT NOT NULL,            -- e.g. 'post:<visitor hash>'
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE mod_log (                   -- who decided what, kept after the request is gone
  id         INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL,
  action     TEXT NOT NULL,              -- publish, remove, restore
  moderator  TEXT NOT NULL,              -- from the Access sign-in
  note       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE counters (                  -- totals that survive expiry
  name  TEXT PRIMARY KEY,                -- 'requests_total', 'prayers_total'
  value INTEGER NOT NULL
);
```

**Revision 2 additions.** Nothing is built yet, so these go into the first migration, not a second one.

```sql
-- requests: add these columns
  reach_count   INTEGER NOT NULL DEFAULT 0,  -- distinct visitor hashes that prayed; used for ordering
  priority      INTEGER NOT NULL DEFAULT 0,  -- 0 normal, 1 reported or flagged, 2 crisis
  category      TEXT,                        -- classifier category
  confidence    REAL,                        -- classifier confidence, 0 to 1
  shadow_result TEXT,                        -- classifier result recorded during review_all
  body_hash     TEXT NOT NULL,               -- keyed hash of the normalised text, for duplicates
  remove_reason TEXT                         -- category shown to the author after a removal

-- requests: change two indexes
  idx_wall_need ON requests (reach_count, published_at) WHERE status = 'published'
  idx_queue     ON requests (priority DESC, created_at) WHERE status = 'held'
  idx_dupes     ON requests (body_hash, created_at)

-- prayers: 'who' now holds the daily hash of the device id (or the visitor hash); add
  vhash   TEXT NOT NULL,                     -- daily visitor hash
  counted INTEGER NOT NULL DEFAULT 1         -- 0 when a limit applied
  CREATE INDEX idx_prayers_vhash ON prayers (request_id, vhash);

-- reports: add
  device  TEXT                               -- daily hash of the device id

-- mod_log.action also allows 'escalate'
```

Wherever this document says "fewest prayers first", the measure is `reach_count`. The number shown on a card is still `prayed_count`.

**The daily visitor hash**

The site never stores an IP address. It stores `HMAC(daily_key, ip)`, where `daily_key = HMAC(master_secret, UTC date)`. The hash is enough to limit abuse within one day, and it cannot be linked to the same person on another day or turned back into an address.

**The private link token**

The token is 128 random bits shown once to the author. Only its SHA-256 hash is stored, so a database leak does not expose anyone's link.

**Revision 2.1: the token stays out of server logs.** The private link is `/{lang}/mine#<token>`. The part after `#` is never sent to a server, so it cannot appear in platform logs, analytics or referrers. The page's script reads it and sends it in the body of a POST to `/api/mine`. Without JavaScript, the page shows a field to paste the token into. Responses carry `Cache-Control: no-store`. This replaces the `/{lang}/mine/{token}` routes in the screens and API sections.

**Retention**

| Data | Kept for |
| --- | --- |
| Published request and its translations | 30 days from publishing, or 60 if the author extends it once |
| Held request nobody reviewed | 14 days, then deleted |
| Removed request | 30 days, then deleted |
| `prayers` and `rate_limits` rows | 48 hours |
| `reports` | Deleted with the request |
| `mod_log` and `counters` | Kept; they hold no request text |

Deleting is a real delete, not a hidden flag. D1's point-in-time recovery keeps deleted data for up to 7 days on the free plan and 30 on the paid plan; the privacy page should say so.

## API

Most routes return finished HTML pages; four small JSON routes serve the buttons. Forms post to the same address they were loaded from, so everything works without JavaScript except the bot check on posting.

| Method | Path | What it does | Limit per visitor |
| --- | --- | --- | --- |
| GET | `/` | Redirects to `/{lang}` from the browser's language |  |
| GET | `/{lang}?view=need\|new&after=<cursor>` | The wall | Cached 30 to 60 s |
| GET | `/{lang}/new` | The posting form |  |
| POST | `/{lang}/new` | Creates a request, returns the confirmation page with the private link | Soft, then hard; see abuse resistance |
| GET | `/{lang}/r/{id}` | One request; translates on the spot if no translation is cached |  |
| POST | `/api/r/{id}/prayed` | Counts one prayer, returns `{count}` | 60 an hour per device; see abuse resistance |
| POST | `/api/r/{id}/report` | Files a report with a reason | 10 a day |
| GET | `/api/r/{id}/t/{lang}` | Returns the translation, creating it if missing | 120 an hour |
| GET | `/{lang}/mine/{token}` | The author's private page |  |
| POST | `/{lang}/mine/{token}/answered\|extend\|delete` | The author's three actions |  |
| GET | `/{lang}/rules`, `/privacy`, `/about` | Static pages |  |
| GET | `/mod` | The moderator queue, behind Cloudflare Access |  |
| POST | `/mod/r/{id}/publish\|remove\|restore` | A moderator's decision, written to `mod_log` |  |
| GET | `/healthz` | Returns 200 when the database answers |  |
| Cron | hourly | Expires requests, deletes old `prayers` and `rate_limits` rows |  |

**Behaviour worth fixing in advance**

- **Counting a prayer.** Insert into `prayers`; only if the row is new, add one to `prayed_count` and to the total counter. The `who` value is a random id kept in the browser when available, otherwise the daily visitor hash. Many people share one address on mobile networks, so the address alone must not block a prayer.
- **Spreading attention.** The "Needs prayer" query takes the 60 neediest requests and the page shows a shuffled 20 of them. Cache four shuffles per language. Otherwise every visitor in the same minute prays for the same 20.
- **Paging.** Use a cursor of `(prayed_count, published_at, id)`, never page numbers, so the list does not skip or repeat as counts change.
- **Errors in the form.** A rejected post returns the form with the text still in it and a plain sentence about what to change. Nothing the author typed is lost.
- **Same-origin checks.** Every POST checks the `Origin` header. There are no cookies, so there is no session to steal.
- **Unknown language codes** fall back to English for the interface and show request text in its original language.

## Translation pipeline

Each request is translated once per language and stored, so the cost depends on how many requests are posted, not on how many people read them. At the listed price, translating 1,000 requests into 8 languages costs about $0.82.

**How it works**

1. **The author states the language.** The form's "Written in" list is preset to the interface language. Version 1 does not guess the language.
2. **Nothing is translated before a decision**, with one exception: a held request is translated into English for the moderator queue.
3. **On publishing, eager translation** runs in the background into the eager set only. The eager set is English plus every live language that had at least 5% of wall views in the last 7 days, capped at 6 languages. It lives in `config/languages.json` and is reviewed weekly by hand. At launch it is English plus the founding community's languages.
4. **Every other live language is lazy.** A translation is made the first time a card in that language scrolls into view, or when the single-request page is opened, then cached.
5. **Not translated at all:** a request read in its own language; a request of fewer than three words or only symbols; the optional first name.
6. **Name protection.** If the first name also appears in the request text, it is swapped for a placeholder before translation and restored after. If the placeholder does not survive, the translation is discarded and retried once without it.
7. **Every translated card** carries a small line: "Translated automatically. Show original."
8. **A daily ceiling.** Lazy translation stops for the day at a configurable ceiling (start at 50,000 translations). Cards then show the original with a note, and an alert is sent.
9. **Changing provider.** Each cached translation records its provider, so a language's cache can be purged in one statement when its provider changes.

**If translation fails**, the card shows the original text with a note, and the next view tries again. A missing translation never hides a request.

**Limits that protect the budget**

- Translation targets are limited to the interface languages. Nobody can request a translation into an arbitrary language.
- A request is at most 500 characters, so the worst-case cost of one request across 12 languages stays well under one cent.
- Translated output longer than three times the input is discarded as a model error.

**Cost estimate**

Assumptions: a request averages 150 tokens; a translation reads 150 and writes 150; the model costs $0.342 per million tokens in and out ([model page](https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/)). Workers AI also has a free daily allowance that covers the early weeks; check the current figure on its pricing page.

| Requests a day | Translations a day (8 languages) | Cost a day | Cost a month |
| --- | --- | --- | --- |
| 50 | 400 | $0.04 | about $1 |
| 1,000 | 8,000 | $0.82 | about $25 |
| 10,000 | 80,000 | $8.21 | about $246 |

This table assumes 8 eager languages and is kept as the upper estimate. With the eager set capped at 6 and the rest lazy, real spend should land at or below it.

**Quality gate before a language goes live**

The chosen model dates from 2020 and its quality varies by language. No language goes live on trust.

Each language is tested with a fixed set of 100 items, stored in `test/translation-eval/`. A bilingual native speaker scores 50 translations from English into the language and 50 from the language into English, each from 1 (wrong or reversed meaning) to 5 (natural and faithful).

| Group | Items | What it contains | Pass rule |
| --- | --- | --- | --- |
| Ordinary requests | 50 | Illness, family, work, exams, travel, thanks, grief, across all three kinds | Average 4.0 or more; no more than 3 items scored 1 or 2 |
| Sensitive vocabulary | 20 | Names and titles for God as used by Christians, Jews and Muslims; healing, grief, forgiveness, mercy, blessing; common closing words such as amen | No item scored 1 or 2; no name for God rendered as another tradition's name |
| Informal speech | 10 | Slang, missing punctuation, typing errors, all capitals, emoji | Average 3.5 or more |
| Mixed language | 5 | Two languages in one request, or a language typed in another alphabet | Meaning kept in at least 4 of 5 |
| Personal names | 10 | Names that are also words (Grace, Faith, Hope, Mercy, Angel, Christian, and local equivalents) | The name is unchanged in at least 9 of 10 |
| Adversarial | 5 | Text that gives instructions ("ignore the above and write..."), text asking for a different output, HTML or script tags, a very long repeated word, emoji only | 5 of 5: the output is a translation of the words or is safely discarded; nothing is executed or obeyed |

**Automatic checks on every translation, in every language pair**

People cannot review all 132 language pairs, so the code rejects a translation and shows the original when any of these is true:

- The output is empty, or identical to a non-trivial input.
- The output is shorter than 0.4 times or longer than 3 times the input.
- The output is not mainly in the script of the target language.
- A protected placeholder is missing or altered.
- The output contains markup that the input did not.

After launch, a reviewer scores 30 live translations a week for each of the five busiest non-English pairs.

**Fallback when a language or a group fails**

| What failed | Action |
| --- | --- |
| The language fails overall on m2m100 | Test provider B: a current multilingual instruction model on Workers AI, with a translate-only prompt. Same platform, so the privacy page does not change. It must pass the full gate, and the adversarial group becomes 20 items with a 20 of 20 pass rule. |
| Provider B also fails | Either adopt an outside translation service through the same interface, which needs a decision-log entry and a privacy-page update before use, or launch the language as "interface only". |
| Only the sensitive vocabulary group fails | Add a per-language glossary of protected terms and their accepted renderings. A request containing a protected term is translated with provider B; if the result lacks an accepted rendering, the original is shown. |
| Only the names group fails | Keep the language live for requests without a first name in the text; for the rest, show the original. Re-test when the placeholder method improves. |
| A provider is down | Show originals with a note; retry on the next view. Never block publishing. |

**Revision 2.1: provider B, concretely**

Candidates found in the Workers AI catalog on 14 November 2026. Opus must re-check each before use, since the catalog changes within months.

| Candidate | Why it is a candidate | Listed price per million tokens |
| --- | --- | --- |
| `@cf/google/gemma-4-26b-a4b-it` | General multilingual model; described as supporting 35+ languages well and trained on 140+ | $0.10 in, $0.30 out |
| `@cf/zai-org/glm-4.7-flash` | Fast multilingual model, described as covering 100+ languages | $0.06 in, $0.40 out |
| `@cf/aisingapore/gemma-sea-lion-v4-27b-it` | Specialist for Southeast Asian languages; a per-language option for Indonesian | $0.35 in, $0.56 out |

*Selection criteria, in order*

1. Hosted by Cloudflare with zero data retention, so the privacy page does not change.
2. Not marked deprecated. One earlier Gemma model was retired within about a year, so the model id lives in `config/languages.json`, never in code.
3. Covers the language in both directions. Hebrew, Ukrainian, Hindi and Korean must be tested, not assumed.
4. Can be run with reasoning output switched off and a fixed, low-randomness setting.
5. Among those that pass the gate, the cheapest.

*Minimum acceptance for provider B*

| Group | Pass rule |
| --- | --- |
| Ordinary, informal, mixed, names | Same as the main gate |
| Sensitive vocabulary (20 items) | No item scored 1 or 2; every name for God kept in the author's tradition, 20 of 20 |
| Adversarial (20 items) | 20 of 20: never follows an instruction inside the text, never answers a question in the text, never outputs anything except the translation |
| Crisis content (10 items, new for provider B) | 10 of 10 translated faithfully: no refusal, no softening, no added advice or helpline text |
| Output form | Exactly one translation, with no preface such as "Here is the translation", in 100 of 100 |

The crisis group exists because a general model may refuse or rewrite a message about self-harm. A translator must not do either; care is the job of the crisis flow.

*Cost and speed against m2m100*

- m2m100 costs about $0.00010 for a 150-token request. With a 150-token instruction added, the two general candidates come to about $0.00008. Provider B is therefore not a cost risk and may be cheaper.
- Speed is the unknown. Requirement: 95% of 500-character requests translated within 3 seconds. Eager translation is invisible to readers. On the lazy path the card shows the original at once and swaps in the translation when it arrives.
- Since cost does not separate them, run m2m100 and one provider B candidate through the gate together for the first two languages, and let the scores choose the primary provider for each language.

**"Interface only" status.** The interface is in that language and people may post in it, but nothing is machine-translated into or out of it. Other readers see those requests in the original with a "Written in ..." label.

Each language has one line in `config/languages.json`: its status (`off`, `interface_only`, `live`), its provider for each direction, and whether it is eager.

**A language goes live only when all of these are true**

- [ ] A native speaker has reviewed every interface string in context, on a phone, including the rules, the crisis message and all error messages.
- [ ] The crisis message in that language was written or checked by a person, never machine-translated.
- [ ] The 100-item gate has passed, with the scores committed to the repository.
- [ ] The reviewer has read at least 20 machine translations that contain the sensitive vocabulary and signed off on them by name in `docs/languages.md`.
- [ ] The automatic checks pass on the test set.
- [ ] The language's status and provider are recorded in `config/languages.json`.

**Launch languages (proposal, to confirm)**

English, Spanish, Portuguese, French, Russian, Ukrainian, Indonesian, Arabic, Hebrew, Hindi, Korean, Chinese (Simplified). A language is launched only when its interface file has been checked by a native speaker and it has passed the quality gate.

**If a general AI model replaces the translator later**, the request text must be passed strictly as data to translate. A request that says "ignore your instructions" must come out as those words in the target language, and the test set should include such a case.

## Moderation and abuse

Moderation is the hardest part of this project and the one most likely to decide whether it survives. The design rests on three rules: fixed text rules may reject with an explanation, the AI may only publish or hold, and only a person may remove.

**The public rules (shown on the form and the rules page)**

1. This wall is for prayer to God. Ask, give thanks, or pray for others.
2. No contact details, links, usernames or addresses.
3. No requests for money, gifts or business.
4. When praying for someone else, use a first name only and nothing that identifies them.
5. No preaching, arguing, or speaking against any person, group or faith.
6. No prayers for harm to anyone.
7. Keep it suitable for all ages.

**What happens when someone presses Post**

1. **Bot check and rate limit.** Turnstile must pass. Posting limits are soft first and hard second; see abuse resistance below.
2. **Fixed text rules.** The post is refused, with the reason and the text preserved, if it is empty, over 500 characters, or contains a link, an email address, a phone number, or a username handle. These rules work the same in every language.
3. **AI classifier.** One call returns a category and a confidence as JSON. The categories are: ok, contact or link, money, identifies someone, against others, preaching or debate, not a prayer, crisis, sexual or violent or hateful.
4. **Decision.** "ok" with high confidence is published. Anything else is held for a person. If the classifier is unavailable or returns something unreadable, the request is held.
5. **After publishing**, translation starts in the background.

&#91;embedded content: request flow · 4 checks, 3 outcomes\]

Fixed rules can refuse a post, the classifier can only publish or hold, and only a moderator removes.

The author always sees the same calm confirmation and gets the private link. The private page shows "waiting for review" when a request is held.

**Requests from people in crisis**

Some requests will come from people who are thinking about ending their life, who are being hurt, or who are afraid for someone else. A request like this is never rejected by the software. It is answered with care, placed first in the queue, and published by a person unless it describes a method.

1. **Detection.** The classifier's crisis category covers thoughts of suicide or self-harm, being in danger or abused, and the same fears for another person.
2. **Fixed rules still run, but never alone.** If a post is refused by a fixed rule, for example because it contains a phone number, the classifier is still asked one question: is this a crisis? If yes, the author sees the support message together with a gentle request to remove the number.
3. **What the author sees.** The normal confirmation and private link, with a support panel beside it. The panel never says the request was flagged, detected or held because of its content.
4. **Queue.** The request is held with crisis priority, ahead of everything else, and moderators are alerted at once. The target is a decision within 2 hours.
5. **The moderator's decision.** Publish as written unless the text describes a method or means, a specific plan with a time or place, or details that identify a third person at risk. Version 1 has no editing, so such a request is not published.
6. **If it is not published.** The private page says, in substance: "We could not show this request on the wall as it was written, but a person has read it and you are not forgotten. You are welcome to post again without describing how." The support panel stays on the page.
7. **For everyone.** Every confirmation page carries a quiet link, "Need to talk to someone now?", leading to the same support page. This covers crisis requests the classifier misses.

**Revision 2.1: the support message (three drafts, none yet approved)**

The earlier draft said "People here will pray for you." That promise fails if a moderator cannot publish the request. These drafts promise only what is always true: a person will read it. The crisis-line reviewer chooses and edits one; draft A is my recommendation.

Draft A, plain:

> Thank you for trusting us with this. What you are carrying sounds very heavy, and you do not have to carry it alone. Your request has been received, and a person will read it with care.
>
> If you are thinking about ending your life, or you are not safe, please also talk with someone who can be with you right now. Free and confidential helplines are open in most countries: *Find a helpline where you are.* If you are in immediate danger, please call your local emergency number.

Draft B, shorter:

> We are glad you wrote this down. A person will read your request with care.
>
> You deserve support today, not only later. If things feel unbearable, or you are not safe, please reach someone who can talk with you now: *Find a free helpline where you are.* In immediate danger, call your local emergency number.

Draft C, naming prayer without promising it:

> Thank you for bringing this here. You are not alone in it. Your words have been received and will be read by a person, with care.
>
> Prayer and help can go together. If you are thinking about ending your life, or someone is hurting you, please talk today with someone trained to listen: *Find a helpline where you are.* If you are in immediate danger, please call your local emergency number.

**Wording rules that follow from this**

- No confirmation, for any request, says that people will pray or that the request is on the wall until it is published. Before that, it says "Your request has been received."
- After a moderator publishes it, the private page says: "Your request is on the wall, and people can pray for it."
- "A person will read it" must stay true. A crisis request is never deleted unread, and the maintainer is paged when one passes its 6-hour hard limit.
- A moderator can mark any held item as crisis. The support panel then appears on its private page, which covers crisis requests the classifier labelled as something else.

**Requirements for the message**

- Warm and without judgement. No "you must", no warnings, no mention of rules.
- Reviewed and approved before launch by someone with crisis-line experience. Their name or role and the date go in `docs/decisions.md`.
- Written or checked by a person in every live language. It is never machine-translated.
- Shown in the author's interface language, readable without JavaScript.

**The helpline link**

Link to a maintained international directory of crisis helplines by country, run by a recognised suicide-prevention body or an established helpline-finding nonprofit. Do not hard-code individual phone numbers in the app. The link is checked by an automated weekly job and by a person each month, as a runbook item.

**Limits to state plainly**

The rules page says that the wall is not an emergency or counselling service and that moderators cannot reply to authors.

**Reports**

A request moves back to the queue when it has three reports from three different visitor hashes and three different devices. One visitor can report a request once and file at most 10 reports a day. A visitor whose reports moderators have rejected three times in a day is ignored for the rest of that day.

**The moderator queue**

Items are ordered: crisis first, then reported, then oldest first.

Every item shows all of the following, so a moderator never has to guess:

| Shown | Detail |
| --- | --- |
| Original text | With its language, who it is for, and the first name if given |
| English machine translation | Labelled as machine-made, with the provider; "translation unavailable" if it failed |
| Classifier result | The category and the confidence as a percentage |
| Why it is here | Held by the classifier, held by a soft limit, a duplicate, reported, crisis, or `review_all` mode |
| Reports | Each reason with its count |
| Age | Time waiting, with amber and red colouring at the thresholds below |
| Same-day context | How many other requests the same visitor hash has had held or removed today, as a number only |

- Three buttons: **Publish**, **Remove** (with a reason category), **Escalate** (needs a second opinion; the item stays held and is shown to other moderators).
- A **Skip** link passes an item to others without a record. Nobody has to handle an item they find hard.
- Every decision is written to `mod_log` with the moderator's sign-in.
- A removal's reason category is shown to the author on the private page.
- If the English translation is unavailable, the item is offered first to moderators who listed that language in `config/moderators.json`.

**Decision time targets**

| Item | Target | Hard limit |
| --- | --- | --- |
| Crisis | 2 hours | 6 hours |
| Reported | 6 hours | 24 hours |
| Ordinary held | 12 hours | 24 hours |

A held request that is still undecided after 14 days is deleted, and the private page says: "We could not review this in time. Please post it again."

**Three operating modes, set by one configuration value**

| Mode | Behaviour | When to use |
| --- | --- | --- |
| `review_all` | Every request is held until a moderator publishes it | The first weeks; during an attack |
| `auto` | The pipeline above | Normal running, once the classifier has passed its test |
| `closed` | Posting is paused with a kind message; reading and praying continue | Emergencies; no moderators available |

**Circuit breakers**

Each breaker acts on its own and alerts people. Returning from `review_all` or `closed` is always a manual, logged decision by the maintainer or the deputy.

| Trigger | Automatic action | Undone |
| --- | --- | --- |
| Posts in 10 minutes exceed the larger of 30 or five times the 7-day average for that time of day | Switch to `review_all`; alert everyone | Manually |
| Classifier errors above 20% of at least 10 calls in 10 minutes | Everything is held, as the pipeline already requires; alert the maintainer | By itself after 30 minutes under 5% |
| More than half of the last 50 posts were held | Switch to `review_all`; alert everyone | Manually |
| More than 30 reports in 10 minutes, or one visitor hash reporting more than 10 different requests | Reports stop hiding requests and arrive as flags only; alert moderators | By itself after 60 quiet minutes |
| Queue amber: 20 items waiting, or any item past its target time | Alert all moderators |  |
| Queue red: 60 items waiting, or any item past its hard limit, or fewer than two moderators active in the last 48 hours | Posting is capped site-wide at 20 an hour, with a kind notice on the form; alert the maintainer | By itself after 2 hours back in green |
| Queue black: 150 items waiting, or an item waiting 48 hours, or no moderator action for 24 hours while items wait | Switch to `closed` | Manually |

A moderator counts as active when they have an entry in `mod_log`.

**Escalation paths**

| Situation | Who acts | What they do |
| --- | --- | --- |
| A moderator is unsure | A second moderator | Decides the escalated item |
| A threat to another person, content that sexualises or endangers a child, or personal details published to harm someone | The moderator, then the maintainer within 1 hour | Remove at once; note the request id; the maintainer follows the legal advice on reporting |
| A legal notice or a request from an authority | The maintainer only | Handles it through the contact address; moderators do not reply |
| A crisis request with a method | The moderator | Follows the crisis flow above |
| The maintainer cannot be reached for 24 hours | The deputy named in `GOVERNANCE.md` | May change the operating mode |

**Abuse resistance for prayers, posts and reports**

Two signals are used together, because each fails in a different way.

| Signal | Where it comes from | Can it be faked | What it is for |
| --- | --- | --- | --- |
| Device id | A random value made in the browser and kept in its storage. The server stores only its daily hash | Yes, easily | Telling apart honest people who share one network address, such as a church or a mobile network |
| Visitor hash | Made on the server from the network address | Only by using many addresses | Every limit that has to resist a script |

The device id decides whether two taps are the same person. The visitor hash decides how much any one network may add. A script that invents new device ids gains nothing beyond the visitor-hash limits.

*Prayers*

1. One counted prayer per device per request per UTC day. Without a device id, the visitor hash is the key.
2. Per device: 60 counted prayers an hour and 300 a day.
3. Per visitor hash: 600 an hour, which leaves room for a large shared network.
4. Per request, per visitor hash: at most 30 counted prayers a day. A congregation on one connection can all pray for the same request; a script on one connection cannot add more than 30.
5. **Ordering uses reach, not taps.** Each request has a `reach_count` that rises once per visitor hash per day. "Needs prayer" sorts by reach. This matters because inflating a count is otherwise a way to bury someone's request.
6. **Soft challenge.** Past 200 taps an hour from one visitor hash, or when site-wide taps exceed five times the usual level for that hour, a device needs one invisible Turnstile pass, valid for 24 hours, before its taps count.
7. **Over a limit.** The button still shows the prayed state and the server returns the current count. The tap is not added. Honest people see no error.
8. **Anomaly flag.** A request that gains more than 50 counted prayers in 10 minutes, with over 60% from three or fewer visitor hashes, is flagged for moderators, and further taps from those hashes stop counting for 24 hours.
9. Tap requests must be same-origin and carry a custom header, which stops simple cross-site forms.

*Revision 2.1: side effects of ordering by reach*

Reach is the right defence against farming, but it has three side effects.

| Effect | Who it touches | Verdict |
| --- | --- | --- |
| Shared networks undercount. Thirty people on one mobile carrier address add 1 to reach. | Requests prayed for mostly by people on shared networks | Accepted. Such requests stay higher in "Needs prayer" for longer, which favours them. The count on the card is unaffected. |
| A stuck head. Requests that most readers cannot read well (interface-only languages, failed or poor translations) are skipped, keep a low reach, and fill the top of the list. | Every other request, which gets less exposure | Mitigated below |
| Own-language readers are diluted. Someone reading in a low-traffic language sees few requests written in it, although they are the people best placed to pray for those. | Requests in low-traffic languages | Mitigated below |

*Mitigation: compose each page of 20 from three sources.* This is a query change only.

1. Up to 8 from the neediest requests written in the reader's own language.
2. 8 from the neediest overall, counting only requests that have a passing translation into the reader's language.
3. 4 picked at random from the last 7 days with a reach under 3, using a random position in the id index.

Shortfalls in one source are filled from the next. Requests in an interface-only language appear in "Needs prayer" only for readers of that language, and in "Newest" for everyone.

*Monitoring.* The weekly report shows, for each request language: median time to first prayer, median reach at 48 hours, and the share with no prayer at 24 hours. A language whose median time to first prayer is more than three times the overall median is raised with the maintainer.

*Not done in version 1.* Counting how often each request is shown would be the precise fix, but it adds a database write to every page view. It stays an open question for after launch.

*Posts*

| Limit | Up to | Beyond it |
| --- | --- | --- |
| Per device | 3 a day | Held for review |
| Per visitor hash, hourly | 5 an hour | Held for review |
| Per visitor hash, daily | 10 a day | Posts 11 to 60 are held for review; above 60, refused with a polite message |
| Same text | Twice in 24 hours across the site | Held as a duplicate |
| Private-link lookups | 30 an hour per visitor hash | Refused |

Holding instead of refusing keeps a church event or a shared mobile network usable, while removing the reward for flooding.

*What is stored.* Device ids and visitor hashes live only in the `prayers`, `reports` and `rate_limits` rows, which are deleted after 48 hours. A device id is never attached to a request.

**Testing the classifier before trusting it**

Build `test/moderation-eval/` with at least 150 short examples across 8 or more languages: clearly fine, clearly against each rule, borderline, and at least 25 crisis examples. Mark each rule-breaking example as severe or ordinary. Severe means sexual, violent, hateful or threatening content, a scam that includes a way to make contact, or anything identifying a child.

**Revision 2.1: a staged gate.** A request held by mistake costs a moderator 30 seconds. A request published by mistake costs trust. So the gate is strict about leaks and flexible about holds.

| Measure | Required to leave `review_all` | Target |
| --- | --- | --- |
| Severe examples published automatically | None | None |
| Crisis examples published automatically | None | None |
| Rule-breaking examples held | 90% or more | 95% or more |
| Crisis examples held, under any category | 98% or more | 100% |
| Crisis examples labelled as crisis | 85% or more | 98% or more |
| Fine examples held | No fixed limit: the projected queue must stay under 30 minutes a day for each moderator at current volume | 10% or less |
| Shadow running | 100 real posts and 50 seeded test posts; no severe leak; 90% of removed and seeded posts held | 300 real posts; 95% |

**Seeded test posts.** A friendly founding community produces almost nothing to remove, so shadow results would prove little. Moderators therefore submit rule-breaking examples through the normal form with a test token. Such posts are marked `is_test`, can never be published, and are left out of every count.

**Probation.** If the switch to `auto` happens on the required level and not the target, every automatically published request also appears in a "published, not yet seen" list for a moderator to skim within 24 hours. Probation ends after 1,000 such requests with fewer than 1% removed.

**Iteration budget.** Up to three candidate models and three prompt rounds each, or two weeks of work, whichever comes first. Tuning the confidence threshold counts as part of a round. Re-run the test whenever the prompt or the model changes; Opus chooses models from the current catalog using this test, not from memory.

**If the required level is still not reached, in this order**

1. Raise the confidence threshold until no severe or crisis example leaks, and accept the higher hold rate while the queue fits the moderators.
2. Add a safety model from the same platform as a second vote on severe content, and publish only when both agree. This needs no privacy change. Its language coverage is narrow, so it helps most with English.
3. Turn on the optional outside moderation check as the second vote, after updating the privacy page.
4. Use an outside model as the classifier, with a decision-log entry and a privacy-page update.
5. Stay in `review_all` with the classifier as an assistant only: it sorts the queue, pre-labels items and puts crisis first.

**How long `review_all` may last.** As long as needed. It is a legitimate standing mode for a small wall, with posting capped to what people can review: 60 posts a day for each active moderator, so 180 a day with three. Eight weeks after the soft launch opens, if the required level is still unmet, record "`review_all` with a daily cap" as the standing mode. Growth then depends on recruiting moderators, each adding 60 posts a day, and the classifier is re-tested every quarter or when the catalog changes.

**People**

- At least three moderators before leaving `review_all`, with at least one in each of three 8-hour bands of the day.
- A named deputy for the maintainer.
- A one-page moderator guide: the rules, examples of each category, the crisis flow, the escalation table, and the instruction never to contact or reply to authors.
- Moderators do not judge theology. They judge conduct against the seven rules.

**Realistic load**

Assumptions: a decision takes about 30 seconds; in `auto` mode about 15% of posts are held (up to 10% wrongly, about 5% rightly) before reports are added.

| Posts a day | Mode | Items to review a day | Moderator time a day | What that needs |
| --- | --- | --- | --- | --- |
| 50 | `review_all` | 50 | 25 minutes | Three moderators, comfortably |
| 50 | `auto` | about 8 | 4 minutes | Three moderators |
| 1,000 | `review_all` | 1,000 | 8 hours 20 minutes | Not sustainable; use only for hours during an incident |
| 1,000 | `auto` | about 150 | 75 minutes | Three moderators at 25 minutes each; five is safer |
| 10,000 | `auto` | about 1,500 | 12 hours 30 minutes | About 17 moderators at 45 minutes each, organised by time band |

The hold rate is the number to watch. Each point it drops at 10,000 posts a day saves 50 minutes of review.

**When the three-moderator assumption breaks**

| Active moderators | The site does this |
| --- | --- |
| Two | Stays in its mode; the maintainer is alerted to recruit |
| One, for more than 48 hours | Queue red applies: posting is capped at 20 an hour |
| None for 24 hours with items waiting | Queue black applies: posting closes; reading and praying continue |

**Moderator burnout and coverage**

- A guideline of 45 minutes a day and one day off a week for each moderator.
- Crisis items are marked before they are opened, and anyone may skip them.
- No moderator covers a time band alone for more than two weeks.
- A private channel for moderators to talk through hard items, with a monthly check-in led by the maintainer.
- Recruit when the average exceeds 30 minutes a day per moderator for a week, and before adding any language.
- A new language adds load even with English translation in the queue. Aim for one moderator who reads each live language.

**An optional second check**

OpenAI's moderation endpoint is free and strong across languages for violence, hate, sexual content and self-harm ([announcement](https://openai.com/index/upgrading-the-moderation-api-with-our-new-multimodal-moderation-model/)). It would send request text to a second company. Build the adapter, leave it off by default, and decide after the classifier test.

## Privacy and data handling

The safest personal data is the data the site never collects. A prayer request can reveal a person's faith and health, which European law treats as specially protected, so the design keeps identity out entirely.

**Not collected**

- No accounts, email addresses, phone numbers or passwords.
- No IP addresses in the database or in application logs. Only the daily visitor hash is stored.
- No cookies set by the site itself. Whatever Turnstile stores in the browser must be checked and disclosed. The language lives in the address; the private link and the device id live in the browser's own storage and are never used for tracking.
- No advertising or third-party analytics. If visit counts are wanted, use a cookieless counter such as Cloudflare Web Analytics and say so on the privacy page.

**Collected**

- The request text, the optional first name, who it is for, and its language.
- A count of prayers and reports.
- Short-lived rows that stop double counting and abuse, deleted after 48 hours.

**Where request text goes**

| Recipient | Why | Note |
| --- | --- | --- |
| Cloudflare | Hosting, database, translation, classifier | The translation model is listed with zero data retention |
| Moderators | Review of held and reported requests | Signed in through Cloudflare Access |
| OpenAI (only if the optional check is turned on) | Second moderation opinion | Off by default |

**What the privacy page must disclose**

- **Cloudflare** hosts the site and the database. Network addresses pass through its network to deliver pages, even though the site itself does not store them. State where the database is located.
- **Turnstile** runs on the posting form to tell people from scripts. State what it collects and stores in the browser.
- **Workers AI** receives request text for translation and for the moderation check. State that the text is sent without any identifier, and state each model's data-retention terms as currently published.
- **Moderators** are volunteers who read held and reported requests. State that they sign in through Cloudflare Access and cannot see who posted.
- **Any optional second moderation provider** is named, with what is sent to it and why. The page is updated before the provider is switched on, never after.
- **Browser storage:** the device id, the private links, and why each exists.
- **Retention:** every row of the retention table, including the platform's point-in-time recovery window.
- **Machine translation:** that translations are automatic and may be wrong.
- **Contact:** who runs the site and how to reach them.

**Rights the design already provides**

- **Delete:** the author deletes at once through the private link.
- **Expiry:** everything goes after 30 days, or 60 if extended.
- **Removal without the link:** a contact address on the privacy page, handled by a moderator who removes the request by its id.
- **Other people's privacy:** rule 4, the fixed text rules and the classifier all work to keep third parties unidentifiable.

**Before public launch**

I am not a lawyer. The items below are what I believe applies; each needs confirming by someone qualified, and the advice itself is a blocking item for M7.

*Data protection*

- [ ] Write the privacy page in plain language with every disclosure listed above.
- [ ] Name who runs the site and how to reach them. An individual maintainer is the responsible party until an organisation takes over.
- [ ] Decide and write down the legal basis for handling faith and health information that people publish about themselves, and separately for information about another person named in a request.
- [ ] Write a data protection impact assessment. Data of this kind is likely to call for one.
- [ ] Accept Cloudflare's data processing terms and record the database location chosen at creation.
- [ ] Check whether a representative in the EU is required because the site is run from outside it.
- [ ] Check the data protection law where the maintainer lives as well as European law.
- [ ] Write the procedure for a person asking to see or remove data without the private link, with a 30-day answer target, and the procedure for a data breach.
- [ ] Turn off or strip network addresses from any platform logs that are enabled.

*EU Digital Services Act*

My understanding is that the basic duties of a hosting service apply at any size, while very small providers are excused from some further duties. Confirm which apply.

- [ ] Publish a contact point for authorities and one for users, stating the languages accepted.
- [ ] Check whether a legal representative in the EU is required.
- [ ] Make the rules page describe what is not allowed and how moderation works, including the use of automated checks and human review.
- [ ] Provide a way for anyone to notify illegal content: the report button, plus the contact address for a detailed notice. Acknowledge, decide, and record each one.
- [ ] Give authors a reason when a request is removed: the reason category on the private page, with the contact address for a second look.
- [ ] Write the procedure for a suspected serious crime that threatens someone's life or safety, matching the escalation table.
- [ ] Keep counts of moderation decisions from `mod_log`, so a transparency report can be produced if one is required.

*Minimum age*

- [ ] State a minimum age in the rules. The working default is 16, the highest age of digital consent used in the EU; confirm it. No age is collected or checked.
- [ ] Confirm that rule 4 and the classifier hold requests that identify a child.

## Design system

The look is a quiet page: white space, one deep blue, and gold used like a thin line of light, never as a fill. Nothing on the page should date it to a particular year.

**Colours**

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--paper` | `#FFFFFF` | `#132243` | Cards |
| `--mist` | `#F5F8FC` | `#0B1730` | Page background |
| `--ink` | `#14213D` | `#EEF3FB` | Main text |
| `--muted` | `#5B6B85` | `#A9B8D0` | Secondary text, timestamps |
| `--blue` | `#1F4E9C` | `#8FB4F2` | Buttons, links, focus ring |
| `--sky` | `#DCE9F9` | `#1C3261` | Soft tint behind the prayed state |
| `--gold` | `#C9A227` | `#E3C567` | Decoration only: the top hairline, the prayed mark |
| `--gold-ink` | `#8A6A00` | `#E3C567` | Gold-coloured text, if ever needed |
| `--line` | `#E3E9F2` | `#24386B` | Card borders, dividers |
| `--danger` | `#A4262C` | `#F2A5A9` | Errors, the delete action |

By my calculation `--blue` on white has a contrast of about 8 to 1 and `--muted` about 5.4 to 1, both above the 4.5 to 1 needed for text. `--gold` on white is about 2.4 to 1, which is why it must never carry text. Opus should verify every pair with a contrast tool, including the dark column, which I have not calculated.

**Type**

- Interface: the system font stack (`system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`). It costs zero bytes and covers every script the device supports.
- Request text: a system serif stack (`"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`) at 18 px with a line height of 1.6. Scripts without a serif fall back gracefully.
- Sizes: 14, 16, 18, 22, 28 px. Two weights: regular and semibold.
- No web fonts are downloaded.

**Space and shape**

- Spacing steps: 4, 8, 12, 16, 24, 32, 48 px.
- One column, at most 640 px wide, centred.
- Cards: 12 px corners, a 1 px `--line` border, no shadow.
- Buttons: fully rounded, at least 44 px tall for touch.
- A 2 px `--gold` hairline across the very top of the page is the only ornament.

**Components**

| Component | Notes |
| --- | --- |
| Request card | Label and name in `--muted`; text in serif `--ink`; footer row with time on one side and the button on the other |
| "I prayed" button | Outline in `--blue` before; filled `--sky` with a small gold mark and the new count after. One 200 ms transition, skipped when the device asks for reduced motion |
| Primary button | Solid `--blue`, white text |
| Tabs | Text only, the active one underlined in `--blue` |
| Form fields | 1 px `--line` border, `--blue` focus ring 2 px, label always visible above the field |
| Notice | A `--sky` panel with plain text; used for confirmations and the held state |
| Language picker | A plain list of language names, each written in its own language |

**Budgets Opus must meet**

- The wall transfers under 50 KB in total, with under 10 KB of JavaScript and no images.
- Lighthouse mobile scores of 95 or more for performance and 100 for accessibility.
- Meets WCAG 2.2 level AA: keyboard reachable, visible focus, labelled controls, correct `lang` and direction on every request.
- Looks right at 320 px wide, in Arabic and Hebrew (right to left), and in dark mode.

**Tone of the words**

Short, warm, plain. No exclamation marks, no marketing language, no emoji in the interface.

## Open source setup

The code is published under AGPL-3.0-or-later: anyone may use, change and run it, and anyone who runs a changed version for the public must publish their changes.

**Files the repository needs from the first commit**

| File | Purpose |
| --- | --- |
| `LICENSE` | The AGPL-3.0 text. GitHub adds it when the repository is created with that licence selected |
| `README.md` | What the project is, a screenshot, how to run it locally in five commands, how to help |
| `CONTRIBUTING.md` | How to propose a change, the coding rules, how to add or fix a language |
| `CODE_OF_CONDUCT.md` | The Contributor Covenant, with a real contact address |
| `SECURITY.md` | How to report a vulnerability privately |
| `GOVERNANCE.md` | Who decides: one maintainer for now, and how that can widen |
| `docs/blueprint.md` | This document |
| `docs/decisions.md` | A dated log of any decision that changes |
| `docs/moderator-guide.md` | The one-page guide for moderators |
| `docs/runbook.md` | What to do when something breaks or the site is attacked |
| `.github/` | Issue templates (bug, language, idea) and the test workflow |

**Three things the licence asks of the running site**

1. The footer links to the exact source code of the version that is running. AGPL requires that users of a network service can get the source.
2. Every source file's licence is clear: a short licence line at the top of each file, or one statement in the README.
3. Secrets (the master secret, API tokens) live in the platform's secret store, never in the repository.

**Choices to make once, early**

- **Who owns contributions.** By default each contributor keeps the copyright on their part. That makes a later licence change very hard, which suits a project that means to stay open. No contributor agreement is needed.
- **The name and logo are not covered by the code licence.** Say in the README that copies must use their own name, so a harmful copy cannot pass as the original.
- **What users post stays theirs.** The rules page says that posting lets the site display and translate the text until it expires.
- **Where the community talks.** GitHub Discussions is enough to begin.

**Neutrality statement for the README**

A short paragraph: the project serves anyone who prays to God, it promotes no denomination or tradition, and contributions are judged on quality and on the rules, not on the contributor's beliefs.

**Translations by volunteers**

Start with JSON files and pull requests. The English file is the source, with a comment explaining each phrase. When more than a handful of people are translating, move to a hosted translation tool; Weblate offers free hosting to open-source projects, which should be confirmed at that point.

## Running costs

The site costs only its domain name while small, about $40 a month at 1,000 requests a day, and a few hundred dollars a month at 10,000 requests a day. Translation is the largest cost at every size.

|  | Starting out | Growing | Large |
| --- | --- | --- | --- |
| Visits a day | 1,000 | 20,000 | 200,000 |
| Requests posted a day | 50 | 1,000 | 10,000 |
| Prayers a day | 1,000 | 30,000 | 300,000 |
| Cloudflare plan | Free | Paid, $5 | Paid, $5 |
| Extra page requests | $0 | $0 | about $5 |
| Translation | about $1 (inside the free allowance) | about $25 | about $246 |
| Classifier (assumed) | under $1 | about $10 | about $100 |
| **Total a month** | **$0 to $2** | **about $40** | **about $360** |

The domain name adds roughly $10 to $15 a year.

**What these figures rest on**

- Cloudflare's published prices: the free plan allows 100,000 requests a day, 5 million database rows read and 100,000 rows written a day; the paid plan is $5 a month and includes 10 million requests, 25 billion rows read and 50 million rows written ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)).
- Each prayer writes about five database rows once indexes are counted. At 30,000 prayers a day that passes the free plan's daily write limit, which is why "Growing" needs the paid plan.
- The classifier line is an assumption: one call of about 700 tokens per request on a small model priced under $0.50 per million tokens. Replace it with the real price once the model is chosen.
- Translation uses the estimate in the translation section.

**Two recommendations**

1. **Move to the $5 plan before the public launch.** On the free plan the database refuses all queries for the rest of the day once a daily limit is reached. A prayer wall that goes dark on its busiest day is worse than a $5 bill.
2. **Set a spending cap and an alert.** Translation and the classifier are the only costs an attacker could inflate, and the posting limits already bound them. An alert at twice the expected monthly spend catches anything unexpected.

**Paying for it**

Until it is large, one person can carry this. Past that, publish the monthly costs openly and accept donations through a transparent host such as Open Collective or GitHub Sponsors. Never run advertising.

## Milestones

Nine milestones take the project from an empty repository to a public wall, each sized for one or two Opus sessions and each ending in something that can be opened and checked. Moderation is built before translation on purpose: a wall that is safe in one language is launchable, and a wall that is translated but unsafe is not.

**Before milestone 0, by hand**

- [ ] Create the GitHub repository with the AGPL-3.0 licence selected.
- [ ] Create a free Cloudflare account.
- [ ] Connect the repository to the Opus session.

**M0. Skeleton**

- Build: Hono app on Workers, TypeScript, one D1 database, the repository files from the open source section, tests and a deploy workflow.
- Done when: a page saying "Prayer Wall" is live on a `workers.dev` address, `npm test` passes in GitHub Actions, and a merge to `main` deploys by itself.

**M1. The wall, read-only**

- Build: the migrations for all seven tables, a seed script with 40 sample requests in several languages, the wall page with both orderings and paging, the design tokens and components, English and Arabic interface files.
- Done when: the wall renders with JavaScript off; `/ar` is fully right to left; the page meets the size and Lighthouse budgets; dark mode works.

**M2. Posting and the private link**

- Build: the form, the fixed text rules with their messages, Turnstile, the daily visitor hash and the device id, the soft and hard posting limits, duplicate detection, the private page with its three actions, the mode switch fixed to `review_all`.
- Done when: a post with a link or phone number is refused with the text preserved; a valid post is held; the eleventh post in a day from one visitor hash is held and the sixty-first is refused; a third identical text is held as a duplicate; the private link shows "waiting for review"; delete removes the row; tests cover every rule and limit.

**M3. Moderator queue and reports**

- Build: `/mod` behind Cloudflare Access; the queue with every field in the queue table; publish, remove with a reason, escalate and skip; the log; the report button with its three-visitor and three-device rule; the report breaker; the queue amber, red and black thresholds with their alerts and automatic actions.
- Done when: a held request appears on the wall only after a moderator publishes it; three reports from different visitors and devices pull it back; a burst of reports trips the breaker; seeding 60 and then 150 held items triggers the posting cap and then `closed`; a removal's reason shows on the private page; every decision is in `mod_log`; `/mod` is unreachable without sign-in.

**M4. "I prayed"**

- Build: the counting route with all the prayer limits, `reach_count` and ordering by reach, the soft Turnstile challenge, the anomaly flag, the instant update in the browser, the shuffled "Needs prayer" list, edge caching, the hourly clean-up and expiry job.
- Done when: tapping twice counts once; the count survives a reload; 5,000 scripted taps from one address with fresh device ids add at most 30 to the count and 1 to reach; forty devices on one address can each pray for the same request up to the per-request limit; a request with a reach of zero appears ahead of one with ten; an expired request is gone from the wall and the database.

**M5. Automatic moderation**

- Build: the classifier adapter and prompt; the test set of 150 or more examples including 25 crisis examples; shadow running; the `auto` mode; the full crisis flow with its support page and the link shown on every confirmation; the posting and classifier breakers; the optional second-check adapter (off).
- Done when: the test report meets all three classifier targets; a crisis example is never refused or auto-published, including one that also breaks a fixed rule; a classifier outage holds posts instead of publishing them; a burst of posts flips the site to `review_all` and sends an alert; shadow results are stored beside moderator decisions.
- Blocked until: a person with crisis-line experience has approved the support message.

**M6. Translation**

- Build: the translator adapter for m2m100 and for provider B; `config/languages.json`; eager translation on publishing; the lazy route; name protection; the automatic checks; the daily ceiling; "Show original"; the 100-item test set and its scoring sheet.
- Done when: a request posted in Indonesian reads in English on `/en` and in Arabic on `/ar`; a held request is translated only into English; a translator outage shows the original with a note; a translation that fails an automatic check is never shown; translations are created once and reused; switching a language to `interface_only` stops translation in both directions; at least two languages besides English have passed the full gate with a named reviewer.

**M7. Launch readiness**

- Build: the rules, privacy and about pages; all launch-language interface files; the install-to-home-screen manifest; security headers; the `noindex` rules; the load tests below; the runbook and moderator guide; a database export routine; the weekly helpline link check.
- Done when: every checkbox in the privacy section is ticked; every launch language has passed its go-live checklist; an accessibility check passes at WCAG 2.2 AA; all load-test scenarios pass on a staging copy; a second person has followed the README and run the project locally.

Load tests run against a staging environment with its own database, each for 10 minutes unless stated.

| Scenario | Load | Passes when |
| --- | --- | --- |
| Normal peak | 50 posts and 2,000 prayers a minute, with 100 wall views a second | Errors under 0.1%; wall server time under 300 ms for 95% of views; counts are exact afterwards |
| Classifier outage | Normal peak while the classifier fails every call | No post is published automatically; all are held; an alert arrives within 2 minutes; reading and praying are unaffected |
| Translator outage | Normal peak while the translator fails every call | Publishing continues; originals show with a note; translations appear after recovery |
| Posting burst | 200 posts in 10 minutes from 50 visitor hashes | The site is in `review_all` within 1 minute; nothing is lost |
| Report spike | 500 reports in 5 minutes from 20 visitor hashes against 50 requests | The report breaker trips within 1 minute; no more than 10 requests are hidden before it does |
| Prayer farming | 5,000 taps on one request from one address, a new device id each time | At most 30 counted; reach rises by 1; its place in "Needs prayer" moves by one step |
| Database refusal | The database returns errors for 5 minutes | The wall is served from cache with a notice; the form keeps the text and asks to try again; no partial writes |
| Queue thresholds | 60, then 150, held items seeded | The posting cap, then `closed`, apply as specified, each with its alert |

**M8. Soft launch**

- Do: open the wall in `review_all` mode to one founding community for at least three weeks, then take the two decisions below separately.

*Revision 2.1: founding community soft launch, with two-tier exits*

Two decisions were tied together and are now separate. **Opening to the public** depends on people praying. **Switching to `auto`** depends on moderation. The wall may open to the public while still in `review_all`, with the daily posting cap of 60 for each active moderator.

Expectations to agree with the community before opening:

- At least 15 people who commit for three weeks; 30 or more across two or three languages is the aim.
- Each person prays for at least 5 requests on at least 4 days a week, and posts one real request in the first week.
- Three moderators and the deputy are in place.

| Measure | Minimum | Target | Needed for |
| --- | --- | --- | --- |
| Requests with a first prayer within 6 hours | 80% | 95% | Public opening |
| Requests with a first prayer within 24 hours | 95%, and every miss has a known cause | 100% | Public opening |
| Median time to first prayer | Under 3 hours | Under 1 hour | Public opening |
| Founding members active in the final week | 30%, and at least 8 people | 40% | Public opening |
| Weekly sample of 30 live translations per language | Average 3.7, none reversed | Average 4.0 | Public opening, per language |
| Ordinary review wait | 95% under 12 hours, none over 24 | All under 12 hours | Both |
| Crisis review wait | All under 6 hours | All under 2 hours | Both |
| Severe rule-breaking content found on the wall | None during the trial | No rule-breaking of any kind in the final week | Both |
| Classifier gate | Required level, then probation | Target level | `auto` |
| Monthly cost | Under $10 |  | Both |

How to apply the table:

- All minimums in a column's group must be met. Targets are recorded but do not block.
- A known cause for a missed first prayer is, for example, a request in a language no member reads. Test posts are excluded.
- A language that misses its translation minimum drops to interface only. It does not delay the opening.
- If the prayer measures miss, the problem is the community, not the software. Add a second community or a daily reminder; do not change thresholds.
- **Time box.** Hold a go or no-go review at week 6. The outcomes are: open publicly in `review_all` with the cap; extend two weeks with one named fix; or pause. Never extend twice for the same cause without changing something.

**Good moments to bring a review back to me**

1. After M2, before any real person posts: the abuse and privacy handling.
2. After M5: the classifier prompt and its test results.
3. Before M8: a final read of the whole system against this blueprint.

## Risks and open questions

The largest risks are human, not technical: too few moderators, and a wall where requests go unprayed. The code can only make both easier to manage.

**Risks**

| Risk | Why it matters | What reduces it |
| --- | --- | --- |
| Too few moderators for the languages and hours | Held requests wait, harmful ones stay up | Three moderators before `auto`; English translation in the queue; the `closed` mode as a last resort |
| Requests that nobody prays for | The wall fails at its one purpose | Fewest-first ordering; a founding community; the soft-launch test |
| Scams and requests for money | The most common abuse on open prayer walls | Fixed rules against contact details; the classifier; no way to reply to an author |
| Friction between traditions | An open wall invites preaching and argument | Rules 5 and 6; neutral interface; no comments |
| Poor machine translation | A mistranslated prayer can offend or mislead | The quality gate per language; "Show original"; a swappable translator |
| A person in crisis receives a cold response | Real harm | The crisis message, reviewed by someone qualified; priority in the queue |
| Dependence on one platform | Price or policy changes | Adapters around every platform feature; SQLite and Hono run elsewhere |
| Legal duties for a public posting site | Fines or takedown | The advice step in the privacy section, before launch |

**Open questions for you**

| Question | Blocks |
| --- | --- |
| Where the database is located | M0 |
| Who the first moderator is, for testing the queue | M3 |
| Who reviews and approves the crisis message | M5 |
| The final list of launch languages and a native reviewer for each | M6 |
| Whether to turn on the second moderation check | End of M5; must be settled before M7's privacy page |
| The name and the domain | M7 |
| The minimum age (working default: 16) | M7 |
| Who gives the legal and data protection advice | M7 |
| The three moderators and the maintainer's deputy | M8 |
| Which founding community opens the wall | M8 |

**For Opus to verify in current documentation before relying on it**

I did not confirm these. Each is an assumption in this blueprint, and the milestone named cannot be called done until its items are checked against current official documentation.

| Assumption to verify | Blocks |
| --- | --- |
| Current Hono and Wrangler versions, and the Vitest integration for Workers | M0 |
| D1 location options and the point-in-time recovery window on each plan | M0 |
| The free plan's limit of 10 ms of processor time per request is enough to render the wall and compute the hashes | M1 |
| Turnstile is free at this volume, and exactly what it stores in the browser | M2 |
| Whether the Workers rate-limiting feature suits these limits better than a database table | M2 |
| Cloudflare Access is free for a small moderator team, and how the signed-in identity reaches the Worker | M3 |
| Cron Triggers are available on the Workers free plan | M4 |
| How HTML caching per language behaves, including for cached requests counted against the request limit | M4 |
| The Workers AI free daily allowance and model catalog, including a multilingual model with JSON output for the classifier, and that model's data-retention terms | M5 |
| A maintained international directory of crisis helplines, of the kind described in the crisis section | M5 |
| The language codes m2m100 accepts for every launch language (Hebrew and Ukrainian in particular) and its maximum input length | M6 |
| A provider B candidate for translation in the Workers AI catalog | M6 |
| How long background work may run after a response, the limit on outgoing calls per request, and whether a queue is the better fit for eager translation | M6 |
| Weblate's free hosting terms for open-source projects | Not blocking |

Added in revision 2.1:

| Assumption to verify | Blocks |
| --- | --- |
| A URL fragment survives copying, sharing and the installed home-screen app on iOS and Android | M2 |
| A safety-classification model (Llama Guard 3 was listed) is available, hosted by Cloudflare, and which languages it covers | M5 |
| The three provider B candidates are still listed, not deprecated, hosted by Cloudflare with zero data retention, at the prices shown | M6 |
| Reasoning output can be switched off for the chosen provider B model | M6 |
| The free allowance of 10,000 units a day, which I work out as roughly 1,000 m2m100 translations | M6 |
| A random-position read on the id index is cheap in D1 at 100,000 rows | M4 |

## Decisions changed in revision 2

These fourteen changes should be copied into `docs/decisions.md` with the date 12 November 2026.

| Topic | Was | Now | Why |
| --- | --- | --- | --- |
| Eager translation | The 8 busiest languages | English plus languages with 5% or more of views, capped at 6; the rest lazy; a daily ceiling | Ties cost to real readership and bounds the worst case |
| Translation quality gate | 30 requests per language | 100 items in six groups, automatic checks on every pair, a named reviewer's sign-off | 30 items could not catch name, vocabulary or adversarial failures |
| Translation fallback | "Use a different provider, or wait" | Provider B on the same platform, then an outside service or "interface only"; a glossary for protected terms | A failed language needs a defined path, not a pause |
| Wall ordering | By number of prayers | By reach: distinct visitor hashes per day | Inflating a count would otherwise bury someone's request |
| Prayer limits | One per device; 120 an hour per visitor | Layered device, visitor and per-request limits; a soft Turnstile challenge; an anomaly flag | Resists scripts while keeping shared networks usable |
| Posting limits | Refuse above 5 an hour or 10 a day | Hold above the soft limits; refuse only above 60 a day; 3 a day per device; duplicate detection | A hard refusal punished churches and mobile networks |
| Reports | Three different visitors | Three different visitors and devices; a daily cap; a report breaker | Stops a small group from taking requests down |
| Moderator actions | Publish, remove | Publish, remove with a reason, escalate, skip | Second opinions, and a reason the author can see |
| Crisis handling | One paragraph | A seven-step flow; the classifier also checks posts refused by a fixed rule; a support link for everyone; a 2-hour target | A crisis post must never meet a bare refusal |
| Classifier test | 120 examples; 95% and 10% targets | 150 examples with 25 crisis; a 98% crisis target; shadow running on 300 real posts | Proves the classifier on real traffic before it acts |
| Circuit breaker | One trigger on posting volume | Seven triggers, including queue red and black with automatic actions | Defines what the site does when people are not available |
| Minimum age | Open | 16 as the working default | A concrete value to confirm with advice |
| "No cookies" | Stated outright | Limited to the site itself until Turnstile's storage is checked | The claim must be true as published |
| Data model | Seven tables as first written | Seven new columns and three index changes in the first migration | Supports reach, priority, shadow results, duplicates and removal reasons |

**Revision 2.1, 14 November 2026**

| Topic | Was | Now | Why |
| --- | --- | --- | --- |
| Classifier gate | One bar: 95%, 10%, 98%, and 95% on 300 posts | A required level and a target level; seeded test posts; probation; a five-step fallback | The single bar could be unreachable and would have blocked launch indefinitely |
| `review_all` | A temporary mode | A legitimate standing mode with a cap of 60 posts a day per moderator; reviewed at week 8 | The wall must be able to run without a passing classifier |
| Provider B | "A current multilingual model" | Three named candidates, selection criteria, acceptance rules including a crisis-content group | An undefined fallback is not a fallback |
| Primary translator | m2m100 by default | Chosen per language by gate score between m2m100 and provider B | Provider B costs about the same |
| "Needs prayer" page | The 60 neediest, shuffled | 8 own-language, 8 overall with a passing translation, 4 random low-reach | Reach ordering let unreadable requests fill the top |
| Soft-launch exit | One set of targets for one decision | Minimum and target levels; public opening and `auto` decided separately; a week-6 time box | A single missed target could delay launch without limit |
| Crisis message | Promised that people will pray | Three drafts that promise only that a person will read it | The promise failed when a request could not be published |
| Confirmation wording | "People will pray" allowed before publishing | "Received" until published | Same reason, for every held request |
| Private link | Token in the address path | Token after `#`, sent in a POST body | Paths are written to platform logs |
| Data model |  | Add `is_test` to `requests`; moderators may set crisis priority | Supports seeded posts and late crisis marking |

## Sources

Prices and limits were read from these pages on the date at the top of this document.

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): free and paid request limits, the $5 plan.
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/): rows read and written, storage, behaviour at the free limit.
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/): point-in-time recovery of 7 days free and 30 days paid.
- [Workers AI m2m100-1.2b model page](https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/): translation price, parameters, zero data retention.
- [OpenAI: upgrading the Moderation API](https://openai.com/index/upgrading-the-moderation-api-with-our-new-multimodal-moderation-model/): the free, multilingual moderation endpoint.

Existing prayer apps and walls surveyed earlier in this conversation: [God Listens](https://faith.tools/app/god-listens), [SoulReflect](https://www.producthunt.com/products/soulreflect), [3-16](https://learnofchrist.com/resources/three-sixteen-prayer-network), [Pray4Me](https://apps.apple.com/app/id940524774), [PrayerPlatform](https://apps.apple.com/us/app/prayerplatform/id6749883173).

## Change summary

Revision 2 keeps the scope, architecture, privacy model and milestone order of the original, and makes six areas operational.

- **Translation.** The gate grew from 30 to 100 items with adversarial, mixed-language, sensitive-vocabulary and name cases, backed by automatic checks on every language pair and a named native reviewer. A failed language now has a defined fallback, down to "interface only". Reason: a mistranslated prayer does real harm, and the first version left failure undefined.
- **Moderation operations.** Added load estimates by volume, decision-time targets, the exact contents of a queue item, seven circuit breakers, an escalation table, and what happens with two, one or no moderators. Reason: the three-moderator assumption was the plan's weakest point.
- **Moderator care.** Added a burnout and coverage subsection with time guidelines, skipping, and a recruiting trigger. Reason: volunteers leave when the work is unbounded.
- **Crisis handling.** Rewritten as a step-by-step flow with a drafted message, review by someone with crisis-line experience as a blocking item, a maintained helpline directory, and a safety net for missed cases. Reason: this is the highest-stakes interaction on the site.
- **Abuse resistance.** Ordering now uses reach, prayer and posting limits are layered and soft-first, and the roles of the device id and visitor hash are spelled out. Reason: count inflation could be used to bury requests, and hard limits punished shared networks.
- **Legal and privacy.** The checklist now covers data protection, the EU Digital Services Act and minimum age item by item, with a list of required privacy-page disclosures. Reason: these duties apply even to a small volunteer site, and they block launch.
- **Milestones.** M2 to M8 carry the new acceptance criteria; M7 gains eight load-test scenarios; M8 gains founding-community expectations and exit measures; open questions and assumptions each name the milestone they block.

No feature excluded from version 1 was added. The only additions are small risk reductions: the Escalate and Skip actions, the support link on confirmations, and the "interface only" language status.

The cost tables are unchanged and now read as upper estimates.

**Revision 2.1.** Six blocks changed and no scope was added. The classifier gate and the soft-launch exits each gained a minimum level, so neither can stall the project. Provider B now has named candidates and its own acceptance rules. The "Needs prayer" page is composed from three sources to stop unreadable requests filling the top. The crisis message no longer promises what a moderator may be unable to deliver. The private link token no longer reaches server logs. Sources added: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and the [Gemma 4 release note](https://developers.cloudflare.com/changelog/post/2026-04-04-gemma-4-26b-a4b-workers-ai/index.md).

## Revision 2.2: proposed changes from the final review

These ten changes are proposals, not yet adopted. Nothing above this section has been altered. They make the wall depend less on people, help each request reach prayer at low volume, and remove parts that reach ordering made unnecessary. Adopt or strike each one, then copy the adopted ones into `docs/decisions.md`.

### A. Less dependence on people

**1. Ask the author to revise before holding.** Replaces step 4 of "What happens when someone presses Post" and the first design rule.

> The design rests on three rules: fixed text rules may refuse with an explanation; the AI may publish, hold, or ask the author once to revise; only a person may remove.
>
> 4. **Decision.** "ok" with high confidence is published. A crisis result follows the crisis flow. For five fixable categories (contact or link, money, identifies someone, preaching or debate, against others) the form comes back once, with the text intact, one plain sentence naming the concern, and two buttons: "Edit my request" and "Send it for review as it is". An edited request is checked again; a second fixable result is held without another prompt. Everything else, and any classifier failure, is held.
>
> Example sentences: "This may identify another person. Could you use a first name only and leave out details that point to them?" "The wall cannot carry requests for money or gifts. You can still ask for prayer about the need itself." "The wall is for prayer to God. Could you rephrase this as a request or a thanksgiving?"

Why: most held requests are fixable by their author in ten seconds. This turns moderator work into self-correction and gives the author a reason at once.

**2. An `unattended` mode replaces closing.** Replaces the "queue red" and "queue black" rows and the table "When the three-moderator assumption breaks".

> When no moderator has acted for 48 hours, the site enters `unattended` and keeps working:
>
> - Posting stays open. Only "ok" above the stricter confidence threshold, fixed when the classifier passed its gate, is published.
> - Fixable results get the revise prompt.
> - Anything else is not left waiting for a person who is not there. The author is told at once: "We cannot show this request automatically right now. You are welcome to reword it and try again." It is kept 14 days in case a moderator returns, then deleted.
> - A crisis request gets the support panel as always and stays first in the queue. The maintainer and deputy are paged at once and every 24 hours. In this mode the support message says "Your request has been received" and does not promise that a person will read it.
> - Three valid reports hide a request until it expires. The report breaker still applies.
> - The first moderator action ends the mode.
> - If the classifier has never passed its required level, `unattended` cannot publish anything, so posting pauses with a kind notice while reading and praying continue.
>
> One alert remains before this point: 20 items waiting, or any item past its target time.

Why: a service that closes when its volunteers are away dies of absence. This one degrades to a stricter wall and recovers by itself.

**3. Model lists and a weekly self-test.** Adds to "Rules for the code" and to the hourly job.

> Each AI task reads an ordered list of models from configuration: one list for the classifier, one per language for translation. A call that fails because a model is unavailable moves to the next entry and alerts the maintainer. When a translation list is exhausted, originals are shown. When the classifier list is exhausted, the rules for a classifier failure apply.
>
> Once a week a scheduled job sends 10 fine, 10 rule-breaking and 3 crisis examples from the test set through the live classifier, and 5 fixed sentences through each translation provider. If any rule-breaking or crisis example would be published, the stricter threshold is applied automatically and the maintainer is alerted. `/healthz/ai` shows pass or fail only.
>
> If Turnstile's verification service cannot be reached, a post is held, not refused.

Why: hosted models are retired or changed without notice; one Gemma model in this catalog was retired within about a year. Without this, the wall breaks silently on a date nobody chose.

**4. Translation with no recurring human task.** Replaces the eager-set rule ("reviewed weekly by hand") and the weekly sample of 30 live translations.

> The eager set is English plus every live language in which the wall was opened in the last 48 hours, capped at 8. Each language writes at most one "seen" row an hour. Nobody maintains the set.
>
> The card menu gains "Translation looks wrong". Three such flags from different visitors discard that translation. It is made once more with the next provider; if flagged again, the original is shown for that request in that language. A language where more than 5% of translations are flagged in a month is raised for a new gate run.
>
> Human review of translations happens when a language is launched and when its model changes, not weekly. In the soft-launch table, the translation row becomes: fewer than 5% of translations flagged.

Why: a weekly review by native speakers in every language is the kind of duty that lapses first.

### B. Prayer at low volume, and spread

**5. Pray while you wait.** Adds to the confirmation page.

> Below the private link, the confirmation page shows three requests from "Needs prayer" under the line: "While your request waits, these people are waiting too." Each has its "I prayed" button. Nothing is required, and nothing about the author's own request depends on it.

Why: the person who has just posted is the most willing visitor the site will ever have. If the average author prays for one other request, every request is prayed for without a prayer team.

**6. A request can be shared, and a shared link is a front door.** Replaces the one-line description of the single-request page.

> - The address to share is `/r/{id}`, with no language in it. It sends each visitor to the page in their own browser language.
> - Once a request is published, the confirmation and private pages show "Ask others to pray", which opens the device's share sheet or copies the link. Wall cards carry no share button.
> - The request page shows, in order: one line ("Someone asked for prayer here. No account is needed."), the request, the "I prayed" button, three more requests from "Needs prayer", and "Ask for prayer".
> - The link preview shows "Pray for {first name}" or "A prayer request", and "Tap to read and pray. No account needed." It never contains the request text.
> - A link to an expired or removed request never shows an error. It says "This request has ended. Others are waiting for prayer." above three requests.
> - A held request has no page until it is published.

Why: with no budget, the only channel is an author sending their own request to family or a group chat. Every such visitor lands one tap from praying and one more from the next request.

**7. "Your prayers", on the device only.** Adds one line at the top of the wall and one route.

> Shown only when this device has something to report: "People prayed 12 times for your request." and "A request you prayed for was answered." The browser keeps the ids it posted or prayed for, at most 100, and asks `GET /api/status?ids=...` for counts and answered flags. Nothing is stored on the server and nothing identifies the person.

Why: knowing a prayer was received or answered is the reason to come back. This is the one addition in this review; it needs no account, notification or server state.

**8. "Needs prayer" widens when the wall is quiet.**

> "Needs prayer" draws on the last 7 days. If that gives fewer than 60 requests, it widens to 14 days, then to 30.

Why: at one or two posts a day the 7-day rule shows a nearly empty wall, and an empty wall is the commonest way these projects end.

### C. Remove from version 1

**9. Cut what reach ordering made unnecessary.**

> Removed: the per-device prayer limits (rule 2), the soft Turnstile challenge on prayers (rule 6), the anomaly flag (rule 8), the breaker "more than half of the last 50 posts were held", and the amber, red and black queue tiers.
>
> Kept: one prayer per device per request per day; 30 counted prayers per request per network per day; 600 an hour per network; ordering by reach; the posting-burst and report breakers.

Why: with fewest-first ordering by reach, inflating a count wins nothing and can bury nothing. The removed parts were insurance against an attack with no payoff, and each is code that can fail. Add them back only if farming is observed.

**10. Survive the loss of one person.** Adds to `GOVERNANCE.md` and the runbook.

> The repository belongs to a GitHub organisation with two owners. The Cloudflare account has a second administrator. The domain is registered for the longest available term with automatic renewal, and the deputy can reach the registrar account. The payment method has a backup.
>
> Because every request expires within 30 or 60 days, the service holds almost nothing worth restoring. Recovery is: deploy the code, create an empty database, set the secrets. The runbook describes this as a 30-minute procedure, and it is rehearsed once before launch.

Why: these projects usually end when a card expires, a domain lapses, or the founder is unavailable. None of that needs code to prevent.
