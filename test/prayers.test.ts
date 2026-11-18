// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from "vitest";
import { D1DatabaseAdapter } from "../src/adapters/cloudflare/d1";
import { parseIds } from "../src/lib/prayers";
import { DAY, HOUR, NOW, addRequest, bodies, clearRequests, d1, postRequest, rows, testApp, type TestApp } from "./helpers";

beforeEach(clearRequests);

const api = (app: TestApp, id: string, device: string | null, headers: Record<string, string> = { "Sec-Fetch-Site": "same-origin", "X-Prayer-Wall": "1" }) =>
  app.request(`/api/r/${id}/prayed`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(device ? { device } : {}) });
const tap = async (app: TestApp, id: string, device: string | null) => (await (await api(app, id, device)).json()) as { count: number };
const dev = (n: number) => `device-${String(n).padStart(6, "0")}-abcdef`;
const counts = async (id: string) =>
  (await rows<{ prayed_count: number; reach_count: number }>("SELECT prayed_count, reach_count FROM requests WHERE id = ?", id))[0]!;
const total = async () => (await rows<{ value: number }>("SELECT value FROM counters WHERE name = 'prayers_total'"))[0]?.value ?? 0;

describe("the I prayed button", () => {
  it("is on every card as a form that works without script", async () => {
    const app = testApp();
    const id = await addRequest({ prayed: 2 });
    const html = await (await app.request("/en")).text();
    expect(html).toContain(`<form method="post" action="/en/r/${id}/prayed" class="pray" data-pray="${id}">`);
    expect(html).toContain('<button class="prayed" type="submit" aria-pressed="false">I prayed</button>');
    expect(html).toContain("Prayed 2 times");
  });

  it("without script, counts the prayer and returns to the same page", async () => {
    const app = testApp();
    const id = await addRequest({});
    const res = await app.post(`/en/r/${id}/prayed`, { back: "/en?view=new", device: dev(1) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/en?view=new");
    expect(await counts(id)).toEqual({ prayed_count: 1, reach_count: 1 });
    expect(await (await app.request("/en?view=new")).text()).toContain("Prayed once");
  });

  it("never returns to another site", async () => {
    const app = testApp();
    const id = await addRequest({});
    for (const back of ["https://evil.example/", "//evil.example/en", "/\\\\evil.example", "/mod", ""]) {
      expect((await app.post(`/en/r/${id}/prayed`, { back })).headers.get("location")).toBe("/en");
    }
  });
});

describe("counting", () => {
  it("counts a tap once, however often the same device taps", async () => {
    const app = testApp();
    const id = await addRequest({});
    expect(await tap(app, id, dev(1))).toEqual({ count: 1 });
    expect(await tap(app, id, dev(1))).toEqual({ count: 1 });
    await app.post(`/en/r/${id}/prayed`, { device: dev(1) });
    expect(await counts(id)).toEqual({ prayed_count: 1, reach_count: 1 });
    expect(await total()).toBe(1);
  });

  it("keeps the count after a reload", async () => {
    const app = testApp();
    const id = await addRequest({});
    await tap(app, id, dev(1));
    expect(await (await app.request("/en")).text()).toContain("Prayed once");
  });

  it("lets the same device pray again the next day", async () => {
    const app = testApp();
    const id = await addRequest({});
    await tap(app, id, dev(1));
    app.state.now += DAY;
    expect(await tap(app, id, dev(1))).toEqual({ count: 2 });
    expect(await counts(id)).toEqual({ prayed_count: 2, reach_count: 2 });
  });

  it("uses the network when the browser sends no device id", async () => {
    const app = testApp();
    const id = await addRequest({});
    await tap(app, id, null);
    await tap(app, id, null);
    expect((await counts(id)).prayed_count).toBe(1);
  });

  it("lets forty devices on one network each pray, up to 30 counted, with reach rising once", async () => {
    const app = testApp();
    const id = await addRequest({});
    const shown: number[] = [];
    for (let i = 1; i <= 40; i++) shown.push((await tap(app, id, dev(i))).count);
    expect(await counts(id)).toEqual({ prayed_count: 30, reach_count: 1 });
    // Over the limit, the device still gets the current count and no error.
    expect(shown.slice(28)).toEqual(Array(12).fill(30).map((n, i) => (i === 0 ? 29 : n)));
    // Another network still counts.
    app.state.ip = "198.51.100.200";
    expect(await tap(app, id, dev(99))).toEqual({ count: 31 });
    expect((await counts(id)).reach_count).toBe(2);
  });

  it("adds at most 30 to the count and 1 to reach for 5,000 scripted taps from one address with fresh device ids", async () => {
    const app = testApp();
    const id = await addRequest({});
    for (let i = 0; i < 5000; i++) {
      const res = await api(app, id, dev(i));
      expect(res.status).toBe(200);
    }
    expect(await counts(id)).toEqual({ prayed_count: 30, reach_count: 1 });
    expect(await total()).toBe(30);
  }, 120_000);

  it("stops counting after 600 prayers in an hour from one network, across requests", async () => {
    const app = testApp();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) ids.push(await addRequest({}));
    let n = 0;
    for (const id of ids) for (let k = 0; k < 25; k++) await tap(app, id, dev(++n)); // 625 taps
    const sum = (await rows<{ s: number }>("SELECT SUM(prayed_count) AS s FROM requests"))[0]!.s;
    expect(sum).toBe(600);
    app.state.now += HOUR;
    expect((await tap(app, ids[24]!, dev(9999))).count).toBe((await counts(ids[24]!)).prayed_count);
    expect((await rows<{ s: number }>("SELECT SUM(prayed_count) AS s FROM requests"))[0]!.s).toBe(601);
  }, 60_000);

  it("only counts requests that are on the wall", async () => {
    const app = testApp();
    const held = await addRequest({ status: "held" });
    const test = await addRequest({ isTest: 1 });
    const expired = await addRequest({ expiresAt: NOW - 1 });
    for (const id of [held, test, expired, "aaaaaaaaaaaa", "not-an-id"]) {
      expect((await api(app, id, dev(1))).status).toBe(404);
    }
    expect(await rows("SELECT * FROM prayers")).toEqual([]);
    expect(await total()).toBe(0);
  });

  it("refuses requests from other sites, or without the custom header", async () => {
    const app = testApp();
    const id = await addRequest({});
    expect((await api(app, id, dev(1), { "Sec-Fetch-Site": "cross-site", "X-Prayer-Wall": "1" })).status).toBe(403);
    expect((await api(app, id, dev(1), { "Sec-Fetch-Site": "same-origin" })).status).toBe(403);
    expect((await app.post(`/en/r/${id}/prayed`, {}, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await counts(id)).prayed_count).toBe(0);
  });

  it("stores only daily hashes", async () => {
    const app = testApp();
    const id = await addRequest({});
    await tap(app, id, dev(7));
    const stored = JSON.stringify(await rows("SELECT * FROM prayers"));
    expect(stored).not.toContain(app.state.ip);
    expect(stored).not.toContain(dev(7));
  });
});

describe("ordering by reach", () => {
  it("puts a request with a reach of zero ahead of one with ten", async () => {
    const app = testApp();
    const ten = await addRequest({ body: "ten" });
    await addRequest({ body: "zero", age: 2 * HOUR });
    for (let i = 1; i <= 10; i++) {
      app.state.ip = `198.51.100.${i}`;
      await tap(app, ten, dev(i));
    }
    expect((await counts(ten)).reach_count).toBe(10);
    for (const s of [0, 1, 2, 3]) expect(bodies(await (await app.request(`/en?s=${s}`)).text())).toEqual(["zero", "ten"]);
  });
});

describe("the shared link", () => {
  it("/r/{id} has no language and sends each visitor to their own", async () => {
    const app = testApp();
    const id = await addRequest({});
    const res = await app.request(`/r/${id}`, { headers: { "Accept-Language": "en-GB" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/en/r/${id}`);
    expect((await app.request("/r/not-an-id")).status).toBe(404);
  });

  it("shows the request, its button, three more requests and Ask for prayer, with a preview that never contains the text", async () => {
    const app = testApp();
    const id = await addRequest({ body: "Private words about my mother", name: "Grace", kind: "other" });
    for (let i = 0; i < 5; i++) await addRequest({ body: `other ${i}` });
    const html = await (await app.request(`/en/r/${id}`)).text();
    expect(html).toContain("Someone asked for prayer here. No account is needed.");
    expect(html).toContain("Private words about my mother");
    expect(html).toContain(`data-pray="${id}"`);
    expect(html).toContain("More requests");
    expect(bodies(html)).toHaveLength(4);
    expect(html).toContain('<a class="btn-primary" href="/en/new">Ask for prayer</a>');
    expect(html).toContain('<meta property="og:title" content="Pray for Grace"/>');
    expect(html).toContain('<meta property="og:description" content="Tap to read and pray. No account needed."/>');
    expect(html).toContain('<meta name="robots" content="noindex"/>');
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).not.toContain("Private words");
    expect(head).toContain("<title>Pray for Grace · Prayer Wall</title>");
  });

  it("uses a plain preview without a first name", async () => {
    const id = await addRequest({});
    expect(await (await testApp().request(`/en/r/${id}`)).text()).toContain('<meta property="og:title" content="A prayer request"/>');
  });

  it("never shows an error for an ended, removed, held or unknown request", async () => {
    const app = testApp();
    for (let i = 0; i < 4; i++) await addRequest({ body: `waiting ${i}` });
    const ended = await addRequest({ body: "ended", expiresAt: NOW - 1 });
    const removed = await addRequest({ body: "removed", status: "removed" });
    const held = await addRequest({ body: "held", status: "held" });
    for (const id of [ended, removed, held, "aaaaaaaaaaaa"]) {
      const res = await app.request(`/en/r/${id}`);
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("This request has ended. Others are waiting for prayer.");
      expect(bodies(html)).toHaveLength(3);
      expect(html).not.toMatch(/>(ended|removed|held)</);
    }
  });
});

describe("the confirmation page", () => {
  it("shows three requests to pray for while the author's request waits", async () => {
    const app = testApp();
    for (let i = 0; i < 5; i++) await addRequest({ body: `waiting ${i}` });
    const { html } = await postRequest(app, { body: "My own request" });
    expect(html).toContain("While your request waits, these people are waiting too.");
    expect(bodies(html)).toHaveLength(3);
    expect(html).not.toContain(">My own request<");
    expect(html).toMatch(/data-posted="[a-z2-7]{12}"/);
  });
});

describe("the private page", () => {
  it("offers 'Ask others to pray' once the request is published, with a link that carries nothing about the author", async () => {
    const app = testApp();
    const { token } = await postRequest(app);
    const id = (await rows<{ id: string }>("SELECT id FROM requests"))[0]!.id;
    expect(await (await app.post("/en/mine", { token: token! })).text()).not.toContain("Ask others to pray");
    await rows("UPDATE requests SET status = 'published', published_at = ?, expires_at = ?", NOW, NOW + 30 * DAY);
    const html = await (await app.post("/en/mine", { token: token! })).text();
    expect(html).toContain("Ask others to pray");
    expect(html).toContain(`value="http://localhost/r/${id}"`);
  });
});

describe("your prayers (status)", () => {
  it("returns counts and answered flags for published requests only", async () => {
    const app = testApp();
    const a = await addRequest({ prayed: 4 });
    const b = await addRequest({ prayed: 1 });
    await rows("UPDATE requests SET answered_at = ? WHERE id = ?", NOW, b);
    const held = await addRequest({ status: "held" });
    const res = await app.request(`/api/status?ids=${[a, b, held, "aaaaaaaaaaaa", "bad"].join(",")}`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = (await res.json()) as { requests: { id: string; prayed: number; answered: boolean }[] };
    expect(data.requests.sort((x, y) => x.prayed - y.prayed)).toEqual([
      { id: b, prayed: 1, answered: true },
      { id: a, prayed: 4, answered: false },
    ]);
  });

  it("accepts at most 100 ids, and 120 look-ups an hour from one network", async () => {
    const B32 = "abcdefghijklmnopqrstuvwxyz234567";
    const ids = Array.from({ length: 150 }, (_, i) => `aaaaaaaaaa${B32[Math.floor(i / 32)]}${B32[i % 32]}`);
    expect(parseIds(ids.join(","))).toEqual(ids.slice(0, 100));
    expect(parseIds(`${ids[0]},${ids[0]},bad,,${ids[1]}`)).toEqual([ids[0], ids[1]]);
    const app = testApp();
    for (let i = 0; i < 120; i++) expect((await app.request("/api/status?ids=")).status).toBe(200);
    expect((await app.request("/api/status?ids=")).status).toBe(429);
  });

  it("puts an empty, hidden status line on the wall for the script to fill", async () => {
    const html = await (await testApp().request("/en")).text();
    expect(html).toMatch(/<p class="notice" role="status" data-status="true" hidden=""/);
    expect(html).toContain('data-many="People prayed {n} times for your request."');
  });

  it("marks an answered request on its card", async () => {
    const id = await addRequest({});
    await rows("UPDATE requests SET answered_at = ? WHERE id = ?", NOW, id);
    expect(await (await testApp().request("/en")).text()).toContain('<span class="tag">Answered</span>');
  });
});

describe("the clean-up", () => {
  const db = new D1DatabaseAdapter(d1);

  it("deletes expired requests with their prayers and reports, so they are gone from the wall and the database", async () => {
    const app = testApp();
    const keep = await addRequest({ body: "keep" });
    const gone = await addRequest({ body: "gone", expiresAt: NOW + HOUR });
    await tap(app, gone, dev(1));
    await d1.prepare("INSERT INTO reports (request_id, who, device, reason, created_at) VALUES (?, 'w', 'd', 'spam', ?)").bind(gone, NOW).run();
    app.state.now = NOW + 2 * HOUR;
    expect(bodies(await (await app.request("/en")).text())).toEqual(["keep"]);
    expect(await db.cleanUp(app.state.now)).toBe(1);
    expect(await rows("SELECT id FROM requests")).toEqual([{ id: keep }]);
    expect(await rows("SELECT * FROM prayers WHERE request_id = ?", gone)).toEqual([]);
    expect(await rows("SELECT * FROM reports")).toEqual([]);
    // Totals survive.
    expect(await total()).toBe(1);
  });

  it("deletes held requests after 14 days and removed ones 30 days after removal, but never a held crisis request", async () => {
    const app = testApp();
    app.state.moderator = "m@example.org";
    await postRequest(app, { body: "never reviewed" });
    await postRequest(app, { body: "removed" });
    const removedId = (await rows<{ id: string }>("SELECT id FROM requests WHERE body = 'removed'"))[0]!.id;
    await app.post(`/mod/r/${removedId}/remove`, { reason: "spam" });
    const crisis = await addRequest({ status: "held", body: "crisis", expiresAt: NOW + 14 * DAY });
    await rows("UPDATE requests SET priority = 2 WHERE id = ?", crisis);

    await db.cleanUp(NOW + 14 * DAY + 1);
    expect((await rows<{ body: string }>("SELECT body FROM requests ORDER BY body")).map((r) => r.body)).toEqual(["crisis", "removed"]);
    await db.cleanUp(NOW + 30 * DAY + 1);
    expect((await rows<{ body: string }>("SELECT body FROM requests")).map((r) => r.body)).toEqual(["crisis"]);
    // The decision log is kept.
    expect(await rows("SELECT action FROM mod_log")).toEqual([{ action: "remove" }]);
  });

  it("deletes prayer and limit rows after 48 hours", async () => {
    const app = testApp();
    const id = await addRequest({ expiresAt: NOW + 10 * DAY });
    await tap(app, id, dev(1));
    await db.cleanUp(NOW + 47 * HOUR);
    expect(await rows("SELECT * FROM prayers")).toHaveLength(1);
    await db.cleanUp(NOW + 49 * HOUR);
    expect(await rows("SELECT * FROM prayers")).toEqual([]);
    expect(await rows("SELECT * FROM rate_limits")).toEqual([]);
    expect((await counts(id)).prayed_count).toBe(1);
  });
});
