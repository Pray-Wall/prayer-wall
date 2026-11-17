# Interface text

One JSON file per language. `en.json` is the source: each entry has a `message` and a
`description` that explains where the phrase appears. Other languages need only `message`.

- A missing key falls back to English.
- `{n}` is replaced by a number. Counts use the plural categories of the language
  (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`); a missing category falls back to `_other`.
- A language is listed in `src/lib/i18n.ts` only after a native speaker has reviewed it
  (see the go-live checklist in `docs/blueprint.md`).

**Status:** `ar.json` was drafted for development and has **not** yet been reviewed by a native speaker.
