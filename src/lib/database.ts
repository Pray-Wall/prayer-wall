// SPDX-License-Identifier: AGPL-3.0-or-later

/** A published request as the wall shows it. */
export type WallRequest = {
  id: string;
  kind: "self" | "other" | "event";
  displayName: string | null;
  body: string;
  lang: string;
  /** ISO country code the author chose, if any. */
  country: string | null;
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

export type RequestStatus = "held" | "published" | "removed";

/** Why a request is waiting for a moderator. */
export type HoldReason = "review_all" | "soft_limit" | "duplicate" | "bot_check_unavailable" | "bot_check_misconfigured";

export type NewRequest = {
  id: string;
  ownerHash: string;
  kind: WallRequest["kind"];
  displayName: string | null;
  body: string;
  lang: string;
  country: string | null;
  status: RequestStatus;
  holdReason: HoldReason | null;
  bodyHash: string;
  posterHash: string;
  createdAt: number;
  expiresAt: number;
};

/** A request as its author sees it on the private page. */
export type OwnRequest = {
  id: string;
  kind: WallRequest["kind"];
  displayName: string | null;
  body: string;
  lang: string;
  status: RequestStatus;
  removeReason: string | null;
  prayedCount: number;
  answeredAt: number | null;
  extended: boolean;
  expiresAt: number;
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

  createRequest(request: NewRequest): Promise<void>;
  /** How many requests with this text hash were created at or after `since`, whatever their status. */
  countByBodyHash(bodyHash: string, since: number): Promise<number>;
  findByOwnerHash(ownerHash: string): Promise<OwnRequest | null>;
  /** Marks the request answered. False when there was nothing to change. */
  markAnswered(ownerHash: string, now: number): Promise<boolean>;
  /** Adds `seconds` to a published, unexpired request's life, once only. False when not allowed. */
  extendOnce(ownerHash: string, seconds: number, now: number): Promise<boolean>;
  /** A real delete, not a hidden flag. False when no such request exists. */
  deleteByOwnerHash(ownerHash: string): Promise<boolean>;
}
