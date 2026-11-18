// SPDX-License-Identifier: AGPL-3.0-or-later
// The operating mode and the automatic switches that change it.
import type { Database } from "./database";
import type { Alerter, RateLimiter } from "./services";

export type Mode = "review_all" | "auto" | "closed";

const OVERRIDE = "mode_override_review_all";
const FORCED_STRICT = "classifier_strict_forced";

/** The configured mode, unless a breaker has switched the site to `review_all`. */
export async function effectiveMode(db: Database, configured: Mode): Promise<Mode> {
  if (configured !== "auto") return configured;
  return ((await db.getState(OVERRIDE)) ?? 0) > 0 ? "review_all" : "auto";
}

export async function breakerOverride(db: Database): Promise<boolean> {
  return ((await db.getState(OVERRIDE)) ?? 0) > 0;
}

/** Returning from a breaker is always a manual, logged decision. */
export async function clearOverride(db: Database, who: string, now: number): Promise<void> {
  await db.setState(OVERRIDE, 0);
  await db.logEvent("mode_restored", who, "Returned from review_all set by a breaker", now);
}

/** True when the weekly self-test found a leak; the stricter threshold then applies until cleared. */
export async function strictForced(db: Database): Promise<boolean> {
  return ((await db.getState(FORCED_STRICT)) ?? 0) > 0;
}

export async function setStrictForced(db: Database, on: boolean, who: string, now: number): Promise<void> {
  await db.setState(FORCED_STRICT, on ? 1 : 0);
  await db.logEvent(on ? "strict_forced" : "strict_cleared", who, null, now);
}

/** The posting breaker: posts in 10 minutes above the larger of 30 or five times the 7-day average. */
export const BURST = { window: 600, floor: 30, factor: 5 } as const;

export async function notePost(deps: { db: Database; limiter: RateLimiter; alerter: Alerter }, configured: Mode, now: number): Promise<void> {
  const inWindow = await deps.limiter.hit("posts:all", BURST.window, now);
  if (inWindow <= BURST.floor) return;
  const weekly = await deps.db.countCreatedSince(now - 7 * 86400);
  // The 7-day average for a 10-minute window. The blueprint asks for the same time of day;
  // a flat average is used until there is enough history to make that meaningful.
  const average = weekly / ((7 * 86400) / BURST.window);
  if (inWindow <= Math.max(BURST.floor, BURST.factor * average)) return;
  if (configured === "auto" && !(await breakerOverride(deps.db))) {
    await deps.db.setState(OVERRIDE, now);
    await deps.db.logEvent("posting_burst", "breaker", `${inWindow} posts in 10 minutes`, now);
    await deps.alerter.send("posting_burst", `${inWindow} posts arrived in 10 minutes. The site switched to review_all; return it to normal from /mod when it is safe.`);
  } else if ((await deps.limiter.hit("alert:burst", 3600, now)) === 1) {
    await deps.alerter.send("posting_burst", `${inWindow} posts arrived in 10 minutes. Every request is already being held.`);
  }
}
