// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from "vitest";
import { isSameOrigin } from "../src/app";
import { TurnstileBotCheck } from "../src/adapters/cloudflare/turnstile";
import { DAY, HOUR, MASTER, NOW, bodies, clearRequests, postRequest, rows, testApp } from "./helpers";

beforeEach(clearRequests);

const VALID = { kind: "other", name: "Grace", body: "Please pray for my mother Grace.", lang: "en" };
type Row = { id: string; status: string; hold_reason: string; body: string; display_name: string | null; kind: string; lang: string;
  country: string | null; owner_hash: string; poster_hash: string; body_hash: string; created_at: number; expires_at: number; published_at: number | null };
const stored = () => rows<Row>("SELECT * FROM requests ORDER BY created_at, rowid");

describe("the posting form", () => {
  it("shows every field, the three rules and the bot check", async () => {
    const html = await (await testApp().request("/en/new")).text();
    for (const s of ["Who is this for?", "Myself", "Someone else", "An event or group", "First name (optional)", "Your request",
      "Written in", "No contact details or links.", "No requests for money.", "No preaching or arguing.",
      'maxlength="500"', 'class="cf-turnstile" data-sitekey="test-site-key"', "challenges.cloudflare.com/turnstile"]) {
      expect(html).toContain(s);
    }
    // "Written in" is preset to the interface language; with no known country nothing is said about one.
    expect(html).toMatch(/<option value="en" lang="en" selected="">English<\/option>/);
    expect(html).not.toContain("hide_country");
    expect(await (await testApp().request("/ar/new")).text()).toMatch(/<option value="ar" lang="ar" selected="">العربية<\/option>/);
  });

  it("shows the visitor's country with an unticked 'Hide my country' box", async () => {
    const app = testApp();
    app.state.country = "ID";
    const html = await (await app.request("/en/new")).text();
    expect(html).toContain("Your request will show your country: <strong>Indonesia</strong>");
    expect(html).toMatch(/<input type="checkbox" name="hide_country" value="1"\/> Hide my country/);
    expect(await (await app.request("/ar/new")).text()).toContain("<strong>إندونيسيا</strong>");
    // Codes that are not countries (Tor is "T1", unknown is "XX") show nothing.
    for (const code of ["T1", "XX", "", "id"]) {
      app.state.country = code;
      expect(await (await app.request("/en/new")).text()).not.toContain("hide_country");
    }
  });

  it("stores the country unless the author hides it", async () => {
    const app = testApp();
    app.state.country = "ID";
    await app.post("/en/new", VALID);
    await app.post("/en/new", { ...VALID, body: "Another request.", hide_country: "1" });
    // The form cannot name a country itself: only the connection's country, or nothing.
    await app.post("/en/new", { ...VALID, body: "A third request.", country: "FR" });
    expect((await stored()).map((r) => r.country)).toEqual(["ID", null, "ID"]);
    // A refused post keeps the box ticked.
    const html = await (await app.post("/en/new", { ...VALID, body: "", hide_country: "1" })).text();
    expect(html).toMatch(/name="hide_country" value="1" checked=""/);
    // Without a known country nothing is stored.
    app.state.country = "T1";
    await app.post("/en/new", { ...VALID, body: "A fourth request." });
    expect((await stored()).at(-1)!.country).toBeNull();
  });

  it("is paused, kindly, when closed or not configured", async () => {
    for (const app of [testApp({ mode: "closed" }), testApp({ configured: false })]) {
      const html = await (await app.request("/en/new")).text();
      expect(html).toContain("Posting is paused for now. You can still read the wall.");
      expect(html).not.toContain("<form");
      const res = await app.post("/en/new", VALID);
      expect(await res.text()).toContain("Posting is paused for now.");
    }
    expect(await stored()).toEqual([]);
  });
});

