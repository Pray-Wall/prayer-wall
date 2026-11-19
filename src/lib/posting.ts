// SPDX-License-Identifier: AGPL-3.0-or-later
import { FIXABLE, wouldPublish, type Category, type Verdict } from "./classifier-prompt";
import { classify, type ClassifierDeps } from "./classifier";
import type { Database, HoldReason } from "./database";
import { bodyHash, dailyHasher, newOwnerToken, newRequestId, ownerHash } from "./hashes";
import { isCountry } from "./i18n";
import { notePost, type Mode } from "./operating";
import { checkDraft, type RuleError } from "./rules";
import type { Alerter, BotCheck, RateLimiter } from "./services";

export type { Mode } from "./operating";

const HOUR = 3600;
const DAY = 86400;

/** Posting limits: soft limits hold a post for review, the hard limit refuses it (blueprint, "Posts"). */
export const LIMITS = {
  perDeviceDay: 3,
  perVisitorHour: 5,
  perVisitorDaySoft: 10,
  perVisitorDayHard: 60,
  sameTextIn24h: 2,
  /** A held request nobody reviewed is deleted after this long. */
  heldLifetime: 14 * DAY,
  /** A published request stays this long. */
  publishedLifetime: 30 * DAY,
} as const;

export type PostInput = {
  kind: string;
  name: string;
  body: string;
  /** The interface language of the page the request was posted from. */
  lang: string;
  country: string;
  deviceId: string | null;
  botResponse: string | undefined;
  ip: string;
  /**
   * 1 for a first try. 2 after the author saw the revise prompt and edited: a second fixable result is
   * held without another prompt. "as_is" when the author chose "Send it for review as it is".
   */
  attempt: 1 | 2 | "as_is";
};

/** The thresholds fixed when the classifier passed its gate. */
export type Thresholds = { normal: number; strict: number };

export type PostResult =
  | {
      ok: true;
      token: string;
      id: string;
      /** "published" in `auto` mode when the classifier was sure; otherwise held for a person. */
      status: "published" | "held";
      holdReason: HoldReason | null;
      /** Show the support panel. Never say why. */
      crisis: boolean;
      /** In `unattended`, a request the site cannot show and no person can review soon. */
      declined: boolean;
    }
  | { ok: false; error: RuleError | "bot" | "too_many"; crisis: boolean }
  /** Ask the author once to revise; nothing is stored or counted. */
  | { ok: false; revise: Category; crisis: false };

export type PostingDeps = {
  db: Database;
  limiter: RateLimiter;
  botCheck: BotCheck;
  masterSecret: string;
  alerter: Alerter;
  /** Null when no classifier is configured: every request is held, as on a classifier failure. */
  classifier: Omit<ClassifierDeps, "limiter" | "alerter"> | null;
  /** The effective mode (a breaker may have switched `auto` to `review_all`). */
  mode: Mode;
  /** The configured mode, for the posting breaker. */
  configuredMode: Mode;
  thresholds: Thresholds;
  /** True when no moderator has acted for 48 hours, or the weekly self-test forced the stricter threshold. */
  strict: boolean;
  unattended: boolean;
};

