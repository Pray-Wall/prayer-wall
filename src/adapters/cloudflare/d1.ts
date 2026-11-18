// SPDX-License-Identifier: AGPL-3.0-or-later
import type {
  Database, Decision, HoldReason, ListPublishedOptions, NewRequest, OwnRequest, QueueItem, RemovedItem,
  ReportReason, RequestStatus, WallRequest,
} from "../../lib/database";

const THIRTY_DAYS = 30 * 86400;

type Row = {
  id: string;
  kind: WallRequest["kind"];
  display_name: string | null;
  body: string;
  lang: string;
  country: string | null;
  prayed_count: number;
  reach_count: number;
  published_at: number;
  answered_at: number | null;
};

const toWallRequest = (r: Row): WallRequest => ({
  id: r.id,
  kind: r.kind,
  displayName: r.display_name,
  body: r.body,
  lang: r.lang,
  country: r.country,
  prayedCount: r.prayed_count,
  reachCount: r.reach_count,
  publishedAt: r.published_at,
  answeredAt: r.answered_at,
});

const VISIBLE = "status = 'published' AND is_test = 0 AND expires_at > ?";
const COLUMNS = "id, kind, display_name, body, lang, country, prayed_count, reach_count, published_at, answered_at";

export class D1DatabaseAdapter implements Database {
  constructor(private readonly d1: D1Database) {}

  async ping(): Promise<boolean> {
    try {
      const row = await this.d1.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      return row?.ok === 1;
    } catch {
      return false;
    }
  }

  async listPublished(o: ListPublishedOptions): Promise<WallRequest[]> {
    const where = [VISIBLE];
    const args: (string | number)[] = [o.now];
    if (o.since !== undefined) {
      where.push("published_at >= ?");
      args.push(o.since);
    }
    let orderBy: string;
    if (o.order === "need") {
      orderBy = "reach_count ASC, published_at ASC, id ASC";
      if (o.after?.order === "need") {
        where.push("(reach_count, published_at, id) > (?, ?, ?)");
        args.push(o.after.reach, o.after.publishedAt, o.after.id);
      }
    } else {
      orderBy = "published_at DESC, id DESC";
      if (o.after?.order === "new") {
        where.push("(published_at, id) < (?, ?)");
        args.push(o.after.publishedAt, o.after.id);
      }
    }
    args.push(o.limit);
    const { results } = await this.d1
      .prepare(`SELECT ${COLUMNS} FROM requests WHERE ${where.join(" AND ")} ORDER BY ${orderBy} LIMIT ?`)
      .bind(...args)
      .all<Row>();
    return results.map(toWallRequest);
  }

  async countPublishedSince(cutoffs: number[], now: number): Promise<number[]> {
    if (cutoffs.length === 0) return [];
    const sums = cutoffs.map((_, i) => `COALESCE(SUM(published_at >= ?), 0) AS c${i}`).join(", ");
    const row = await this.d1
      .prepare(`SELECT ${sums} FROM requests WHERE ${VISIBLE}`)
      .bind(...cutoffs, now)
      .first<Record<string, number>>();
    return cutoffs.map((_, i) => row?.[`c${i}`] ?? 0);
  }

