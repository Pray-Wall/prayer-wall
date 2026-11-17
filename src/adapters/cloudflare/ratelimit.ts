// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RateLimiter } from "../../lib/services";

/**
 * Counters in the `rate_limits` table. The Workers rate-limiting binding only offers
 * 10- and 60-second windows counted per location, so it cannot express hourly or daily limits.
 */
export class D1RateLimiter implements RateLimiter {
  constructor(private readonly d1: D1Database) {}

  async hit(key: string, windowSeconds: number, now: number): Promise<number> {
    const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
    const row = await this.d1
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(key, windowStart)
      .first<{ count: number }>();
    return row?.count ?? 1;
  }
}
