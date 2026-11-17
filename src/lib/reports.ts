// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, ReportReason } from "./database";
import { dailyHasher } from "./hashes";
import type { Alerter, RateLimiter } from "./services";

const DAY = 86400;

export const REPORT_REASONS: readonly ReportReason[] = ["spam", "money", "personal", "hateful", "other"];
export const isReportReason = (v: string): v is ReportReason => (REPORT_REASONS as readonly string[]).includes(v);

export const REPORTS = {
  /** A request goes back to the queue at this many different visitors and this many different devices. */
  toPullBack: 3,
  perVisitorDay: 10,
  /** A visitor whose reports were rejected this often today is ignored for the rest of the day. */
  rejectedBeforeIgnored: 3,
  /** The breaker: more than this many reports site-wide in the window. */
  burst: 30,
  burstWindow: 600,
  /** While the breaker is on, reports flag requests without hiding them. It ends after this much quiet. */
  breakerQuiet: 3600,
} as const;

const BREAKER = "report_breaker_until";

type Deps = { db: Database; limiter: RateLimiter; alerter: Alerter; masterSecret: string };

export async function breakerActive(db: Database, now: number): Promise<boolean> {
  return ((await db.getState(BREAKER)) ?? 0) > now;
}

async function tripBreaker(deps: Deps, now: number, why: string): Promise<void> {
  const wasActive = await breakerActive(deps.db, now);
  await deps.db.setState(BREAKER, now + REPORTS.breakerQuiet);
  if (!wasActive) {
    await deps.alerter.send("report_breaker", `Unusual reporting (${why}). For the next hour reports flag requests for review without hiding them.`);
  }
}

/**
 * Files one report. The reporter always gets the same thanks, whatever happens here,
 * so nothing reveals whether a report counted.
 */
export async function fileReport(
  deps: Deps,
  r: { requestId: string; reason: ReportReason; ip: string; deviceId: string | null },
  now: number,
): Promise<void> {
  const hash = await dailyHasher(deps.masterSecret, now);
  const visitor = await hash.visitor(r.ip);

  if ((await deps.limiter.peek(`report:rejected:${visitor}`, DAY, now)) >= REPORTS.rejectedBeforeIgnored) return;
  if ((await deps.limiter.hit(`report:day:${visitor}`, DAY, now)) > REPORTS.perVisitorDay) {
    await tripBreaker(deps, now, "one network reported more than 10 requests");
    return;
  }
  if (!(await deps.db.isOnWall(r.requestId, now))) return;

  // Without a device id the visitor hash stands in for the device.
  const device = r.deviceId ? await hash.device(r.deviceId) : `v:${visitor}`;
  const isNew = await deps.db.addReport({ requestId: r.requestId, who: visitor, device, reason: r.reason, now });
  if (!isNew) return;

  if ((await deps.limiter.hit("report:all", REPORTS.burstWindow, now)) > REPORTS.burst) {
    await tripBreaker(deps, now, "more than 30 reports in 10 minutes");
  }
  const spread = await deps.db.reportSpread(r.requestId);
  if (spread.visitors >= REPORTS.toPullBack && spread.devices >= REPORTS.toPullBack) {
    await deps.db.pullBack(r.requestId, now, await breakerActive(deps.db, now));
  }
}
