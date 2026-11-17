// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, ListPublishedOptions, NewRequest, OwnRequest, RequestStatus, WallRequest } from "../../lib/database";

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
};

const VISIBLE = "status = 'published' AND is_test = 0 AND expires_at > ?";
const COLUMNS = "id, kind, display_name, body, lang, country, prayed_count, reach_count, published_at";

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
    return results.map((r) => ({
      id: r.id,
      kind: r.kind,
      displayName: r.display_name,
      body: r.body,
      lang: r.lang,
      country: r.country,
      prayedCount: r.prayed_count,
      reachCount: r.reach_count,
      publishedAt: r.published_at,
    }));
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
           body_hash, poster_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.id, r.ownerHash, r.kind, r.displayName, r.body, r.lang, r.country, r.status, r.holdReason,
        r.bodyHash, r.posterHash, r.createdAt, r.expiresAt)
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
}
