// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AlertKind, Alerter } from "../lib/services";

/**
 * Sends alerts as Telegram messages through a bot. The bot token and the chat id are Worker
 * secrets. A failed alert must never break the request that caused it, so errors are swallowed.
 */
export class TelegramAlerter implements Alerter {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async send(kind: AlertKind, text: string): Promise<void> {
    try {
      await this.fetcher(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text: `Prayer Wall [${kind}]: ${text}`, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Nothing useful can be done here.
    }
  }
}
