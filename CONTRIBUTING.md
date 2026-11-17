# Contributing

Thank you for wanting to help. This project is small on purpose, so the most useful contributions
keep it small.

## Before you start

- Read [`docs/blueprint.md`](docs/blueprint.md). It is the source of truth for what is built and why.
- Version 1 does four things: read the wall, post a request, tap "I prayed", report a post.
  Proposals for accounts, comments, notifications, search or tags will be declined for now.
- For anything larger than a small fix, open an issue first so the approach can be agreed.

## Proposing a change

1. Fork the repository and create a branch.
2. Make the change with tests. Run `npm run typecheck` and `npm test`.
3. Open a pull request that says what changed and why. If it changes a decision in the blueprint,
   say so; accepted changes are recorded in `docs/decisions.md` with the date and the reason.

## Coding rules

- Server-rendered HTML. JavaScript in the browser is progressive enhancement only, under 10 KB in total,
  and every page must work with it turned off.
- Every platform feature goes behind a small interface in `src/lib/` (`Database`, `Translator`,
  `Classifier`, `RateLimiter`), implemented in `src/adapters/`.
- User text is always escaped and shown as plain text.
- Layout uses CSS logical properties so right-to-left languages work without a second stylesheet.
- Never store or log IP addresses, and never log the private link token.
- No new runtime dependency without a reason given in the pull request.
- Each source file starts with `SPDX-License-Identifier: AGPL-3.0-or-later`.

## Adding or fixing a language

Interface text lives in `locales/`, one JSON file per language, with English as the source
(see `locales/README.md`). To fix wording, open a pull request or a "Language" issue.
A new language goes live only after a native speaker has reviewed it in context and it has passed
the quality gate described in the blueprint.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence of contributions

By contributing you agree that your contribution is licensed under AGPL-3.0-or-later.
You keep the copyright on your work; there is no contributor agreement.
