// SPDX-License-Identifier: AGPL-3.0-or-later
import { checkHelpline } from "./lib/helpline-check";
import { D1DatabaseAdapter } from "./adapters/cloudflare/d1";
import { CloudflareAccessAuth } from "./adapters/cloudflare/access";
import { D1RateLimiter } from "./adapters/cloudflare/ratelimit";
import { TurnstileBotCheck } from "./adapters/cloudflare/turnstile";
import { TelegramAlerter } from "./adapters/telegram-alerter";
import { WebhookAlerter, silentAlerter } from "./adapters/webhook-alerter";
import { createApp } from "./app";
import { WorkersAiRunner } from "./adapters/cloudflare/workers-ai";
import { checkQueue } from "./lib/moderation";
import { runSelfTest } from "./lib/self-test";
import type { ModeratorAuth } from "./lib/services";
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
  /** Cloudflare Access in front of /mod: the team address and the application's AUD tag. Not secret. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Secret: a chat webhook address for alerts to the moderators. Optional. */
  ALERT_WEBHOOK_URL?: string;
  /** Secrets: a Telegram bot token and the chat it writes to. Optional; used instead of the webhook. */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** Workers AI. Optional: without it every request is held. */
  AI?: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
  /** Classifier models, comma-separated, tried in order (Revision 2.2, change 3). */
  CLASSIFIER_MODELS?: string;
  /** Public contact address for the rules and privacy pages. */
  CONTACT_EMAIL?: string;
  /** "staging" on the load-test copy only. Never set in production. */
  ENVIRONMENT?: string;
  /** Confidence needed to publish automatically, and the stricter one for `unattended` and after a failed self-test. */
  CLASSIFIER_THRESHOLD?: string;
  CLASSIFIER_STRICT_THRESHOLD?: string;
  /** Local development only: sign in as this address on localhost. Never set in production. */
  DEV_MODERATOR?: string;
};

export function sourceUrl(env: Pick<Env, "GIT_SHA" | "REPO_URL">): string {
  return /^[0-9a-f]{7,40}$/.test(env.GIT_SHA)
    ? `${env.REPO_URL}/tree/${env.GIT_SHA}`
    : env.REPO_URL;
}

const parseMode = (value: string | undefined): Mode => (value === "closed" || value === "auto" ? value : "review_all");

function moderatorAuth(env: Env): ModeratorAuth | null {
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) return new CloudflareAccessAuth(env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  if (env.DEV_MODERATOR) {
    const email = env.DEV_MODERATOR;
    return { identify: async (req) => (["localhost", "127.0.0.1"].includes(new URL(req.url).hostname) ? email : null) };
  }
  return null;
}

function classifier(env: Env) {
  const models = (env.CLASSIFIER_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return env.AI && models.length ? { runner: new WorkersAiRunner(env.AI), models } : null;
}

const number = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return n > 0 && n <= 1 ? n : fallback;
};
const thresholds = (env: Env) => ({
  normal: number(env.CLASSIFIER_THRESHOLD, 0.9),
  strict: number(env.CLASSIFIER_STRICT_THRESHOLD, 0.97),
});

const alerter = (env: Env) =>
  env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
    ? new TelegramAlerter(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID)
    : env.ALERT_WEBHOOK_URL
      ? new WebhookAlerter(env.ALERT_WEBHOOK_URL)
      : silentAlerter;

/** Must match the second cron trigger in wrangler.jsonc. */
// Not exported: the runtime treats every export of the entry module as a handler.
const WEEKLY = "17 3 * * 1";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const app = createApp({
      db: new D1DatabaseAdapter(env.DB),
      limiter: new D1RateLimiter(env.DB),
      botCheck: env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? new TurnstileBotCheck(env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET) : null,
      masterSecret: env.MASTER_SECRET || null,
      mode: parseMode(env.MODE),
      moderatorAuth: moderatorAuth(env),
      alerter: alerter(env),
      classifier: classifier(env),
      thresholds: thresholds(env),
      sourceUrl: sourceUrl(env),
      contactEmail: env.CONTACT_EMAIL || "doublestrike.rar@gmail.com",
      // Cloudflare sets this header itself; a visitor cannot forge it. Only the staging copy, for
      // load tests, also trusts X-Test-Client-IP, so one machine can act as many visitors.
      clientIp: (req) =>
        (env.ENVIRONMENT === "staging" ? req.headers.get("X-Test-Client-IP") : null) ?? req.headers.get("CF-Connecting-IP") ?? "unknown",
      clientCountry: (req) => {
        const country = (req as Request<unknown, IncomingRequestCfProperties>).cf?.country;
        return typeof country === "string" ? country : null;
      },
    });
    return app.fetch(request, env, ctx);
  },

  // Every 30 minutes: delete what has expired, then tell the moderators when the queue needs them.
  // Once a week (Monday 03:17 UTC): the classifier self-test and the helpline link check.
  async scheduled(controller: ScheduledController, env: Env) {
    const db = new D1DatabaseAdapter(env.DB);
    const limiter = new D1RateLimiter(env.DB);
    const now = Math.floor(Date.now() / 1000);
    if (controller.cron === WEEKLY) {
      const c = classifier(env);
      if (c) await runSelfTest({ ...c, db, limiter, alerter: alerter(env) }, thresholds(env).normal, now);
      await checkHelpline({ db, alerter: alerter(env), fetch: (input, init) => fetch(input, init) }, now);
      return;
    }
    await db.cleanUp(now);
    await checkQueue({ db, limiter, alerter: alerter(env) }, now);
  },
} satisfies ExportedHandler<Env>;
