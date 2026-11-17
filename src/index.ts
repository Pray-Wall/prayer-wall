// SPDX-License-Identifier: AGPL-3.0-or-later
import { D1DatabaseAdapter } from "./adapters/cloudflare/d1";
import { createApp } from "./app";

export type Env = {
  DB: D1Database;
  GIT_SHA: string;
  REPO_URL: string;
};

export function sourceUrl(env: Pick<Env, "GIT_SHA" | "REPO_URL">): string {
  return /^[0-9a-f]{7,40}$/.test(env.GIT_SHA)
    ? `${env.REPO_URL}/tree/${env.GIT_SHA}`
    : env.REPO_URL;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const app = createApp({
      db: new D1DatabaseAdapter(env.DB),
      sourceUrl: sourceUrl(env),
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
