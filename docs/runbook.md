# Runbook

What to do when something breaks. It grows with each milestone; sections marked "later" are placeholders.

## Where things are

| Thing | Where |
| --- | --- |
| Code | <https://github.com/Pray-Wall/prayer-wall> |
| Hosting | Cloudflare Workers, worker name `prayer-wall` |
| Database | Cloudflare D1, name `prayer-wall`, jurisdiction EU |
| Deploys | GitHub Actions, workflow "Deploy", on every merge to `main` |
| Secrets the site uses | Worker secrets `MASTER_SECRET` and `TURNSTILE_SECRET`, in Cloudflare (Worker → Settings → Variables and Secrets) |
| Secrets for deploying | GitHub repository secret `CLOUDFLARE_API_TOKEN`; the account id is in `wrangler.jsonc` |

## Is it up?

Open `/healthz`. It returns `{"ok":true}` with status 200 when the database answers, and 503 when it does not.

## A deploy failed

1. Open the failed run under the repository's Actions tab and read the failing step.
2. If tests failed, fix them in a pull request. Nothing was deployed.
3. If `wrangler deploy` failed with an authentication error, the API token has expired or been revoked:
   create a new one (below) and update the `CLOUDFLARE_API_TOKEN` secret.

## Posting is paused ("Posting is paused for now")

The form shows this notice when any of these is true:

1. `MODE` in `wrangler.jsonc` is `closed`.
2. `TURNSTILE_SITE_KEY` in `wrangler.jsonc` is empty.
3. The Worker secret `TURNSTILE_SECRET` or `MASTER_SECRET` is missing.
4. Nobody is moderating (see "Nobody is moderating" below).

### Set up the bot check (Turnstile), once

1. Cloudflare dashboard → Turnstile → Add widget. Name `prayer-wall`; add the site's hostname; mode "Managed".
   Leave pre-clearance off, so that no cookie is set.
2. Put the **site key** (public) in `wrangler.jsonc` as `TURNSTILE_SITE_KEY` and merge.
3. Put the **secret key** in the Worker: Workers & Pages → `prayer-wall` → Settings → Variables and Secrets →
   Add → type Secret, name `TURNSTILE_SECRET`. Never put it in the repository.

### The bot check is not running (`bot_check_misconfigured`)

If held requests carry the reason `bot_check_misconfigured`, Cloudflare is rejecting the Worker's
`TURNSTILE_SECRET`: it does not belong to the widget whose site key is in `wrangler.jsonc`. Authors
see a normal confirmation and their posts are held, but **no bot check is happening**. Copy the
secret key from Turnstile → the widget, and replace `TURNSTILE_SECRET` in the Worker's settings.
The reason `bot_check_unavailable` means Cloudflare's verification service could not be reached.

To see the reasons of recent posts (D1 console):
`SELECT hold_reason, COUNT(*) FROM requests WHERE status = 'held' GROUP BY hold_reason`

### The master secret

`MASTER_SECRET` keys the daily visitor hashes and the duplicate check. The Deploy workflow creates it
once with a random value that nobody sees. If it is ever lost or replaced, nothing breaks: today's
posting limits and the duplicate check start again from zero, and private links keep working.

## Moderation

The queue is at `/mod`. It is not linked from the public site. It shows held requests and requests
that visitors reported, crisis first, then reported, then oldest first. Every decision is written to
the `mod_log` table with the moderator's sign-in address.

### Set up moderator sign-in (Cloudflare Access), once

Until this is done, `/mod` answers "not found".

1. In the Cloudflare dashboard open Zero Trust and, if asked, choose a team name and the free plan.
2. Access → Applications → Add an application → Self-hosted. Application domain: the site's hostname,
   **path `mod`**. Do not protect the whole hostname, and do not use the one-click "Enable Cloudflare
   Access" button on the Worker: that would put the public wall behind a sign-in.
3. Add a policy that allows only the moderators' email addresses. One-time PIN sign-in needs no setup.
4. From the application's overview copy the **AUD tag**, and note the team address
   (`https://<team>.cloudflareaccess.com`). Neither is secret.
5. Put them in `wrangler.jsonc` as `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`, and merge.

The Worker checks the signed token on every `/mod` request itself, so a request that does not come
through Access is refused.

To add or remove a moderator, edit the policy in step 3. Nothing in the repository changes.

### Alerts

Alerts go to Telegram, through a bot. To set it up:

1. In Telegram, open `@BotFather`, send `/newbot`, and follow the steps. It replies with a **bot token**.
2. Open the new bot and send it any message (a bot cannot write to someone who has not written to it first).
3. In a browser open `https://api.telegram.org/bot<TOKEN>/getUpdates` and find `"chat":{"id":…}`. That number is the **chat id**.
   For a group of moderators, add the bot to a private group, send a message there, and use the group's id (it starts with `-`).
4. Add both as Worker **secrets**: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

Instead of Telegram, the secret `ALERT_WEBHOOK_URL` can hold a Slack or Discord incoming-webhook address.
Without either, alerts go nowhere. Alerts never contain request text.

To check that alerts arrive, press **Send a test alert** at the bottom of `/mod`.

