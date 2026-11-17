// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AlertKind, Alerter } from "../lib/services";

/**
 * Posts alerts to a chat webhook. The body carries both `text` and `content`, which is what
 * Slack-style and Discord-style webhooks read. A failed alert must never break the request
 * that caused it, so errors are swallowed.
 */
export class WebhookAlerter implements Alerter {
  constructor(
    private readonly url: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async send(kind: AlertKind, text: string): Promise<void> {
    const message = `Prayer Wall [${kind}]: ${text}`;
    try {
      await this.fetcher(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message, content: message }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Nothing useful can be done here.
    }
  }
}

/** Used when no webhook is configured: alerts go nowhere. */
export const silentAlerter: Alerter = { send: async () => {} };
