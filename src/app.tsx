// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import type { Database } from "./lib/database";
import { DEFAULT_LANG, getLang, pickLang, translator } from "./lib/i18n";
import { loadWall, parseView } from "./lib/wall";
import { Layout } from "./views/layout";
import { Wall } from "./views/wall";

export type AppDeps = {
  db: Database;
  /** Link to the exact source of the running version (AGPL requirement). */
  sourceUrl: string;
  /** Current time in Unix seconds; injectable for tests. */
  now?: () => number;
};

const LOOKS_LIKE_LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

/** Builds the app from its dependencies; nothing here knows about Cloudflare. */
export function createApp(deps: AppDeps) {
  const app = new Hono();
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  app.get("/", (c) => {
    c.header("Vary", "Accept-Language");
    return c.redirect(`/${pickLang(c.req.header("Accept-Language"))}`, 302);
  });

  app.get("/healthz", async (c) => {
    const ok = await deps.db.ping();
    c.header("Cache-Control", "no-store");
    return c.json({ ok }, ok ? 200 : 503);
  });

  app.get("/:lang", async (c) => {
    const code = c.req.param("lang");
    const lang = getLang(code);
    if (!lang) {
      // Unknown language codes fall back to English for the interface.
      if (!LOOKS_LIKE_LANG.test(code)) return c.notFound();
      return c.redirect(`/${DEFAULT_LANG}${new URL(c.req.url).search}`, 302);
    }
    const view = parseView(c.req.query("view"));
    const at = now();
    const page = await loadWall(deps.db, view, c.req.query("after"), at);
    const t = translator(lang.code);
    return c.html(
      <Layout lang={lang} t={t} sourceUrl={deps.sourceUrl}>
        <Wall lang={lang} t={t} view={view} page={page} now={at} />
      </Layout>,
    );
  });

  return app;
}
