// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from "vitest";
import { DAY, HOUR, NOW, addRequest, bodies, clearRequests, rows, testApp, type TestApp } from "./helpers";

beforeEach(clearRequests);

const report = (app: TestApp, id: string, ip: string, device: string | null, reason = "spam", lang = "en") => {
  app.state.ip = ip;
  return app.post(`/${lang}/r/${id}/report`, { reason, ...(device ? { device } : {}) });
};
const dev = (n: number) => `device-${String(n).padStart(4, "0")}-0123456789`;
const request = async (id: string) =>
  (await rows<{ status: string; priority: number; report_count: number; hold_reason: string | null; queued_at: number | null }>(
    "SELECT status, priority, report_count, hold_reason, queued_at FROM requests WHERE id = ?", id))[0]!;
const wall = async (app: TestApp) => bodies(await (await app.request("/en?view=new")).text());

describe("the report button", () => {
  it("is in each card's menu and leads to a form that works without script", async () => {
    const app = testApp();
    const id = await addRequest({ body: "a request" });
    const html = await (await app.request("/en")).text();
    expect(html).toContain(`<details class="menu"><summary>More</summary><a href="/en/r/${id}/report" rel="nofollow">Report</a></details>`);

    const res = await app.request(`/en/r/${id}/report`);
    expect(res.status).toBe(200);
    const form = await res.text();
    expect(form).toContain(`<form method="post" action="/en/r/${id}/report"`);
    for (const s of ["Spam or advertising", "It asks for money", "It contains personal or contact details",
      "It is hateful, harmful, or not suitable for all ages", "Something else", "Send report"]) expect(form).toContain(s);
    expect(form).toContain('<meta name="robots" content="noindex"/>');
    expect(await (await app.request(`/ar/r/${id}/report`)).text()).toContain("الإبلاغ عن هذا الطلب");
  });

  it("says so when the request is not on the wall", async () => {
    const app = testApp();
    const held = await addRequest({ status: "held" });
    for (const id of [held, "aaaaaaaaaaaa", "not-an-id"]) {
      const res = await app.request(`/en/r/${id}/report`);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("This request is no longer on the wall.");
    }
  });

  it("always thanks the reporter in the same words", async () => {
    const app = testApp();
    const id = await addRequest({});
    for (const [target, reason] of [[id, "spam"], [id, "spam"], [id, "nonsense"], ["aaaaaaaaaaaa", "spam"]] as const) {
      const res = await report(app, target, "198.51.100.1", null, reason);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Thank you. A moderator will look at it.");
    }
    expect((await request(id)).report_count).toBe(1);
  });

  it("refuses a report sent from another site", async () => {
    const app = testApp();
    const id = await addRequest({});
    const res = await app.post(`/en/r/${id}/report`, { reason: "spam" }, { "Sec-Fetch-Site": "cross-site" });
    expect(res.status).toBe(403);
    expect((await request(id)).report_count).toBe(0);
  });

  it("stores only hashes: no network address and no device id", async () => {
    const app = testApp();
    const id = await addRequest({});
    await report(app, id, "198.51.100.77", dev(1), "money");
    const stored = await rows<{ who: string; device: string; reason: string }>("SELECT * FROM reports");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ reason: "money" });
    expect(stored[0]!.who).toMatch(/^[0-9a-f]{32}$/);
    expect(stored[0]!.device).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify([stored, await rows("SELECT * FROM rate_limits")])).not.toMatch(/198\.51\.100\.77|device-0001/);
  });
});

describe("three reports from different visitors and devices", () => {
  it("pull a request back from the wall into the queue as reported", async () => {
    const app = testApp();
    const id = await addRequest({ body: "reported text" });
    await report(app, id, "198.51.100.1", dev(1), "spam");
    await report(app, id, "198.51.100.2", dev(2), "hateful");
    expect(await request(id)).toMatchObject({ status: "published", report_count: 2 });
    expect(await wall(app)).toEqual(["reported text"]);

    await report(app, id, "198.51.100.3", dev(3), "spam");
    expect(await request(id)).toMatchObject({ status: "held", priority: 1, report_count: 3, hold_reason: "reported", queued_at: NOW });
    expect(await wall(app)).toEqual([]);

    app.state.moderator = "moderator@example.org";
    const queue = await (await app.request("/mod")).text();
    expect(queue).toContain('<span class="tag">Reported</span>');
    expect(queue).toContain("Reported by visitors");
    expect(queue).toContain("<dt>Reports</dt><dd>spam: 2, hateful or harmful: 1</dd>");
  });

  it("counts one visitor once, however often they report", async () => {
    const app = testApp();
    const id = await addRequest({});
    for (let i = 0; i < 5; i++) await report(app, id, "198.51.100.1", dev(i));
    expect(await request(id)).toMatchObject({ status: "published", report_count: 1 });
  });

  it("needs three devices as well as three visitors", async () => {
    const app = testApp();
    const id = await addRequest({});
    // One device hopping across three networks is still one device.
    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) await report(app, id, ip, dev(1));
    expect(await request(id)).toMatchObject({ status: "published", report_count: 3 });
    await report(app, id, "198.51.100.4", dev(2));
    expect((await request(id)).status).toBe("published");
    await report(app, id, "198.51.100.5", dev(3));
    expect((await request(id)).status).toBe("held");
  });

  it("lets the visitor hash stand in for the device when the browser sends none", async () => {
    const app = testApp();
    const id = await addRequest({});
    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) await report(app, id, ip, null);
    expect((await request(id)).status).toBe("held");
  });

  it("limits a visitor to 10 reports a day", async () => {
    const app = testApp();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await addRequest({}));
    for (const id of ids) await report(app, id, "198.51.100.1", dev(1));
    const counts = await rows<{ n: number }>("SELECT COUNT(*) AS n FROM reports");
    expect(counts[0]!.n).toBe(10);
    app.state.now += DAY;
    await report(app, ids[11]!, "198.51.100.1", dev(1));
    expect((await rows<{ n: number }>("SELECT COUNT(*) AS n FROM reports"))[0]!.n).toBe(11);
  });
});

