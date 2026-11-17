// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import type { Database } from "./lib/database";
import { Home } from "./views/home";

export type AppDeps = {
  db: Database;
  /** Link to the exact source of the running version (AGPL requirement). */
  sourceUrl: string;
};

/** Builds the app from its dependencies; nothing here knows about Cloudflare. */
export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get("/", (c) => c.html(<Home sourceUrl={deps.sourceUrl} />));

  app.get("/healthz", async (c) => {
    const ok = await deps.db.ping();
    c.header("Cache-Control", "no-store");
    return c.json({ ok }, ok ? 200 : 503);
  });

  return app;
}