**Both Telegram values must be of type Secret.** A plain variable added in the dashboard is removed by the next deploy from GitHub, because the deploy replaces all variables with those in `wrangler.jsonc`.

| Alert | Sent when | At most |
| --- | --- | --- |
| `queue_waiting` | 20 items are waiting, or any item is past its target time | Every 6 hours |
| `unattended` | A held request has waited 48 hours and no moderator has acted in that time | Once a day |
| `report_breaker` | More than 30 reports in 10 minutes, or one network tried to report more than 10 requests | Once per incident |

### Nobody is moderating (`unattended`)

When a held request has waited 48 hours and no moderator has decided anything in that time, posting
pauses with the notice "Posting is paused for now". Reading continues. **Any decision in the queue
reopens posting at once.**

### The report breaker

During unusual reporting, three reports no longer hide a request; they flag it in the queue while
it stays on the wall. This ends by itself after 60 quiet minutes.

## Automatic moderation (the classifier)

### Set it up, once

1. Make sure the `CLOUDFLARE_API_TOKEN` secret has **Account → Workers AI → Read**.
2. Run **Actions → Classifier test → Run workflow** with candidate Workers AI model ids and a
   threshold. Read the report against the gate in `test/moderation-eval/README.md`.
3. Put the chosen ids, comma-separated, in `CLASSIFIER_MODELS` in `wrangler.jsonc` and merge.
   Record the run in `docs/decisions.md`.
4. Watch `/mod?view=shadow` for a while: it compares the classifier with moderator decisions.
5. Only then, and only with the support message approved and enough moderators, set `MODE` to `auto`.

### It is failing (`classifier_errors`, `model_unavailable`)

Requests are held, never published, so nothing unsafe happens; the queue just grows. Check the
model id still exists in Cloudflare's model list; replace it or add a second id.

### A burst of posts (`posting_burst`)

In `auto` the site switches itself to `review_all`. When the burst is over, press **Return to auto**
in `/mod`. Both steps are logged.

### Weekly self-test (`self_test`)

Runs Monday 03:17 UTC. If a rule-breaking or crisis example would be published, the stricter
threshold applies until a moderator presses **Clear the stricter threshold** in `/mod`; fix the model
or threshold first. `/healthz/ai` returns 200 only after a passing run in the last 8 days.

### Crisis requests (`crisis`, `crisis_overdue`)

A crisis request is held at the top of the queue and alerts at once. If it waits more than 6 hours,
the alert repeats every 6 hours. Never contact the author.

## Pause posting

Set `MODE` to `closed` in `wrangler.jsonc` and merge. Reading stays available. Set it back to `review_all` to reopen.

## Clean-up (every 30 minutes)

The scheduled job deletes, for real:

| What | When |
| --- | --- |
| A published request | When it expires (30 days, or 60 if the author extended it) |
| A held request nobody reviewed | 14 days after posting (never a held crisis request) |
| A removed request | 30 days after removal |
| `prayers` and `rate_limits` rows | After 48 hours |
| Reports and prayers of a deleted request | With the request |

`mod_log` and the totals in `counters` are kept; they hold no request text.

## Database changes

Schema changes are numbered SQL files in `migrations/`. The Deploy workflow applies any new ones
before it deploys the code. Never edit a migration that has already been applied; add a new one.

## Sample data (before launch only)

The workflow "Seed sample data" (Actions tab, run by hand) loads 40 invented requests into the live
database, replacing any earlier sample rows. They are marked with `poster_hash = 'seed'`.
**Before any real person posts**, remove them:
`npx wrangler d1 execute prayer-wall --remote --command "DELETE FROM requests WHERE poster_hash = 'seed'"`,
then delete the workflow.

## Roll back a bad deploy

Either revert the commit on `main` (the revert deploys by itself), or in the Cloudflare dashboard open
the worker, go to Deployments, and roll back to the previous version.

## Recovery from nothing (target: 30 minutes)

Requests expire within 30 or 60 days, so there is almost nothing worth restoring. To bring the
service back on a fresh Cloudflare account:

1. Create a D1 database named `prayer-wall` with jurisdiction EU:
   `npx wrangler d1 create prayer-wall --jurisdiction=eu`. The jurisdiction cannot be changed later.
2. Put the new database id and account id in `wrangler.jsonc`.
3. Create a Cloudflare API token from the "Edit Cloudflare Workers" template, remove its Zone policy,
   add D1 → Edit to the Account policy, and limit it to the account.
4. Set the GitHub secret `CLOUDFLARE_API_TOKEN`.
5. Merge to `main`, or re-run the Deploy workflow. It applies the migrations to the empty database.
6. Check `/healthz`.

Then set up the bot check as described above; the master secret is created by the deploy.
Then set up moderator sign-in and alerts as described under "Moderation".

## Who can act

See `GOVERNANCE.md`. The deputy may act when the maintainer cannot be reached for 24 hours.

## Later

- The site is under attack (M3 to M5: operating modes and breakers).
- The classifier or translator is failing (M5, M6).
- A crisis request has passed its time limit (M5).
- Monthly check of the helpline link (M5, M7).
- Database export (M7).