export async function submitRequest(deps: PostingDeps, input: PostInput, now: number): Promise<PostResult> {
  const kind = input.kind as "self" | "other" | "event";
  const body = input.body.trim();
  const name = input.name.trim();
  const ask = (text: string) =>
    deps.classifier
      ? classify({ ...deps.classifier, limiter: deps.limiter, alerter: deps.alerter }, { text, kind: ["self", "other", "event"].includes(kind) ? kind : "self", name: name || null }, now)
      : Promise.resolve(null);

  // 1. Bot check. If the service cannot be reached, or our own secret is wrong, the post is held, not refused.
  const bot = await deps.botCheck.verify(input.botResponse);
  if (bot === "fail") return { ok: false, error: "bot", crisis: false };

  // 2. Fixed text rules refuse with the reason; nothing is stored or counted. A refused post is still
  //    asked one question, "is this a crisis?", so the author sees the support panel beside the reason.
  const broken = checkDraft(input);
  if (broken) {
    const crisis = broken !== "empty" && broken !== "kind" && ((await ask(body))?.verdict.crisis ?? false);
    return { ok: false, error: broken, crisis };
  }

  // 3. The classifier. It runs in every mode: in `review_all` its result is stored as the shadow result.
  const result = await ask(body);
  const verdict: Verdict | null = result?.verdict ?? null;
  const crisis = verdict?.crisis ?? false;
  const auto = deps.mode === "auto";

  // 4. In `auto`, a fixable result on the first try comes back to the author, once (Revision 2.2, change 1).
  if (auto && !crisis && verdict && FIXABLE.includes(verdict.category) && input.attempt === 1) {
    return { ok: false, revise: verdict.category, crisis: false };
  }

  // 5. Limits. Soft limits hold; only the hard daily limit refuses.
  const hash = await dailyHasher(deps.masterSecret, now);
  const visitor = await hash.visitor(input.ip);
  const today = await deps.limiter.hit(`post:day:${visitor}`, DAY, now);
  if (today > LIMITS.perVisitorDayHard) return { ok: false, error: "too_many", crisis };
  const thisHour = await deps.limiter.hit(`post:hour:${visitor}`, HOUR, now);
  let overSoftLimit = today > LIMITS.perVisitorDaySoft || thisHour > LIMITS.perVisitorHour;
  if (input.deviceId) {
    // The device id is never attached to the request; only its daily hash keys a short-lived counter.
    const device = await hash.device(input.deviceId);
    if ((await deps.limiter.hit(`post:device:${device}`, DAY, now)) > LIMITS.perDeviceDay) overSoftLimit = true;
  }

  // 6. Duplicates: the same text twice in 24 hours is fine; the third is held as a duplicate.
  const textHash = await bodyHash(deps.masterSecret, body);
  const duplicate = (await deps.db.countByBodyHash(textHash, now - DAY)) >= LIMITS.sameTextIn24h;

  // 7. Decision. A wrong Turnstile secret is reported first, so the operator sees it whatever else applies.
  const threshold = deps.strict || deps.unattended ? deps.thresholds.strict : deps.thresholds.normal;
  const publish =
    auto && bot === "pass" && !overSoftLimit && !duplicate && input.attempt !== "as_is" && wouldPublish(verdict, { threshold }, body);
  const holdReason: HoldReason | null = publish
    ? null
    : bot === "misconfigured" ? "bot_check_misconfigured"
    : crisis ? "crisis"
    : duplicate ? "duplicate"
    : overSoftLimit ? "soft_limit"
    : bot === "unavailable" ? "bot_check_unavailable"
    : !auto ? "review_all"
    : verdict === null ? "classifier_failed"
    : deps.unattended ? "unattended"
    : "classifier";

  const token = newOwnerToken();
  const id = newRequestId();
  await deps.db.createRequest({
    id,
    ownerHash: await ownerHash(token),
    kind,
    displayName: name === "" ? null : name,
    body,
    lang: input.lang,
    country: isCountry(input.country) ? input.country : null,
    status: publish ? "published" : "held",
    holdReason,
    bodyHash: textHash,
    posterHash: visitor,
    createdAt: now,
    expiresAt: now + (publish ? LIMITS.publishedLifetime : LIMITS.heldLifetime),
    category: verdict?.category ?? null,
    confidence: verdict?.confidence ?? null,
    crisis,
    priority: crisis ? 2 : 0,
  });

  // 8. Crisis requests reach the moderators at once. Alerts never contain request text.
  if (crisis) await deps.alerter.send("crisis", "A crisis request is waiting at the top of the queue.");
  await notePost({ db: deps.db, limiter: deps.limiter, alerter: deps.alerter }, deps.configuredMode, now);

  return {
    ok: true,
    token,
    id,
    status: publish ? "published" : "held",
    holdReason,
    crisis,
    declined: holdReason === "unattended",
  };
}
