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
  answeredAt: number | null;
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
export type HoldReason =
  | "review_all" | "soft_limit" | "duplicate" | "bot_check_unavailable" | "bot_check_misconfigured" | "reported"
  | "classifier" | "classifier_failed" | "crisis" | "unattended";

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
  /** Classifier result: shown to moderators; for a held request also the shadow result. */
  category: string | null;
  confidence: number | null;
  crisis: boolean;
  /** 0 normal, 2 crisis. */
  priority: number;
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
  crisis: boolean;
  prayedCount: number;
  answeredAt: number | null;
  extended: boolean;
  expiresAt: number;
};

export type ReportReason = "spam" | "money" | "personal" | "hateful" | "other";

/** A request waiting for a moderator, with everything the queue shows. */
export type QueueItem = {
  id: string;
  kind: WallRequest["kind"];
  displayName: string | null;
  body: string;
  lang: string;
  country: string | null;
  /** "held", or "published" for a request that reports flagged without hiding it. */
  status: RequestStatus;
  holdReason: HoldReason | null;
  /** 0 normal, 1 reported or flagged, 2 crisis. */
  priority: number;
  queuedAt: number;
  createdAt: number;
  escalatedBy: string | null;
  crisis: boolean;
  /** Classifier result; null when the classifier was not run or failed. */
  category: string | null;
  confidence: number | null;
  isTest: boolean;
  /** How many other requests from the same daily visitor hash are held or removed. A number only. */
  sameDayOthers: number;
  /** Report reasons with their counts. */
  reports: Partial<Record<ReportReason, number>>;
};

export type RemovedItem = { id: string; body: string; lang: string; removeReason: string | null; createdAt: number };

export type ModAction = "publish" | "remove" | "restore" | "escalate" | "mark_crisis";

export type Decision = { id: string; action: ModAction; moderator: string; removeReason?: string; now: number };

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

  /** One published, unexpired, non-test request, or null. */
  getPublished(id: string, now: number): Promise<WallRequest | null>;

  // ---- Prayers ----

  /**
   * Records one tap. `who` is the daily device hash (or the visitor hash), `vhash` the daily visitor hash.
   * A second tap with the same `who` on the same request changes nothing. When `counted` is false the tap
   * is stored but adds nothing. Reach rises only for the first counted prayer from `vhash`.
   * Returns the count to show, or null when the request is not on the wall.
   */
  recordPrayer(p: { requestId: string; who: string; vhash: string; counted: boolean; now: number }): Promise<number | null>;
  /** How many counted prayers this visitor hash has given this request (today, since hashes are daily). */
  countedFromVisitor(requestId: string, vhash: string): Promise<number>;
  /** Counts and answered flags for published requests among `ids`. Unknown or unpublished ids are left out. */
  statusOf(ids: string[], now: number): Promise<{ id: string; prayed: number; answered: boolean }[]>;
  /** The hourly clean-up. Returns how many requests were deleted. */
  cleanUp(now: number): Promise<number>;

  // ---- Moderation ----

  /** The queue: crisis first, then reported, then oldest first. `skip` ids are left out. */
  listQueue(limit: number, skip: string[]): Promise<QueueItem[]>;
  /** How many items wait, and when the oldest held one entered the queue. */
  queueSummary(): Promise<{ waiting: number; oldestHeldQueuedAt: number | null }>;
  /** When a moderator last decided anything, or null if never. */
  lastModeratorActionAt(): Promise<number | null>;
  listRemoved(limit: number): Promise<RemovedItem[]>;
  /**
   * Applies a moderator's decision and writes it to the log in one step.
   * False when it did not apply (wrong state, unknown id, or a test post that may never be published).
   */
  decide(decision: Decision): Promise<boolean>;

  // ---- Reports ----

  /** True when the request is on the wall right now. */
  isOnWall(id: string, now: number): Promise<boolean>;
  /** Stores one report per visitor per request. False when this visitor had already reported it. */
  addReport(report: { requestId: string; who: string; device: string; reason: ReportReason; now: number }): Promise<boolean>;
  /** How many different visitors and different devices have reported the request. */
  reportSpread(id: string): Promise<{ visitors: number; devices: number }>;
  /** The visitor hashes that reported the request. */
  reportersOf(id: string): Promise<string[]>;
  /** Puts a published request in the queue: hidden from the wall, or only flagged when `flagOnly`. */
  pullBack(id: string, now: number, flagOnly: boolean): Promise<void>;

  /** How many requests were created at or after `since`, whatever their status. */
  countCreatedSince(since: number): Promise<number>;
  logEvent(kind: string, actor: string, note: string | null, now: number): Promise<void>;
  /** Shadow running: the classifier's result beside each moderator's decision. */
  shadowReport(since: number): Promise<{ shadow: string | null; action: string; n: number }[]>;

  /** Small named numbers, such as a breaker's end time. */
  getState(name: string): Promise<number | null>;
  setState(name: string, value: number): Promise<void>;
}
