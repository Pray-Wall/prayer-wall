// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database } from "./database";
import { dailyHasher } from "./hashes";
import type { RateLimiter } from "./services";

/** Prayer limits kept by Revision 2.2, change 9. */
export const PRAYER_LIMITS = {
  /** Counted prayers per request per network (visitor hash) per day. */
  perRequestPerVisitorDay: 30,
  /** Counted prayers per network per hour, across all requests. */
  perVisitorHour: 600,
  /** Status look-ups per network per hour. */
  statusPerVisitorHour: 120,
} as const;

type Deps = { db: Database; limiter: RateLimiter; masterSecret: string };

/**
 * Counts one prayer. One per device (or, without a device id, per network) per request per UTC day.
 * Over a limit the tap is accepted silently and the current count is returned, so honest people never
 * see an error. Returns null when the request is not on the wall.
 */
export async function pray(
  deps: Deps,
  p: { requestId: string; ip: string; deviceId: string | null },
  now: number,
): Promise<number | null> {
  const hash = await dailyHasher(deps.masterSecret, now);
  const vhash = await hash.visitor(p.ip);
  const who = p.deviceId ? await hash.device(p.deviceId) : `v:${vhash}`;
  const hourOk = (await deps.limiter.hit(`pray:hour:${vhash}`, 3600, now)) <= PRAYER_LIMITS.perVisitorHour;
  const requestOk = (await deps.db.countedFromVisitor(p.requestId, vhash)) < PRAYER_LIMITS.perRequestPerVisitorDay;
  return deps.db.recordPrayer({ requestId: p.requestId, who, vhash, counted: hourOk && requestOk, now });
}

const ID = /^[a-z2-7]{12}$/;

/** Parses the `ids` list of a status request: at most 100 valid ids, without duplicates. */
export function parseIds(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").filter((id) => ID.test(id)))].slice(0, 100);
}
