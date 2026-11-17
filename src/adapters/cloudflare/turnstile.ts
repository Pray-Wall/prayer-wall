// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BotCheck, BotVerdict } from "../../lib/services";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare Turnstile. The visitor's network address is not sent with the verification. */
export class TurnstileBotCheck implements BotCheck {
  constructor(
    readonly siteKey: string,
    private readonly secret: string,
    // Wrapped, not stored bare: the runtime's fetch throws "Illegal invocation" when it is
    // called as a method of another object, which made every verification look unreachable.
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async verify(response: string | undefined): Promise<BotVerdict> {
    if (!response) return "fail";
    try {
      const res = await this.fetcher(VERIFY_URL, {
        method: "POST",
        body: new URLSearchParams({ secret: this.secret, response }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return "unavailable";
      const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
      if (data.success === true) return "pass";
      const codes = data["error-codes"] ?? [];
      // Our secret is missing or wrong: the check is not running at all, and the operator must find out.
      if (codes.some((c) => c.includes("secret"))) return "misconfigured";
      return codes.includes("internal-error") ? "unavailable" : "fail";
    } catch {
      return "unavailable";
    }
  }
}
