// SPDX-License-Identifier: AGPL-3.0-or-later
// Small interfaces for platform features other than storage.

export interface RateLimiter {
  /**
   * Adds one to the counter for `key` in the fixed window that contains `now`
   * and returns the new count. Windows start at multiples of `windowSeconds`.
   */
  hit(key: string, windowSeconds: number, now: number): Promise<number>;
  /** The current count for `key` in the window that contains `now`, without adding to it. */
  peek(key: string, windowSeconds: number, now: number): Promise<number>;
}

/**
 * "unavailable": the service could not be reached. "misconfigured": it answered that our own
 * secret is wrong. Neither is the visitor's fault, so the post is held, not refused.
 */
export type BotVerdict = "pass" | "fail" | "unavailable" | "misconfigured";

export interface BotCheck {
  /** Public key for the widget on the posting form. */
  readonly siteKey: string;
  /** Verifies the response the widget put in the form. See BotVerdict. */
  verify(response: string | undefined): Promise<BotVerdict>;
}

export interface ModeratorAuth {
  /** The signed-in moderator's identity (an email address), or null when the request is not signed in. */
  identify(request: Request): Promise<string | null>;
}

export type AlertKind =
  | "queue_waiting" | "unattended" | "report_breaker" | "test"
  | "crisis" | "crisis_overdue" | "posting_burst" | "classifier_errors" | "model_unavailable" | "self_test";

export interface Alerter {
  /** Sends a short operational message to the moderators. It must never contain request text. */
  send(kind: AlertKind, text: string): Promise<void>;
}

/** One call to one model. Throws when the model is unavailable or the call fails. */
export interface ModelRunner {
  run(model: string, system: string, user: string): Promise<unknown>;
}
