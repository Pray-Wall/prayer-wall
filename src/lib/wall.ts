// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, WallCursor, WallRequest } from "./database";

export type WallView = "need" | "new";
export const PAGE_SIZE = 20;
const DAY = 86400;
/** "Needs prayer" draws on 7 days, widening to 14 then 30 when fewer than this many qualify (Revision 2.2, change 8). */
export const NEED_MINIMUM = 60;
export const NEED_WINDOWS_DAYS = [7, 14, 30] as const;

export type WallPage = { requests: WallRequest[]; next: string | null };

/** "Needs prayer" spreads attention over the neediest this many (blueprint: "Spreading attention"). */
export const NEED_POOL = 60;
export const SHUFFLES = 4;

/** A small, fast, deterministic hash: the same shuffle and id always give the same tie-break. */
function tieBreak(shuffle: number, id: string): number {
  let h = 2166136261 ^ shuffle;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Up to `n` requests from "Needs prayer", for the confirmation and request pages. */
export async function someNeedy(db: Database, n: number, exclude: string | null, now: number, random: () => number): Promise<WallRequest[]> {
  const pool = await db.listPublished({ order: "need", since: await needWindowStart(db, now), limit: PAGE_SIZE, now });
  return spread(pool.filter((r) => r.id !== exclude), Math.floor(random() * 1e9)).slice(0, n);
}

/**
 * Orders the neediest requests fewest-reach first, as always, but shuffles requests with the same
 * reach, so that visitors in the same minute do not all see the same 20. A request with less reach
 * is never placed after one with more.
 */
export function spread<T extends Pick<WallRequest, "id" | "reachCount">>(rows: T[], shuffle: number): T[] {
  return [...rows].sort((a, b) => a.reachCount - b.reachCount || tieBreak(shuffle, a.id) - tieBreak(shuffle, b.id));
}

export function parseShuffle(value: string | undefined, random: () => number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < SHUFFLES ? n : Math.floor(random() * SHUFFLES);
}

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= NEED_POOL / PAGE_SIZE ? n : 1;
}

export function parseView(value: string | undefined): WallView {
  return value === "new" ? "new" : "need";
}

function toBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

export function encodeCursor(view: WallView, r: WallRequest): string {
  const parts = view === "need" ? [r.reachCount, r.publishedAt, r.id] : [r.publishedAt, r.id];
  return toBase64Url(JSON.stringify(parts));
}

/** Returns undefined for a missing or malformed cursor, which means "start from the top". */
export function decodeCursor(view: WallView, value: string | undefined): WallCursor | undefined {
  if (!value || value.length > 120) return undefined;
  try {
    const p: unknown = JSON.parse(fromBase64Url(value));
    if (!Array.isArray(p)) return undefined;
    const int = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;
    const id = (x: unknown): x is string => typeof x === "string" && /^[a-z2-7]{12}$/.test(x);
    if (view === "need" && p.length === 3 && int(p[0]) && int(p[1]) && id(p[2])) {
      return { order: "need", reach: p[0], publishedAt: p[1], id: p[2] };
    }
    if (view === "new" && p.length === 2 && int(p[0]) && id(p[1])) {
      return { order: "new", publishedAt: p[0], id: p[1] };
    }
  } catch {
    // fall through
  }
  return undefined;
}

/** The start of the "Needs prayer" window: the narrowest of 7, 14 or 30 days that holds enough requests. */
export async function needWindowStart(db: Database, now: number): Promise<number> {
  const cutoffs = NEED_WINDOWS_DAYS.map((d) => now - d * DAY);
  const counts = await db.countPublishedSince(cutoffs.slice(0, -1), now);
  const i = counts.findIndex((c) => c >= NEED_MINIMUM);
  return cutoffs[i === -1 ? cutoffs.length - 1 : i]!;
}

export type WallQuery = { view: WallView; after?: string; shuffle: number; page: number };

/** The next-page link's query for a "Needs prayer" page inside the shuffled pool. */
export type NeedNext = { shuffle: number; page: number } | { after: string };

export async function loadWall(db: Database, q: WallQuery, now: number): Promise<WallPage & { needNext?: NeedNext }> {
  const cursor = decodeCursor(q.view, q.after);
  if (q.view === "need" && !cursor) {
    // The first pages come from the neediest 60, spread by the shuffle; after them, plain paging resumes.
    const pool = await db.listPublished({ order: "need", since: await needWindowStart(db, now), limit: NEED_POOL, now });
    const spreadPool = spread(pool, q.shuffle);
    const requests = spreadPool.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE);
    let needNext: NeedNext | undefined;
    if (q.page * PAGE_SIZE < pool.length) needNext = { shuffle: q.shuffle, page: q.page + 1 };
    else if (pool.length === NEED_POOL) needNext = { after: encodeCursor("need", pool[pool.length - 1]!) };
    return { requests, next: null, needNext };
  }
  const rows = await db.listPublished({
    order: q.view,
    since: q.view === "need" ? await needWindowStart(db, now) : undefined,
    after: cursor,
    limit: PAGE_SIZE + 1,
    now,
  });
  const requests = rows.slice(0, PAGE_SIZE);
  const last = requests[requests.length - 1];
  return { requests, next: rows.length > PAGE_SIZE && last ? encodeCursor(q.view, last) : null };
}
