// SPDX-License-Identifier: AGPL-3.0-or-later
// Security headers for every response the Worker makes. Static files get the same set from public/_headers.

const TURNSTILE = "https://challenges.cloudflare.com";

export const CSP = [
  "default-src 'self'",
  `script-src 'self' ${TURNSTILE}`,
  `frame-src ${TURNSTILE}`,
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  // Same-origin pages get the full referrer; other sites get none, so a request page never leaks.
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
};

/** Paths search engines must never index, whatever the page says. */
export function noindexPath(path: string): boolean {
  return path.startsWith("/mod") || path.startsWith("/api/") || path.startsWith("/healthz") || /^\/[a-z]{2}\/(mine|new|r\/)/.test(path) || path.startsWith("/r/");
}
