// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Database, HoldReason } from "./database";
import { bodyHash, dailyHasher, newOwnerToken, newRequestId, ownerHash } from "./hashes";
import { isCountry, isRequestLang } from "./i18n";
import { checkDraft, type RuleError } from "./rules";
import type { BotCheck, RateLimiter } from "./services";

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
} as const;

/** `auto` is not built until M5 and behaves as `review_all` until then. */
export type Mode = "review_all" | "auto" | "closed";

export type PostInput = {
  kind: string;
  name: string;
  body: string;
  lang: string;
  country: string;
  deviceId: string | null;
  botResponse: string | undefined;
  ip: string;
};

export type PostResult =
  | { ok: true; token: string; id: string; holdReason: HoldReason }
  | { ok: false; error: RuleError | "bot" | "too_many" };

export type PostingDeps = {
  db: Database;
  limiter: RateLimiter;
  botCheck: BotCheck;
  masterSecret: string;
};

export async function submitRequest(deps: PostingDeps, input: PostInput, now: number): Promise<PostResult> {
  // 1. Bot check. If the service cannot be reached, or our own secret is wrong, the post is held, not refused.
  const verdict = await deps.botCheck.verify(input.botResponse);
  if (verdict === "fail") return { ok: false, error: "bot" };

  // 2. Fixed text rules: refuse with the reason; nothing has been stored or counted yet.
  const broken = checkDraft(input);
  if (broken) return { ok: false, error: broken };

  // 3. Limits. Soft limits hold; only the hard daily limit refuses.
  const hash = await dailyHasher(deps.masterSecret, now);
  const visitor = await hash.visitor(input.ip);
  const today = await deps.limiter.hit(`post:day:${visitor}`, DAY, now);
  if (today > LIMITS.perVisitorDayHard) return { ok: false, error: "too_many" };
  const thisHour = await deps.limiter.hit(`post:hour:${visitor}`, HOUR, now);
  let overSoftLimit = today > LIMITS.perVisitorDaySoft || thisHour > LIMITS.perVisitorHour;
  if (input.deviceId) {
    // The device id is never attached to the request; only its daily hash keys a short-lived counter.
    const device = await hash.device(input.deviceId);
    if ((await deps.limiter.hit(`post:device:${device}`, DAY, now)) > LIMITS.perDeviceDay) overSoftLimit = true;
  }

  // 4. Duplicates: the same text twice in 24 hours is fine; the third is held as a duplicate.
  const body = input.body.trim();
  const textHash = await bodyHash(deps.masterSecret, body);
  const duplicate = (await deps.db.countByBodyHash(textHash, now - DAY)) >= LIMITS.sameTextIn24h;

  // 5. Decision. In review_all every request is held; the reason tells the moderator why.
  // A wrong Turnstile secret comes first: it means no bot check is running, which the operator
  // must see even when another reason also applies.
  const holdReason: HoldReason =
    verdict === "misconfigured" ? "bot_check_misconfigured"
    : duplicate ? "duplicate"
    : overSoftLimit ? "soft_limit"
    : verdict === "unavailable" ? "bot_check_unavailable"
    : "review_all";

  const token = newOwnerToken();
  const id = newRequestId();
  const name = input.name.trim();
  await deps.db.createRequest({
    id,
    ownerHash: await ownerHash(token),
    kind: input.kind as "self" | "other" | "event",
    displayName: name === "" ? null : name,
    body,
    lang: isRequestLang(input.lang) ? input.lang : "und",
    country: isCountry(input.country) ? input.country : null,
    status: "held",
    holdReason,
    bodyHash: textHash,
    posterHash: visitor,
    createdAt: now,
    expiresAt: now + LIMITS.heldLifetime,
  });
  return { ok: true, token, id, holdReason };
}
