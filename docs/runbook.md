# Runbook

What to do when something breaks. It grows with each milestone; sections marked "later" are placeholders.

## Where things are

| Thing | Where |
| --- | --- |
| Code | <https://github.com/Pray-Wall/prayer-wall> |
| Hosting | Cloudflare Workers, worker name `prayer-wall` |
| Database | Cloudflare D1, name `prayer-wall`, jurisdiction EU |
| Deploys | GitHub Actions, workflow "Deploy", on every merge to `main` |
| Secrets for deploying | GitHub repository secret `CLOUDFLARE_API_TOKEN`; the account id is in `wrangler.jsonc` |

## Is it up?

Open `/healthz`. It returns `{"ok":true}` with status 200 when the database answers, and 503 when it does not.

## A deploy failed

1. Open the failed run under the repository's Actions tab and read the failing step.
2. If tests failed, fix them in a pull request. Nothing was deployed.
3. If `wrangler deploy` failed with an authentication error, the API token has expired or been revoked:
   create a new one (below) and update the `CLOUDFLARE_API_TOKEN` secret.

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
5. Merge to `main`, or re-run the Deploy workflow.
6. Check `/healthz`.

Later milestones add steps here: applying migrations, the master secret, Turnstile keys, Cloudflare Access.

## Who can act

See `GOVERNANCE.md`. The deputy may act when the maintainer cannot be reached for 24 hours.

## Later

- The site is under attack (M3 to M5: operating modes and breakers).
- The classifier or translator is failing (M5, M6).
- A crisis request has passed its time limit (M5).
- Monthly check of the helpline link (M5, M7).
- Database export (M7).
