// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, ModAction, QueueItem } from "./database";
import type { Alerter, RateLimiter } from "./services";

const HOUR = 3600;
const DAY = 86400;

/** Decision time targets and hard limits (blueprint, "Decision time targets"). */
export const TARGETS = {
  crisis: { target: 2 * HOUR, hardLimit: 6 * HOUR },
  reported: { target: 6 * HOUR, hardLimit: 24 * HOUR },
  ordinary: { target: 12 * HOUR, hardLimit: 24 * HOUR },
} as const;

/** One alert remains before `unattended`: this many items waiting, or any item past its target (Revision 2.2, change 2). */
export const QUEUE_ALERT_AT = 20;
/** No moderator action for this long, while a held request has waited as long, means nobody is there. */
export const UNATTENDED_AFTER = 48 * HOUR;
export const QUEUE_PAGE = 20;

/** Reason categories for a removal. The category is shown to the author on the private page. */
export const REMOVE_REASONS = ["contact", "money", "identifies", "preaching", "harm", "unsuitable", "not_prayer", "spam", "other"] as const;
export type RemoveReason = (typeof REMOVE_REASONS)[number];
export const isRemoveReason = (v: string): v is RemoveReason => (REMOVE_REASONS as readonly string[]).includes(v);

export type ItemClass = keyof typeof TARGETS;
export const classOf = (item: Pick<QueueItem, "priority">): ItemClass =>
  item.priority >= 2 ? "crisis" : item.priority === 1 ? "reported" : "ordinary";

/** "ok" inside the target, "amber" past it, "red" past the hard limit. */
export function ageLevel(item: Pick<QueueItem, "priority" | "queuedAt">, now: number): "ok" | "amber" | "red" {
  const waited = now - item.queuedAt;
  const t = TARGETS[classOf(item)];
  return waited > t.hardLimit ? "red" : waited > t.target ? "amber" : "ok";
}

type Deps = { db: Database; limiter: RateLimiter };

/** Applies a moderator's decision. Publishing a reported request counts against the people who reported it. */
export async function decide(
  deps: Deps,
  d: { id: string; action: ModAction; moderator: string; removeReason?: string; now: number },
): Promise<boolean> {
  const reporters = d.action === "publish" ? await deps.db.reportersOf(d.id) : [];
  const applied = await deps.db.decide({
    ...d,
    removeReason: d.action === "remove" ? (isRemoveReason(d.removeReason ?? "") ? d.removeReason : "other") : undefined,
  });
  if (applied) {
    // A visitor whose reports are rejected three times in a day is ignored for the rest of that day.
    for (const who of reporters) await deps.limiter.hit(`report:rejected:${who}`, DAY, d.now);
  }
  return applied;
}

/**
 * True when nobody is moderating: a held request has waited 48 hours and no moderator has acted
 * in that time. Until a classifier has passed its gate (M5), nothing can be published without a
 * person, so posting pauses with a kind notice; reading continues. The first moderator action ends it.
 */
export async function isUnattended(db: Database, now: number): Promise<boolean> {
  const { oldestHeldQueuedAt } = await db.queueSummary();
  if (oldestHeldQueuedAt === null || now - oldestHeldQueuedAt <= UNATTENDED_AFTER) return false;
  const last = await db.lastModeratorActionAt();
  return last === null || now - last > UNATTENDED_AFTER;
}

/** Run on a schedule: tells the moderators when the queue needs them. Each alert is sent at most once per period. */
export async function checkQueue(deps: Deps & { alerter: Alerter }, now: number): Promise<void> {
  const { waiting } = await deps.db.queueSummary();
  if (waiting === 0) return;
  const once = async (key: string, period: number) => (await deps.limiter.hit(`alert:${key}`, period, now)) === 1;

  if (await isUnattended(deps.db, now)) {
    if (await once("unattended", DAY)) {
      await deps.alerter.send("unattended", `No moderator has acted for 48 hours and ${waiting} item(s) are waiting. Posting is paused until someone reviews the queue.`);
    }
    return;
  }
  const items = await deps.db.listQueue(50, []);
  const late = items.filter((i) => ageLevel(i, now) !== "ok").length;
  if ((waiting >= QUEUE_ALERT_AT || late > 0) && (await once("queue_waiting", 6 * HOUR))) {
    await deps.alerter.send("queue_waiting", `${waiting} item(s) are waiting for review; ${late} past their target time.`);
  }
}
