// SPDX-License-Identifier: AGPL-3.0-or-later

/** A published request as the wall shows it. */
export type WallRequest = {
  id: string;
  kind: "self" | "other" | "event";
  displayName: string | null;
  body: string;
  lang: string;
  prayedCount: number;
  reachCount: number;
  publishedAt: number;
};

/** Position after the last row of a page; rows strictly after it come next. */
export type WallCursor =
  | { order: "need"; reach: number; publishedAt: number; id: string }
  | { order: "new"; publishedAt: number; id: string };

export type ListPublishedOptions = {
  /** "need": fewest reach first, oldest first on ties. "new": newest first. */
  order: "need" | "new";
  /** Only requests published at or after this time (Unix seconds). */
  since?: number;
  after?: WallCursor;
  limit: number;
  /** Current time; requests that have expired are left out. */
  now: number;
};

/**
 * The app talks to storage only through this interface, so a self-hoster
 * can swap the Cloudflare adapter for another one (blueprint: "Rules for the code").
 * It grows one method at a time as milestones need them.
 */
export interface Database {
  /** Resolves true when the database answers a trivial query. */
  ping(): Promise<boolean>;
  /** Published, unexpired, non-test requests in the given order. */
  listPublished(options: ListPublishedOptions): Promise<WallRequest[]>;
  /** For each cutoff, how many published, unexpired, non-test requests were published at or after it. */
  countPublishedSince(cutoffs: number[], now: number): Promise<number[]>;
}
