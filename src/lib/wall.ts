// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, WallCursor, WallRequest } from "./database";

export type WallView = "need" | "new";
export const PAGE_SIZE = 20;
const DAY = 86400;
/** "Needs prayer" draws on 7 days, widening to 14 then 30 when fewer than this many qualify (Revision 2.2, change 8). */
export const NEED_MINIMUM = 60;
export const NEED_WINDOWS_DAYS = [7, 14, 30] as const;

export type WallPage = { requests: WallRequest[]; next: string | null };

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

export async function loadWall(db: Database, view: WallView, after: string | undefined, now: number): Promise<WallPage> {
  const rows = await db.listPublished({
    order: view,
    since: view === "need" ? await needWindowStart(db, now) : undefined,
    after: decodeCursor(view, after),
    limit: PAGE_SIZE + 1,
    now,
  });
  const requests = rows.slice(0, PAGE_SIZE);
  const last = requests[requests.length - 1];
  return { requests, next: rows.length > PAGE_SIZE && last ? encodeCursor(view, last) : null };
}
