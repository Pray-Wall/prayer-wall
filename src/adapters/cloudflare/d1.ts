// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database } from "../../lib/database";

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
}