describe("when a moderator rejects reports", () => {
  it("puts the request back on the wall, clears its reports, and logs the decision", async () => {
    const app = testApp();
    const id = await addRequest({ body: "wrongly reported", age: 5 * DAY });
    const before = (await rows<{ published_at: number; expires_at: number }>("SELECT published_at, expires_at FROM requests"))[0]!;
    for (let i = 1; i <= 3; i++) await report(app, id, `198.51.100.${i}`, dev(i));
    app.state.moderator = "moderator@example.org";
    await app.post(`/mod/r/${id}/publish`, {});
    expect(await request(id)).toMatchObject({ status: "published", priority: 0, report_count: 0, queued_at: null });
    // Its place in "Newest" and its expiry are unchanged, and it is not counted as a new request.
    expect((await rows("SELECT published_at, expires_at FROM requests"))[0]).toEqual(before);
    expect(await rows("SELECT * FROM counters WHERE name = 'requests_total'")).toEqual([]);
    expect(await rows("SELECT * FROM reports")).toEqual([]);
    expect(await wall(app)).toEqual(["wrongly reported"]);
    expect(await rows("SELECT action FROM mod_log")).toEqual([{ action: "publish" }]);
  });

  it("ignores a visitor for the rest of the day once three of their reports were rejected", async () => {
    const app = testApp();
    app.state.moderator = "moderator@example.org";
    // The same three visitors get three requests pulled back, and a moderator rejects each time.
    for (let round = 0; round < 3; round++) {
      const id = await addRequest({});
      for (let i = 1; i <= 3; i++) await report(app, id, `198.51.100.${i}`, dev(i));
      expect((await request(id)).status).toBe("held");
      await app.post(`/mod/r/${id}/publish`, {});
    }
    // Their fourth attempt is ignored without a word.
    const id = await addRequest({});
    for (let i = 1; i <= 3; i++) {
      const res = await report(app, id, `198.51.100.${i}`, dev(i));
      expect(await res.text()).toContain("Thank you. A moderator will look at it.");
    }
    expect(await request(id)).toMatchObject({ status: "published", report_count: 0 });
    // Someone else's reports still count, and tomorrow the three are heard again.
    for (let i = 11; i <= 13; i++) await report(app, id, `198.51.100.${i}`, dev(i));
    expect((await request(id)).status).toBe("held");
    app.state.now += DAY;
    const next = await addRequest({ age: -DAY + HOUR });
    for (let i = 1; i <= 3; i++) await report(app, next, `198.51.100.${i}`, dev(i));
    expect((await request(next)).status).toBe("held");
  });
});

describe("the report breaker", () => {
  it("trips on a burst: reports then flag requests without hiding them, and the moderators are alerted once", async () => {
    const app = testApp();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await addRequest({ body: `r${i}` }));
    // 30 reports in ten minutes from many networks: three each on ten requests, all pulled back.
    let n = 0;
    for (const id of ids.slice(0, 10)) for (let k = 0; k < 3; k++) await report(app, id, `203.0.113.${++n}`, dev(n));
    expect((await rows("SELECT id FROM requests WHERE status = 'held'")).length).toBe(10);
    expect(app.state.alerts).toEqual([]);

    // The 31st report trips the breaker.
    for (let k = 0; k < 3; k++) await report(app, ids[10]!, `203.0.113.${++n}`, dev(n));
    expect(app.state.alerts.map((a) => a.kind)).toEqual(["report_breaker"]);
    expect(await request(ids[10]!)).toMatchObject({ status: "published", priority: 1, hold_reason: "reported", queued_at: NOW });
    expect(await wall(app)).toContain("r10");

    app.state.moderator = "moderator@example.org";
    const queue = await (await app.request("/mod")).text();
    expect(queue).toContain("Unusual reporting was detected.");
    expect(queue).toContain("Still on the wall: reports flagged it without hiding it");
    expect(queue).toContain(">Keep on the wall<");
    // A moderator can still remove a flagged request, or keep it.
    await app.post(`/mod/r/${ids[10]}/remove`, { reason: "spam" });
    expect((await request(ids[10]!)).status).toBe("removed");

    // After 60 quiet minutes reports hide requests again.
    app.state.now += HOUR + 1;
    for (let k = 0; k < 3; k++) await report(app, ids[11]!, `203.0.113.${++n}`, dev(n));
    expect((await request(ids[11]!)).status).toBe("held");
    expect(app.state.alerts).toHaveLength(1);
  });

  it("trips when one visitor tries to report more than 10 requests", async () => {
    const app = testApp();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await addRequest({}));
    for (const id of ids.slice(0, 11)) await report(app, id, "198.51.100.1", dev(1));
    expect(app.state.alerts.map((a) => a.kind)).toEqual(["report_breaker"]);
    for (let i = 2; i <= 4; i++) await report(app, ids[11]!, `198.51.100.${i}`, dev(i));
    expect(await request(ids[11]!)).toMatchObject({ status: "published", priority: 1 });
  });
});
