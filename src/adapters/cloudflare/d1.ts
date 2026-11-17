// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, ListPublishedOptions, WallRequest } from "../../lib/database";

type Row = {
  id: string;
  kind: WallRequest["kind"];
  display_name: string | null;
  body: string;
  lang: string;
  prayed_count: number;
  reach_count: number;
  published_at: number;
};

const VISIBLE = "status = 'published' AND is_test = 0 AND expires_at > ?";
const COLUMNS = "id, kind, display_name, body, lang, prayed_count, reach_count, published_at";

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
}