describe("a valid post", () => {
  it("is held for review and answered with the confirmation and a private link", async () => {
    const app = testApp();
    app.state.country = "ID";
    const res = await app.post("/en/new", VALID);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Your request has been received");
    expect(html).toContain("Keep this link. It is the only way to manage your request.");
    expect(html).not.toMatch(/will pray|on the wall, and people/i);
    const token = html.match(/http:\/\/localhost\/en\/mine#([0-9a-f]{32})"/)?.[1];
    expect(token).toBeDefined();

    const [r] = await stored();
    expect(r).toMatchObject({ status: "held", hold_reason: "review_all", kind: "other", display_name: "Grace",
      body: "Please pray for my mother Grace.", lang: "en", country: "ID", created_at: NOW, expires_at: NOW + 14 * DAY, published_at: null });
    expect(r!.id).toMatch(/^[a-z2-7]{12}$/);
    // It is not on the wall.
    expect(bodies(await (await app.request("/en?view=new")).text())).toEqual([]);
  });

  it("stores no network address, no device id and no token", async () => {
    const app = testApp();
    const { token } = await postRequest(app, { device: "device-id-0123456789abcdef" });
    const everything = JSON.stringify([await stored(), await rows("SELECT * FROM rate_limits")]);
    expect(everything).not.toContain(app.state.ip);
    expect(everything).not.toContain("device-id-0123456789abcdef");
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(MASTER);
    const [r] = await stored();
    expect(r!.poster_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(r!.owner_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tidies the fields: trims, drops an empty name, and ignores unknown codes", async () => {
    const app = testApp();
    app.state.country = "Narnia";
    await app.post("/en/new", { kind: "self", name: "   ", body: "  Please pray for me.  ", lang: "tlh" });
    expect((await stored())[0]).toMatchObject({ display_name: null, body: "Please pray for me.", lang: "und", country: null });
  });

  it("shows the country on the card once published, in the reader's language", async () => {
    const app = testApp();
    app.state.country = "ID";
    await app.post("/en/new", VALID);
    await rows("UPDATE requests SET status = 'published', published_at = ?, expires_at = ?", NOW, NOW + 30 * DAY);
    expect(await (await app.request("/en")).text()).toContain("For someone else · <bdi>Grace</bdi> · Indonesia");
    expect(await (await app.request("/ar")).text()).toContain("<bdi>Grace</bdi> · إندونيسيا");
  });
});

describe("a refused post", () => {
  it.each([
    ["a link", "Please pray, details at https://example.com/me", "Please remove the link or web address."],
    ["a phone number", "Please pray, call me on +62 812 3456 7890", "Please remove the phone number."],
    ["an email address", "Please pray, write to me@example.com", "Please remove the email address."],
    ["a username", "Please pray, I am @someone on telegram", "Please remove the username."],
    ["nothing", "   ", "Please write your request."],
    ["too much", "a".repeat(501), "Your request is longer than 500 characters."],
  ])("with %s comes back with the reason and everything the author typed", async (_what, body, reason) => {
    const app = testApp();
    const res = await app.post("/en/new", { ...VALID, body, name: "Grâce", lang: "fr" });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("Please change one thing");
    expect(html).toContain(reason);
    // Nothing the author typed is lost.
    expect(html).toContain(`dir="auto" aria-describedby="body-help" data-count="true">${body}</textarea>`);
    expect(html).toContain('value="Grâce"');
    expect(html).toMatch(/<input type="radio" name="kind" value="other" checked=""/);
    expect(html).toMatch(/<option value="fr" lang="fr" selected="">/);
    expect(await stored()).toEqual([]);
  });

  it("explains in the interface language", async () => {
    const res = await testApp().post("/ar/new", { ...VALID, body: "اتصل بي ٠٥٥١٢٣٤٥٦٧" });
    expect(await res.text()).toContain("يُرجى حذف رقم الهاتف.");
  });

  it("does not count against the posting limits", async () => {
    const app = testApp();
    for (let i = 0; i < 8; i++) await app.post("/en/new", { ...VALID, body: "see www.example.com" });
    expect(await rows("SELECT * FROM rate_limits")).toEqual([]);
    await postRequest(app);
    expect((await stored())[0]!.hold_reason).toBe("review_all");
  });

  it("is refused when the bot check fails, with the text kept", async () => {
    const app = testApp();
    app.state.bot = "fail";
    const res = await app.post("/en/new", VALID);
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("We could not confirm that you are a person.");
    expect(html).toContain("Please pray for my mother Grace.</textarea>");
    expect(await stored()).toEqual([]);
  });

  it("is held, not refused, when the bot check cannot be reached", async () => {
    const app = testApp();
    app.state.bot = "unavailable";
    const res = await app.post("/en/new", VALID);
    expect(await res.text()).toContain("Your request has been received");
    expect((await stored())[0]).toMatchObject({ status: "held", hold_reason: "bot_check_unavailable" });
  });

  it("is held under its own reason when our Turnstile secret is wrong, so the operator can see it", async () => {
    const app = testApp();
    app.state.bot = "misconfigured";
    expect(await (await app.post("/en/new", VALID)).text()).toContain("Your request has been received");
    expect((await stored())[0]).toMatchObject({ status: "held", hold_reason: "bot_check_misconfigured" });
    // It is reported even when a soft limit or a duplicate would also apply.
    for (let i = 0; i < 6; i++) await app.post("/en/new", VALID);
    expect((await stored()).map((r) => r.hold_reason)).toEqual(Array(7).fill("bot_check_misconfigured"));
  });

  it("is refused when it comes from another site", async () => {
    const app = testApp();
    for (const headers of [{ "Sec-Fetch-Site": "cross-site" }, { Origin: "https://evil.example" }, {}]) {
      const res = await app.post("/en/new", VALID, headers as Record<string, string>);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("This form was sent from somewhere else.");
    }
    expect(await stored()).toEqual([]);
    // A browser without Sec-Fetch-Site is accepted on a matching Origin.
    expect((await app.post("/en/new", VALID, { Origin: "http://localhost" })).status).toBe(200);
  });
});

describe("same-origin check", () => {
  const req = (h: Record<string, string>) => new Request("https://wall.example/en/new", { method: "POST", headers: h });
  it("trusts Sec-Fetch-Site first, because no-referrer pages send Origin: null", () => {
    expect(isSameOrigin(req({ "Sec-Fetch-Site": "same-origin", Origin: "null" }))).toBe(true);
    expect(isSameOrigin(req({ "Sec-Fetch-Site": "same-site", Origin: "https://wall.example" }))).toBe(false);
    expect(isSameOrigin(req({ Origin: "https://wall.example" }))).toBe(true);
    expect(isSameOrigin(req({ Origin: "null" }))).toBe(false);
    expect(isSameOrigin(req({}))).toBe(false);
  });
});

describe("posting limits", () => {
  const reasons = async () => (await stored()).map((r) => r.hold_reason);

  it("holds the sixth post in an hour from one visitor hash", async () => {
    const app = testApp();
    for (let i = 0; i < 6; i++) await postRequest(app);
    expect(await reasons()).toEqual([...Array(5).fill("review_all"), "soft_limit"]);
    // The next hour starts a fresh hourly count.
    app.state.now += HOUR;
    await postRequest(app);
    expect((await reasons())[6]).toBe("review_all");
  });

  it("holds the eleventh post in a day from one visitor hash and refuses the sixty-first", async () => {
    const app = testApp();
    const results: string[] = [];
    for (let i = 1; i <= 62; i++) {
      // Five an hour, so the hourly limit never applies and only the daily ones are tested.
      if (i > 1 && (i - 1) % 5 === 0) app.state.now += HOUR;
      const { res, html } = await postRequest(app);
      results.push(res.status === 200 ? "received" : html.includes("we cannot take more until tomorrow") ? "refused" : "?");
      if (i === 61) {
        expect(res.status).toBe(429);
        expect(html).toMatch(/Please pray for me \d+<\/textarea>/); // the text is preserved
      }
    }
    expect(results.slice(0, 60)).toEqual(Array(60).fill("received"));
    expect(results.slice(60)).toEqual(["refused", "refused"]);
    const r = await reasons();
    expect(r).toHaveLength(60);
    expect(r.slice(0, 10)).toEqual(Array(10).fill("review_all"));
    expect(r.slice(10)).toEqual(Array(50).fill("soft_limit"));

    // Another network is unaffected, and so is the same network the next day.
    app.state.ip = "198.51.100.99";
    expect((await postRequest(app)).res.status).toBe(200);
    app.state.ip = "203.0.113.7";
    app.state.now += DAY;
    expect((await postRequest(app)).res.status).toBe(200);
    expect((await reasons()).slice(-2)).toEqual(["review_all", "review_all"]);
  });

  it("holds the fourth post in a day from one device, even across networks", async () => {
    const app = testApp();
    for (let i = 0; i < 4; i++) {
      app.state.ip = `198.51.100.${i}`;
      await postRequest(app, { device: "device-id-0123456789abcdef" });
    }
    expect(await reasons()).toEqual(["review_all", "review_all", "review_all", "soft_limit"]);
    // Another device on the last network is not held.
    await postRequest(app, { device: "another-device-0123456789" });
    expect((await reasons())[4]).toBe("review_all");
  });

  it("ignores a malformed device id", async () => {
    const app = testApp();
    for (let i = 0; i < 4; i++) await postRequest(app, { device: "x" });
    expect(await rows("SELECT * FROM rate_limits WHERE key LIKE 'post:device:%'")).toEqual([]);
  });

  it("holds the third identical text within 24 hours as a duplicate, across the site", async () => {
    const app = testApp();
    const body = "Please pray for peace in our town.";
    for (const [ip, text] of [["198.51.100.1", body], ["198.51.100.2", `  please PRAY for   peace in our town. `], ["198.51.100.3", body]] as const) {
      app.state.ip = ip;
      await postRequest(app, { body: text });
    }
    expect(await reasons()).toEqual(["review_all", "review_all", "duplicate"]);
    // A day later the same text is no longer a duplicate.
    app.state.now += DAY + 1;
    app.state.ip = "198.51.100.4";
    await postRequest(app, { body });
    expect((await reasons())[3]).toBe("review_all");
  });
});

describe("Turnstile adapter", () => {
  const check = (respond: () => Response | Promise<Response>) =>
    new TurnstileBotCheck("site", "secret", (async (_url: unknown, init?: RequestInit) => {
      expect(String(init?.body)).toBe("secret=secret&response=widget-response");
      return respond();
    }) as typeof fetch);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

  it("passes, fails, or reports the service unavailable", async () => {
    expect(await check(() => json({ success: true })).verify("widget-response")).toBe("pass");
    expect(await check(() => json({ success: false, "error-codes": ["invalid-input-response"] })).verify("widget-response")).toBe("fail");
    expect(await check(() => json({ success: false, "error-codes": ["timeout-or-duplicate"] })).verify("widget-response")).toBe("fail");
    expect(await check(() => json({ success: false, "error-codes": ["internal-error"] })).verify("widget-response")).toBe("unavailable");
    expect(await check(() => json({ success: false, "error-codes": ["invalid-input-secret"] })).verify("widget-response")).toBe("misconfigured");
    expect(await check(() => json({ success: false, "error-codes": ["missing-input-secret"] })).verify("widget-response")).toBe("misconfigured");
    expect(await check(() => json({}, 503)).verify("widget-response")).toBe("unavailable");
    expect(await check(() => { throw new Error("network"); }).verify("widget-response")).toBe("unavailable");
  });

  it("fails without asking when the form carries no response", async () => {
    const never = new TurnstileBotCheck("site", "secret", (() => { throw new Error("must not be called"); }) as unknown as typeof fetch);
    expect(await never.verify(undefined)).toBe("fail");
  });
});

describe("Turnstile adapter with the runtime's own fetch", () => {
  it("can call fetch without an 'Illegal invocation' error", async () => {
    // Whatever the network answers, a wrong secret must never come back as "unavailable"
    // because of how fetch was called. Stub the global so the test does not depend on the network.
    const original = globalThis.fetch;
    let calledWithThis: unknown = "not called";
    globalThis.fetch = function (this: unknown) {
      calledWithThis = this;
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    } as typeof fetch;
    try {
      expect(await new TurnstileBotCheck("site", "secret").verify("widget-response")).toBe("pass");
      // Called as a plain function, never as a method of the adapter.
      expect(calledWithThis === undefined || calledWithThis === globalThis).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