  async createRequest(r: NewRequest): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO requests (id, owner_hash, kind, display_name, body, lang, country, status, hold_reason,
           body_hash, poster_hash, created_at, expires_at, queued_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.id, r.ownerHash, r.kind, r.displayName, r.body, r.lang, r.country, r.status, r.holdReason,
        r.bodyHash, r.posterHash, r.createdAt, r.expiresAt, r.status === "held" ? r.createdAt : null)
      .run();
  }

  async countByBodyHash(bodyHash: string, since: number): Promise<number> {
    const row = await this.d1
      .prepare("SELECT COUNT(*) AS n FROM requests WHERE body_hash = ? AND created_at >= ?")
      .bind(bodyHash, since)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async findByOwnerHash(ownerHash: string): Promise<OwnRequest | null> {
    const r = await this.d1
      .prepare(
        `SELECT id, kind, display_name, body, lang, status, remove_reason, prayed_count, answered_at, extended, expires_at
         FROM requests WHERE owner_hash = ?`,
      )
      .bind(ownerHash)
      .first<{
        id: string; kind: WallRequest["kind"]; display_name: string | null; body: string; lang: string;
        status: RequestStatus; remove_reason: string | null; prayed_count: number;
        answered_at: number | null; extended: number; expires_at: number;
      }>();
    if (!r) return null;
    return {
      id: r.id, kind: r.kind, displayName: r.display_name, body: r.body, lang: r.lang, status: r.status,
      removeReason: r.remove_reason, prayedCount: r.prayed_count, answeredAt: r.answered_at,
      extended: r.extended === 1, expiresAt: r.expires_at,
    };
  }

  async markAnswered(ownerHash: string, now: number): Promise<boolean> {
    const res = await this.d1
      .prepare("UPDATE requests SET answered_at = ? WHERE owner_hash = ? AND answered_at IS NULL AND status != 'removed'")
      .bind(now, ownerHash)
      .run();
    return res.meta.changes > 0;
  }

  async extendOnce(ownerHash: string, seconds: number, now: number): Promise<boolean> {
    const res = await this.d1
      .prepare(
        `UPDATE requests SET expires_at = expires_at + ?, extended = 1
         WHERE owner_hash = ? AND status = 'published' AND extended = 0 AND expires_at > ?`,
      )
      .bind(seconds, ownerHash, now)
      .run();
    return res.meta.changes > 0;
  }

  async deleteByOwnerHash(ownerHash: string): Promise<boolean> {
    const res = await this.d1.prepare("DELETE FROM requests WHERE owner_hash = ?").bind(ownerHash).run();
    return res.meta.changes > 0;
  }

  async getPublished(id: string, now: number): Promise<WallRequest | null> {
    const row = await this.d1.prepare(`SELECT ${COLUMNS} FROM requests WHERE id = ? AND ${VISIBLE}`).bind(id, now).first<Row>();
    return row ? toWallRequest(row) : null;
  }

  // ---- Prayers ----

  async recordPrayer(p: { requestId: string; who: string; vhash: string; counted: boolean; now: number }): Promise<number | null> {
    const first = await this.d1
      .prepare("SELECT COUNT(*) AS n FROM prayers WHERE request_id = ? AND vhash = ? AND counted = 1")
      .bind(p.requestId, p.vhash)
      .first<{ n: number }>();
    const reach = p.counted && (first?.n ?? 0) === 0 ? 1 : 0;
    // One transaction. Each counting statement runs only if the one before it changed a row.
    const results = await this.d1.batch([
      this.d1
        .prepare(
          `INSERT OR IGNORE INTO prayers (request_id, who, vhash, counted, created_at)
           SELECT ?, ?, ?, ?, ? FROM requests WHERE id = ? AND ${VISIBLE}`,
        )
        .bind(p.requestId, p.who, p.vhash, p.counted ? 1 : 0, p.now, p.requestId, p.now),
      this.d1
        .prepare("UPDATE requests SET prayed_count = prayed_count + 1, reach_count = reach_count + ? WHERE id = ? AND changes() > 0 AND ? = 1")
        .bind(reach, p.requestId, p.counted ? 1 : 0),
      this.d1
        .prepare(
          `INSERT INTO counters (name, value) SELECT 'prayers_total', 1 WHERE changes() > 0
           ON CONFLICT (name) DO UPDATE SET value = value + 1`,
        ),
      this.d1.prepare(`SELECT prayed_count FROM requests WHERE id = ? AND ${VISIBLE}`).bind(p.requestId, p.now),
    ]);
    const row = (results[3]?.results as { prayed_count: number }[] | undefined)?.[0];
    return row ? row.prayed_count : null;
  }

  async countedFromVisitor(requestId: string, vhash: string): Promise<number> {
    const row = await this.d1
      .prepare("SELECT COUNT(*) AS n FROM prayers WHERE request_id = ? AND vhash = ? AND counted = 1")
      .bind(requestId, vhash)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async statusOf(ids: string[], now: number): Promise<{ id: string; prayed: number; answered: boolean }[]> {
    if (ids.length === 0) return [];
    const { results } = await this.d1
      .prepare(`SELECT id, prayed_count, answered_at FROM requests WHERE id IN (${ids.map(() => "?").join(", ")}) AND ${VISIBLE}`)
      .bind(...ids, now)
      .all<{ id: string; prayed_count: number; answered_at: number | null }>();
    return results.map((r) => ({ id: r.id, prayed: r.prayed_count, answered: r.answered_at !== null }));
  }

  async cleanUp(now: number): Promise<number> {
    const old = now - 48 * 3600;
    // A held crisis request is never deleted unread (priority 2 arrives with M5).
    const expired = "expires_at <= ? AND NOT (status = 'held' AND priority >= 2)";
    const results = await this.d1.batch([
      this.d1.prepare(`DELETE FROM prayers WHERE request_id IN (SELECT id FROM requests WHERE ${expired})`).bind(now),
      this.d1.prepare(`DELETE FROM reports WHERE request_id IN (SELECT id FROM requests WHERE ${expired})`).bind(now),
      this.d1.prepare(`DELETE FROM translations WHERE request_id IN (SELECT id FROM requests WHERE ${expired})`).bind(now),
      this.d1.prepare(`DELETE FROM requests WHERE ${expired}`).bind(now),
      this.d1.prepare("DELETE FROM prayers WHERE created_at < ?").bind(old),
      this.d1.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(old),
    ]);
    return results[3]?.meta.changes ?? 0;
  }

  // ---- Moderation ----

  async listQueue(limit: number, skip: string[]): Promise<QueueItem[]> {
    const skipped = skip.slice(0, 50);
    const notIn = skipped.length ? `AND r.id NOT IN (${skipped.map(() => "?").join(", ")})` : "";
    const { results } = await this.d1
      .prepare(
        `SELECT r.id, r.kind, r.display_name, r.body, r.lang, r.country, r.status, r.hold_reason, r.priority,
                r.queued_at, r.created_at, r.escalated_by, r.category, r.confidence, r.is_test,
                (SELECT COUNT(*) FROM requests o
                  WHERE o.poster_hash = r.poster_hash AND o.id != r.id AND o.status IN ('held', 'removed')) AS same_day
         FROM requests r
         WHERE r.queued_at IS NOT NULL AND r.status != 'removed' ${notIn}
         ORDER BY r.priority DESC, r.queued_at ASC, r.id ASC
         LIMIT ?`,
      )
      .bind(...skipped, limit)
      .all<{
        id: string; kind: WallRequest["kind"]; display_name: string | null; body: string; lang: string; country: string | null;
        status: RequestStatus; hold_reason: HoldReason | null; priority: number; queued_at: number; created_at: number;
        escalated_by: string | null; category: string | null; confidence: number | null; is_test: number; same_day: number;
      }>();
    const reports = new Map<string, QueueItem["reports"]>();
    if (results.length) {
      const rows = await this.d1
        .prepare(
          `SELECT request_id, reason, COUNT(*) AS n FROM reports
           WHERE request_id IN (${results.map(() => "?").join(", ")}) GROUP BY request_id, reason`,
        )
        .bind(...results.map((r) => r.id))
        .all<{ request_id: string; reason: ReportReason; n: number }>();
      for (const row of rows.results) {
        reports.set(row.request_id, { ...reports.get(row.request_id), [row.reason]: row.n });
      }
    }
    return results.map((r) => ({
      id: r.id, kind: r.kind, displayName: r.display_name, body: r.body, lang: r.lang, country: r.country,
      status: r.status, holdReason: r.hold_reason, priority: r.priority, queuedAt: r.queued_at, createdAt: r.created_at,
      escalatedBy: r.escalated_by, category: r.category, confidence: r.confidence, isTest: r.is_test === 1,
      sameDayOthers: r.same_day, reports: reports.get(r.id) ?? {},
    }));
  }

  async queueSummary(): Promise<{ waiting: number; oldestHeldQueuedAt: number | null }> {
    const row = await this.d1
      .prepare(
        `SELECT COUNT(*) AS waiting, MIN(CASE WHEN status = 'held' THEN queued_at END) AS oldest
         FROM requests WHERE queued_at IS NOT NULL AND status != 'removed'`,
      )
      .first<{ waiting: number; oldest: number | null }>();
    return { waiting: row?.waiting ?? 0, oldestHeldQueuedAt: row?.oldest ?? null };
  }

  async lastModeratorActionAt(): Promise<number | null> {
    const row = await this.d1.prepare("SELECT MAX(created_at) AS at FROM mod_log").first<{ at: number | null }>();
    return row?.at ?? null;
  }

  async listRemoved(limit: number): Promise<RemovedItem[]> {
    const { results } = await this.d1
      .prepare("SELECT id, body, lang, remove_reason, created_at FROM requests WHERE status = 'removed' ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<{ id: string; body: string; lang: string; remove_reason: string | null; created_at: number }>();
    return results.map((r) => ({ id: r.id, body: r.body, lang: r.lang, removeReason: r.remove_reason, createdAt: r.created_at }));
  }

  async decide(d: Decision): Promise<boolean> {
    // Each batch is one transaction. The log line is written only if the change applied
    // (changes() is the number of rows the statement before it changed).
    const log = this.d1
      .prepare("INSERT INTO mod_log (request_id, action, moderator, note, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() > 0")
      .bind(d.id, d.action, d.moderator, d.removeReason ?? null, d.now);
    const statements: D1PreparedStatement[] = [];

    if (d.action === "publish" || d.action === "restore") {
      // A test post can never be published. Publishing starts the 30 days; re-publishing after reports does not.
      const from = d.action === "publish" ? "queued_at IS NOT NULL AND status IN ('held', 'published')" : "status = 'removed'";
      statements.push(
        this.d1
          .prepare(
            `INSERT INTO counters (name, value)
             SELECT 'requests_total', 1 FROM requests WHERE id = ? AND is_test = 0 AND published_at IS NULL AND ${from}
             ON CONFLICT (name) DO UPDATE SET value = value + 1`,
          )
          .bind(d.id),
        this.d1.prepare("DELETE FROM reports WHERE request_id = ?").bind(d.id),
        this.d1
          .prepare(
            `UPDATE requests SET status = 'published', decided_by = 'moderator', remove_reason = NULL,
               expires_at = CASE WHEN published_at IS NULL THEN ? ELSE expires_at END,
               published_at = COALESCE(published_at, ?),
               priority = 0, report_count = 0, escalated_by = NULL, queued_at = NULL
             WHERE id = ? AND is_test = 0 AND ${from}`,
          )
          .bind(d.now + THIRTY_DAYS, d.now, d.id),
      );
    } else if (d.action === "remove") {
      statements.push(
        this.d1
          .prepare(
            `UPDATE requests SET status = 'removed', decided_by = 'moderator', remove_reason = ?,
               priority = 0, escalated_by = NULL, queued_at = NULL, expires_at = ?
             WHERE id = ? AND status IN ('held', 'published')`,
          )
          .bind(d.removeReason ?? "other", d.now + THIRTY_DAYS, d.id),
      );
    } else {
      statements.push(
        this.d1.prepare("UPDATE requests SET escalated_by = ? WHERE id = ? AND queued_at IS NOT NULL AND status != 'removed'").bind(d.moderator, d.id),
      );
    }
    const results = await this.d1.batch([...statements, log]);
    return (results[results.length - 1]?.meta.changes ?? 0) > 0;
  }

  // ---- Reports ----

  async isOnWall(id: string, now: number): Promise<boolean> {
    const row = await this.d1
      .prepare(`SELECT 1 AS ok FROM requests WHERE id = ? AND ${VISIBLE}`)
      .bind(id, now)
      .first<{ ok: number }>();
    return row?.ok === 1;
  }

  async addReport(r: { requestId: string; who: string; device: string; reason: ReportReason; now: number }): Promise<boolean> {
    const [inserted] = await this.d1.batch([
      this.d1
        .prepare("INSERT OR IGNORE INTO reports (request_id, who, device, reason, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(r.requestId, r.who, r.device, r.reason, r.now),
      this.d1.prepare("UPDATE requests SET report_count = report_count + 1 WHERE id = ? AND changes() > 0").bind(r.requestId),
    ]);
    return (inserted?.meta.changes ?? 0) > 0;
  }

  async reportSpread(id: string): Promise<{ visitors: number; devices: number }> {
    const row = await this.d1
      .prepare("SELECT COUNT(DISTINCT who) AS visitors, COUNT(DISTINCT device) AS devices FROM reports WHERE request_id = ?")
      .bind(id)
      .first<{ visitors: number; devices: number }>();
    return { visitors: row?.visitors ?? 0, devices: row?.devices ?? 0 };
  }

  async reportersOf(id: string): Promise<string[]> {
    const { results } = await this.d1.prepare("SELECT who FROM reports WHERE request_id = ?").bind(id).all<{ who: string }>();
    return results.map((r) => r.who);
  }

  async pullBack(id: string, now: number, flagOnly: boolean): Promise<void> {
    await this.d1
      .prepare(
        `UPDATE requests SET status = CASE WHEN ? THEN status ELSE 'held' END, hold_reason = 'reported',
           priority = MAX(priority, 1), queued_at = COALESCE(queued_at, ?)
         WHERE id = ? AND status = 'published'`,
      )
      .bind(flagOnly ? 1 : 0, now, id)
      .run();
  }

  async getState(name: string): Promise<number | null> {
    const row = await this.d1.prepare("SELECT value FROM counters WHERE name = ?").bind(name).first<{ value: number }>();
    return row?.value ?? null;
  }

  async setState(name: string, value: number): Promise<void> {
    await this.d1
      .prepare("INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value")
      .bind(name, value)
      .run();
  }
}
