// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ModeratorAuth } from "../../lib/services";

type Jwk = JsonWebKey & { kid?: string };

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (part: string): unknown => JSON.parse(new TextDecoder().decode(b64url(part)));

/**
 * Cloudflare Access. Access sits in front of /mod and adds a signed token to each request;
 * this checks the signature, the audience, the issuer and the expiry itself, so a request
 * that reaches the Worker some other way is never trusted.
 */
export class CloudflareAccessAuth implements ModeratorAuth {
  private keys: { at: number; byKid: Map<string, Jwk> } | null = null;

  /**
   * @param teamDomain e.g. "https://example.cloudflareaccess.com"
   * @param audience   the Access application's AUD tag
   */
  constructor(
    private readonly teamDomain: string,
    private readonly audience: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
    private readonly clock: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  private async key(kid: string): Promise<Jwk | undefined> {
    const now = this.clock();
    // Signing keys rotate; cache them for an hour, and look again for a key not seen before.
    if (!this.keys || now - this.keys.at > 3600 || !this.keys.byKid.has(kid)) {
      const res = await this.fetcher(`${this.teamDomain}/cdn-cgi/access/certs`);
      if (!res.ok) return undefined;
      const body = (await res.json()) as { keys?: Jwk[] };
      this.keys = { at: now, byKid: new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid!, k])) };
    }
    return this.keys.byKid.get(kid);
  }

  async identify(request: Request): Promise<string | null> {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return null;
    try {
      const [h, p, sig, extra] = token.split(".");
      if (!h || !p || !sig || extra !== undefined) return null;
      const header = json(h) as { alg?: string; kid?: string };
      if (header.alg !== "RS256" || !header.kid) return null;
      const jwk = await this.key(header.kid);
      if (!jwk) return null;
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
      if (!valid) return null;

      const claims = json(p) as { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
      const now = this.clock();
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(this.audience)) return null;
      if (claims.iss !== this.teamDomain) return null;
      if (typeof claims.exp !== "number" || claims.exp <= now) return null;
      if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;
      return typeof claims.email === "string" && claims.email.includes("@") ? claims.email.toLowerCase() : null;
    } catch {
      return null;
    }
  }
}
