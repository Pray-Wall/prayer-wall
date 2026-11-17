// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from "cloudflare:test";
import { D1DatabaseAdapter } from "../src/adapters/cloudflare/d1";
import { createApp } from "../src/app";

export const d1 = (env as unknown as { DB: D1Database }).DB;
export const NOW = 1_800_000_000;
export const HOUR = 3600;
export const DAY = 86400;

/** An app wired to the test database with a fixed clock. */
export function testApp() {
  return createApp({ db: new D1DatabaseAdapter(d1), sourceUrl: "https://example.com/src", now: () => NOW });
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
  await d1.prepare("DELETE FROM requests").run();
}

/** Request bodies in page order. */
export function bodies(html: string): string[] {
  return [...html.matchAll(/<p class="text"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]!);
}
