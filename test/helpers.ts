// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from "cloudflare:test";
import { D1DatabaseAdapter } from "../src/adapters/cloudflare/d1";
import { D1RateLimiter } from "../src/adapters/cloudflare/ratelimit";
import { createApp } from "../src/app";
import type { Mode } from "../src/lib/posting";
import type { BotVerdict } from "../src/lib/services";

export const d1 = (env as unknown as { DB: D1Database }).DB;
export const NOW = 1_800_000_000;
export const HOUR = 3600;
export const DAY = 86400;

export const MASTER = "test-master-secret";

export type TestApp = ReturnType<typeof testApp>;

/** An app wired to the test database, with a clock, a network address and a bot check the test controls. */
export function testApp(options: { mode?: Mode; configured?: boolean; noModeration?: boolean } = {}) {
  const state = {
    now: NOW, ip: "203.0.113.7", bot: "pass" as BotVerdict, country: null as string | null,
    /** Who is signed in to /mod, or null. */
    moderator: null as string | null,
    alerts: [] as { kind: string; text: string }[],
  };
  const configured = options.configured ?? true;
  const app = createApp({
    db: new D1DatabaseAdapter(d1),
    limiter: new D1RateLimiter(d1),
    botCheck: configured ? { siteKey: "test-site-key", verify: async () => state.bot } : null,
    masterSecret: configured ? MASTER : null,
    mode: options.mode ?? "review_all",
    moderatorAuth: options.noModeration ? null : { identify: async () => state.moderator },
    alerter: { send: async (kind, text) => void state.alerts.push({ kind, text }) },
    sourceUrl: "https://example.com/src",
    clientIp: () => state.ip,
    clientCountry: () => state.country,
    now: () => state.now,
  });
  const post = (path: string, fields: Record<string, string>, headers: Record<string, string> = { "Sec-Fetch-Site": "same-origin" }) =>
    app.request(path, { method: "POST", body: new URLSearchParams(fields), headers });
  return Object.assign(app, { state, post });
}

/** Posts a valid request and returns the private token from the confirmation page. */
export async function postRequest(app: TestApp, fields: Record<string, string> = {}) {
  const res = await app.post("/en/new", { kind: "self", name: "", body: `Please pray for me ${++bodyCounter}`, ...fields });
  const html = await res.text();
  return { res, html, token: html.match(/data-remember="([0-9a-f]{32})"/)?.[1] };
}
let bodyCounter = 0;

export async function rows<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> {
  return (await d1.prepare(sql).bind(...args).all<T>()).results;
}

let counter = 0;
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export function makeId(n: number): string {
  let s = "";
  for (let i = 0; i < 12; i++) {
    s = B32[n % 32]! + s;
    n = Math.floor(n / 32);
  }
  return s;
}

type Seed = {
  id?: string;
  kind?: "self" | "other" | "event";
  name?: string | null;
  body?: string;
  lang?: string;
  status?: "held" | "published" | "removed";
  prayed?: number;
  reach?: number;
  isTest?: number;
  /** Seconds before NOW that it was published. */
  age?: number;
  expiresAt?: number;
};

export async function addRequest(s: Seed = {}): Promise<string> {
  const n = ++counter;
  const id = s.id ?? makeId(n);
  const publishedAt = NOW - (s.age ?? HOUR);
  await d1
    .prepare(
      `INSERT INTO requests (id, owner_hash, kind, display_name, body, lang, status, prayed_count, reach_count,
         body_hash, is_test, poster_hash, created_at, published_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test', ?, ?, ?)`,
    )
    .bind(
      id, `owner-${n}`, s.kind ?? "self", s.name ?? null, s.body ?? `Request ${n}`, s.lang ?? "en",
      s.status ?? "published", s.prayed ?? 0, s.reach ?? 0, `hash-${n}`, s.isTest ?? 0,
      publishedAt, publishedAt, s.expiresAt ?? publishedAt + 30 * DAY,
    )
    .run();
  return id;
}

export async function clearRequests() {
  await d1.batch([
    d1.prepare("DELETE FROM requests"), d1.prepare("DELETE FROM rate_limits"), d1.prepare("DELETE FROM reports"),
    d1.prepare("DELETE FROM mod_log"), d1.prepare("DELETE FROM counters"),
  ]);
}

/** Request bodies in page order. */
export function bodies(html: string): string[] {
  return [...html.matchAll(/<p class="text"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]!);
}
