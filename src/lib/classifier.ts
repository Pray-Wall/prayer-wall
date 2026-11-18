// SPDX-License-Identifier: AGPL-3.0-or-later
import { SYSTEM_PROMPT, parseVerdict, userMessage, type Verdict } from "./classifier-prompt";
import type { Alerter, ModelRunner, RateLimiter } from "./services";

const TEN_MINUTES = 600;

export type ClassifierDeps = { runner: ModelRunner; models: string[]; limiter: RateLimiter; alerter: Alerter };

/**
 * Asks the configured models in order (Revision 2.2, change 3). A model that fails or answers
 * nonsense is skipped and the maintainer is alerted (once a day per model). Returns null when every
 * model fails; the pipeline then holds the request.
 */
export async function classify(
  deps: ClassifierDeps,
  input: { text: string; kind: "self" | "other" | "event"; name: string | null },
  now: number,
): Promise<{ verdict: Verdict; model: string } | null> {
  const user = userMessage(input.text, input.kind, input.name);
  await deps.limiter.hit("clf:calls", TEN_MINUTES, now);
  for (const model of deps.models) {
    try {
      const verdict = parseVerdict(await deps.runner.run(model, SYSTEM_PROMPT, user));
      if (verdict) return { verdict, model };
    } catch {
      // try the next model
    }
    if ((await deps.limiter.hit(`alert:model:${model}`, 86400, now)) === 1) {
      await deps.alerter.send("model_unavailable", `The classifier model ${model} failed; the next one on the list was used.`);
    }
  }
  // The classifier breaker: errors above 20% of at least 10 calls in 10 minutes.
  const errors = await deps.limiter.hit("clf:errors", TEN_MINUTES, now);
  const calls = await deps.limiter.peek("clf:calls", TEN_MINUTES, now);
  if (calls >= 10 && errors / calls > 0.2 && (await deps.limiter.hit("alert:clf_errors", 1800, now)) === 1) {
    await deps.alerter.send("classifier_errors", `The classifier failed ${errors} of ${calls} calls in 10 minutes. Every new request is being held.`);
  }
  return null;
}
