// SPDX-License-Identifier: AGPL-3.0-or-later
import { RESPONSE_SCHEMA } from "../../lib/classifier-prompt";
import type { ModelRunner } from "../../lib/services";

type AiBinding = { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };

/** Workers AI through the `AI` binding. Request text stays with Cloudflare. */
export class WorkersAiRunner implements ModelRunner {
  constructor(private readonly ai: AiBinding) {}

  async run(model: string, system: string, user: string): Promise<unknown> {
    const out = (await this.ai.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
      max_tokens: 80,
      temperature: 0,
    })) as { response?: unknown } | null;
    if (!out || out.response === undefined) throw new Error("empty response");
    return out.response;
  }
}
