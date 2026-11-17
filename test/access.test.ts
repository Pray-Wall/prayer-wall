// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeAll, describe, expect, it } from "vitest";
import { CloudflareAccessAuth } from "../src/adapters/cloudflare/access";
import { WebhookAlerter } from "../src/adapters/webhook-alerter";

const TEAM = "https://prayer-wall-test.cloudflareaccess.com";
const AUD = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000;

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let signer: CryptoKey;
let stranger: CryptoKey;
let jwks: { keys: JsonWebKey[] };

beforeAll(async () => {
  const make = async () =>
    (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true, ["sign", "verify"],
    )) as CryptoKeyPair;
  const pair = await make();
  signer = pair.privateKey;
  stranger = (await make()).privateKey;
  jwks = { keys: [{ ...((await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey), kid: "key-1" } as JsonWebKey] };
});

async function token(claims: Record<string, unknown>, options: { key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const head = b64url(JSON.stringify({ alg: options.alg ?? "RS256", kid: options.kid ?? "key-1", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", options.key ?? signer, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

const good = { aud: [AUD], iss: TEAM, exp: NOW + 600, iat: NOW - 10, nbf: NOW - 10, email: "Moderator@Example.org" };

function auth() {
  let fetches = 0;
  const instance = new CloudflareAccessAuth(TEAM, AUD, (async (url: unknown) => {
    fetches++;
    expect(String(url)).toBe(`${TEAM}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify(jwks));
  }) as typeof fetch, () => NOW);
  const identify = (jwt: string | null) =>
    instance.identify(new Request("https://wall.example/mod", { headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {} }));
  return { identify, fetches: () => fetches };
}

describe("Cloudflare Access sign-in", () => {
  it("accepts a valid token and returns the moderator's address", async () => {
    const a = auth();
    expect(await a.identify(await token(good))).toBe("moderator@example.org");
    expect(await a.identify(await token({ ...good, aud: AUD }))).toBe("moderator@example.org");
    // The signing keys are fetched once and then cached.
    expect(a.fetches()).toBe(1);
  });

  it("refuses a request with no token", async () => {
    expect(await auth().identify(null)).toBeNull();
  });

  it.each([
    ["signed by someone else", () => token(good, { key: stranger })],
    ["for another application", () => token({ ...good, aud: ["another-app"] })],
    ["from another team", () => token({ ...good, iss: "https://evil.cloudflareaccess.com" })],
    ["expired", () => token({ ...good, exp: NOW - 1 })],
    ["without an expiry", () => token({ ...good, exp: undefined })],
    ["not yet valid", () => token({ ...good, nbf: NOW + 3600 })],
    ["without an email address", () => token({ ...good, email: undefined })],
    ["with an unknown key id", () => token(good, { kid: "key-2" })],
    ["claiming no signature algorithm", async () => (await token(good, { alg: "none" })).replace(/\.[^.]*$/, ".")],
    ["tampered with", async () => {
      const [h, , s] = (await token(good)).split(".");
      return `${h}.${b64url(JSON.stringify({ ...good, email: "attacker@example.org" }))}.${s}`;
    }],
    ["that is not a token", async () => "not.a.token"],
    ["with extra parts", async () => `${await token(good)}.extra`],
  ])("refuses a token %s", async (_what, make) => {
    expect(await auth().identify(await make())).toBeNull();
  });

  it("refuses everything when the signing keys cannot be fetched", async () => {
    const down = new CloudflareAccessAuth(TEAM, AUD, (async () => new Response("no", { status: 500 })) as typeof fetch, () => NOW);
    const req = new Request("https://wall.example/mod", { headers: { "Cf-Access-Jwt-Assertion": await token(good) } });
    expect(await down.identify(req)).toBeNull();
  });
});

describe("webhook alerts", () => {
  it("posts a short message that chat webhooks understand, and never throws", async () => {
    let sent: { url: string; body: unknown } | undefined;
    const alerter = new WebhookAlerter("https://hooks.example/abc", (async (url: unknown, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response("ok");
    }) as typeof fetch);
    await alerter.send("queue_waiting", "20 item(s) are waiting for review; 0 past their target time.");
    const message = "Prayer Wall [queue_waiting]: 20 item(s) are waiting for review; 0 past their target time.";
    expect(sent).toEqual({ url: "https://hooks.example/abc", body: { text: message, content: message } });

    const broken = new WebhookAlerter("https://hooks.example/abc", (async () => { throw new Error("down"); }) as typeof fetch);
    await expect(broken.send("unattended", "x")).resolves.toBeUndefined();
  });
});
