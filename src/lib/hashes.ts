// SPDX-License-Identifier: AGPL-3.0-or-later
// All hashing in one place. Nothing here stores or logs its inputs.

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(key: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? enc.encode(key) : key;
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(message));
}

export async function sha256Hex(message: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(message)));
}

export function utcDate(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Daily hashes: HMAC(daily_key, value) where daily_key = HMAC(master_secret, UTC date).
 * Enough to limit abuse within one day; cannot be linked across days or turned back into the value.
 */
export async function dailyHasher(masterSecret: string, nowSeconds: number) {
  const dailyKey = await hmac(masterSecret, `daily:${utcDate(nowSeconds)}`);
  return {
    /** The daily visitor hash, made from the network address. */
    visitor: async (ip: string) => hex(await hmac(dailyKey, `ip:${ip}`)).slice(0, 32),
    /** The daily hash of the browser's random device id. */
    device: async (deviceId: string) => hex(await hmac(dailyKey, `device:${deviceId}`)).slice(0, 32),
  };
}

/** NFKC, lower case, single spaces: so trivial edits do not defeat duplicate detection. */
export function normaliseBody(body: string): string {
  return body.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

/** Keyed hash of the normalised text, for duplicate detection. Not daily: duplicates span midnight. */
export async function bodyHash(masterSecret: string, body: string): Promise<string> {
  return hex(await hmac(masterSecret, `body:${normaliseBody(body)}`)).slice(0, 32);
}

/** Only this hash of the private link token is stored. */
export function ownerHash(token: string): Promise<string> {
  return sha256Hex(`owner:${token}`);
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** 12 random base32 characters: the public id of a request. */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => B32[b & 31]).join("");
}

/** 128 random bits, shown once to the author. */
export function newOwnerToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Accepts the bare token or the whole private link, and returns the token or null. */
export function extractToken(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = input.trim();
  const candidate = s.includes("#") ? s.slice(s.lastIndexOf("#") + 1) : s;
  return TOKEN_PATTERN.test(candidate) ? candidate : null;
}
