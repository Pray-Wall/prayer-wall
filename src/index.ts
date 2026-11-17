// SPDX-License-Identifier: AGPL-3.0-or-later
import { D1DatabaseAdapter } from "./adapters/cloudflare/d1";
import { D1RateLimiter } from "./adapters/cloudflare/ratelimit";
import { TurnstileBotCheck } from "./adapters/cloudflare/turnstile";
import { createApp } from "./app";
import type { Mode } from "./lib/posting";

export type Env = {
  DB: D1Database;
  GIT_SHA: string;
  REPO_URL: string;
  /** Operating mode: review_all, auto or closed. */
  MODE?: string;
  /** Public Turnstile site key. */
  TURNSTILE_SITE_KEY?: string;
  /** Secrets, set in the platform's secret store, never in the repository. */
  TURNSTILE_SECRET?: string;
  MASTER_SECRET?: string;
};

export function sourceUrl(env: Pick<Env, "GIT_SHA" | "REPO_URL">): string {
  return /^[0-9a-f]{7,40}$/.test(env.GIT_SHA)
    ? `${env.REPO_URL}/tree/${env.GIT_SHA}`
    : env.REPO_URL;
}

const parseMode = (value: string | undefined): Mode => (value === "closed" || value === "auto" ? value : "review_all");

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const app = createApp({
      db: new D1DatabaseAdapter(env.DB),
      limiter: new D1RateLimiter(env.DB),
      botCheck: env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? new TurnstileBotCheck(env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET) : null,
      masterSecret: env.MASTER_SECRET || null,
      mode: parseMode(env.MODE),
      sourceUrl: sourceUrl(env),
      // Cloudflare sets this header itself; a visitor cannot forge it.
      clientIp: (req) => req.headers.get("CF-Connecting-IP") ?? "unknown",
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
