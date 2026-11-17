// SPDX-License-Identifier: AGPL-3.0-or-later
// Small interfaces for platform features other than storage.

export interface RateLimiter {
  /**
   * Adds one to the counter for `key` in the fixed window that contains `now`
   * and returns the new count. Windows start at multiples of `windowSeconds`.
   */
  hit(key: string, windowSeconds: number, now: number): Promise<number>;
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
