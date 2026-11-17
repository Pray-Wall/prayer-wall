// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, OwnRequest } from "./database";
import { dailyHasher, extractToken, ownerHash } from "./hashes";
import type { RateLimiter } from "./services";

export const LOOKUPS_PER_HOUR = 30;
export const EXTENSION_SECONDS = 30 * 86400;

export type MineAction = "view" | "answered" | "extend" | "delete" | "delete_confirm";
export type MineStatus = "held" | "published" | "removed" | "expired";

export type MineResult =
  | { state: "too_many" }
  | { state: "not_found" }
  | { state: "deleted"; token: string }
  | { state: "confirm_delete"; token: string; request: OwnRequest }
  | { state: "found"; token: string; request: OwnRequest; status: MineStatus; done: "answered" | "extended" | null };

export function statusOf(r: OwnRequest, now: number): MineStatus {
  if (r.status === "removed") return "removed";
  return r.expiresAt <= now ? "expired" : r.status;
}

export function parseAction(value: string | undefined): MineAction {
  return value === "answered" || value === "extend" || value === "delete" || value === "delete_confirm" ? value : "view";
}

type Deps = { db: Database; limiter: RateLimiter; masterSecret: string };

/** Looks up the author's request by the private token and applies one action. */
export async function openMine(deps: Deps, rawToken: string | undefined, action: MineAction, ip: string, now: number): Promise<MineResult> {
  const visitor = await (await dailyHasher(deps.masterSecret, now)).visitor(ip);
  if ((await deps.limiter.hit(`mine:${visitor}`, 3600, now)) > LOOKUPS_PER_HOUR) return { state: "too_many" };

  const token = extractToken(rawToken);
  if (!token) return { state: "not_found" };
  const owner = await ownerHash(token);

  let done: "answered" | "extended" | null = null;
  if (action === "delete_confirm") {
    return (await deps.db.deleteByOwnerHash(owner)) ? { state: "deleted", token } : { state: "not_found" };
  }
  if (action === "answered" && (await deps.db.markAnswered(owner, now))) done = "answered";
  if (action === "extend" && (await deps.db.extendOnce(owner, EXTENSION_SECONDS, now))) done = "extended";

  const request = await deps.db.findByOwnerHash(owner);
  if (!request) return { state: "not_found" };
  if (action === "delete") return { state: "confirm_delete", token, request };
  return { state: "found", token, request, status: statusOf(request, now), done };
}
