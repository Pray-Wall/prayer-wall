# Prayer Wall

One global web page where anyone can leave a prayer request and anyone can pray for it,
each reading in their own language. No app, no account, no download.

**Status:** early development. Milestone 3 is in place: a wall with sample data, a posting form, the
author's private link, reports, and a moderator queue. Praying, automatic moderation and translation
are not built yet, so the site is not open to the public.
The plan is in [`docs/blueprint.md`](docs/blueprint.md) and changes to it are logged in
[`docs/decisions.md`](docs/decisions.md).

## What version 1 does

Four things: read the wall, post a request, tap "I prayed", and report a post.
There are no accounts, comments, notifications, search or tags.

## Neutrality

Prayer Wall serves anyone who prays to God. It promotes no denomination or tradition.
Contributions are judged on their quality and on the project's rules, not on the contributor's beliefs.

## Run it locally

Requires Node.js 22 or newer.

```sh
git clone https://github.com/Pray-Wall/prayer-wall.git
cd prayer-wall
npm ci
npm test
cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run db:seed:local
npm run dev
```

`npm run dev` serves the site at `http://localhost:8787` with a local database holding 40 invented
sample requests in twelve languages. No Cloudflare account is needed.

## How it is built

- [Hono](https://hono.dev) on Cloudflare Workers, TypeScript, HTML rendered on the server.
- Cloudflare D1 (SQLite) for storage.
- Every platform feature sits behind a small interface in `src/lib/`, with the Cloudflare
  implementation in `src/adapters/cloudflare/`, so the app can be self-hosted elsewhere by swapping adapters.
- Tests run inside the Workers runtime with Vitest. A merge to `main` deploys automatically.

## How to help

See [CONTRIBUTING.md](CONTRIBUTING.md). Translators and native-speaker reviewers are especially welcome.
To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Licence

[AGPL-3.0-or-later](LICENSE). Anyone may use, change and run this code; anyone who runs a changed
version for the public must publish their changes. Every source file is covered by this licence.
Contributors keep the copyright on their contributions.

The name "Prayer Wall" as used by this project, and any logo, are not covered by the code licence.
If you run your own copy, please give it your own name so that it cannot be mistaken for this one.
