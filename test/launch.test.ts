// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from "vitest";
import { D1DatabaseAdapter } from "../src/adapters/cloudflare/d1";
import { CSP, SECURITY_HEADERS } from "../src/lib/headers";
import { checkHelpline } from "../src/lib/helpline-check";
import headersFile from "../public/_headers?raw";
import manifest from "../public/manifest.webmanifest?raw";
import robots from "../public/robots.txt?raw";
import { NOW, clearRequests, d1, postRequest, rows, testApp } from "./helpers";

beforeEach(clearRequests);

describe("rules, privacy and about", () => {
  it.each(["rules", "privacy", "about"])("/en/%s is linked from every footer and can be indexed", async (path) => {
    const app = testApp();
    const res = await app.request(`/en/${path}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('content="noindex"');
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
    expect(await (await app.request("/en")).text()).toContain(`<a href="/en/${path}">`);
    expect(html).toContain("contact@example.org");
  });

  it("the rules state the seven rules, the minimum age, automated checks and the limits", async () => {
    const html = await (await testApp().request("/en/rules")).text();
    for (const s of [
      "This wall is for prayer to God.", "No prayers for harm to anyone.", "Keep it suitable for all ages.",
      "You must be 16 or older to post.", "An automatic check", "Only a person can remove a request",
      "This wall is not an emergency or counselling service", "Moderators cannot reply to authors",
      "The wall supports English only at the moment.",
    ]) expect(html).toContain(s);
  });

  it("the privacy page makes every disclosure the blueprint asks for", async () => {
    const html = await (await testApp().request("/en/privacy")).text();
    for (const s of [
      "No network (IP) addresses", "No cookies set by this site", "European Union", "Cloudflare Turnstile",
      "turnstile-privacy-policy", "Workers AI", "no identifier attached", "Cloudflare Access and cannot see who posted",
      "A random device code", "Your private links", "48 hours", "14 days", "up to 30 days", "Hide my country", "within 30 days",
    ]) expect(html).toContain(s);
  });

  it("a removed request's private page gives the contact for a second look", async () => {
    const app = testApp();
    app.state.moderator = "m@example.org";
    const { token } = await postRequest(app);
    const id = (await rows<{ id: string }>("SELECT id FROM requests"))[0]!.id;
    await app.post(`/mod/r/${id}/remove`, { reason: "money" });
    expect(await (await app.post("/en/mine", { token: token! })).text()).toContain(`To ask for a second look, write to contact@example.org with ID ${id}.`);
  });
});

describe("security headers", () => {
  it("are on every Worker response, pages and errors alike", async () => {
    const app = testApp();
    for (const path of ["/en", "/en/new", "/healthz", "/en/r/nope", "/xx"]) {
      const res = await app.request(path);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k), `${path} ${k}`).toBe(v);
    }
  });

  it("allow only this site and the bot check, and no inline script or style", () => {
    expect(CSP).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).not.toContain("unsafe-inline");
  });

  it("are the same for static files (public/_headers)", () => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(headersFile).toContain(`  ${k}: ${v}\n`);
  });

  it("keep private and moderator pages out of search engines", async () => {
    const app = testApp();
    for (const path of ["/en/new", "/en/mine", "/en/r/abc", "/r/abc", "/api/status", "/mod", "/healthz"]) {
      expect((await app.request(path)).headers.get("X-Robots-Tag"), path).toBe("noindex, nofollow");
    }
    expect((await app.request("/en")).headers.get("X-Robots-Tag")).toBeNull();
    for (const p of ["/mod", "/api/", "/en/mine", "/en/new", "/r/"]) expect(robots).toContain(`Disallow: ${p}\n`);
  });
});

describe("install to home screen", () => {
  it("has a manifest with an icon, linked from every page", async () => {
    const m = JSON.parse(manifest);
    expect(m).toMatchObject({ name: "Prayer Wall", start_url: "/en", display: "standalone" });
    expect(m.icons.length).toBeGreaterThan(0);
    expect(await (await testApp().request("/en")).text()).toContain('<link rel="manifest" href="/manifest.webmanifest"/>');
  });
});

describe("the weekly helpline check", () => {
  const db = new D1DatabaseAdapter(d1);
  const run = async (fetch: () => Promise<Response>) => {
    const alerts: string[] = [];
    const ok = await checkHelpline({ db, alerter: { send: async (k) => void alerts.push(k) }, fetch }, NOW);
    return { ok, alerts };
  };

  it("passes quietly when the directory answers with a page", async () => {
    expect(await run(async () => new Response("<html>", { headers: { "Content-Type": "text/html; charset=utf-8" } }))).toEqual({ ok: true, alerts: [] });
    expect(await rows("SELECT kind, note FROM events")).toEqual([{ kind: "helpline_check", note: "ok" }]);
  });

  it("alerts when it is down, missing or not a page", async () => {
    expect(await run(async () => new Response("gone", { status: 404 }))).toEqual({ ok: false, alerts: ["helpline"] });
    expect(await run(async () => new Response("{}", { headers: { "Content-Type": "application/json" } }))).toEqual({ ok: false, alerts: ["helpline"] });
    expect(await run(async () => { throw new Error("dns"); })).toEqual({ ok: false, alerts: ["helpline"] });
  });
});
