// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from "vitest";
import { DAY, NOW, clearRequests, postRequest, rows, testApp } from "./helpers";

beforeEach(clearRequests);

const publish = () => rows("UPDATE requests SET status = 'published', published_at = ?, expires_at = ?", NOW, NOW + 30 * DAY);
const row = async () => (await rows<{ status: string; answered_at: number | null; extended: number; expires_at: number }>("SELECT * FROM requests"))[0];

describe("the private page", () => {
  it("asks for the link when opened without one, and never puts the token in an address", async () => {
    const res = await testApp().request("/en/mine");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Paste your private link");
    expect(html).toContain('<form method="post" action="/en/mine"');
    expect(html).toContain('<meta name="robots" content="noindex"/>');
    // There is no route with the token in the path.
    expect((await testApp().request("/en/mine/0123456789abcdef0123456789abcdef")).status).toBe(404);
  });

  it('shows "waiting for review" for a new request, with its text and prayer count', async () => {
    const app = testApp();
    const { token } = await postRequest(app, { body: "Please pray for my exam." });
    const res = await app.post("/en/mine", { token: token! });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Waiting for review");
    expect(html).toContain("Please pray for my exam.");
    expect(html).toContain("No prayers yet");
    expect(html).toContain("Mark as answered");
    expect(html).toContain("Delete now");
    // Extending is only for a request that is on the wall.
    expect(html).not.toContain("Keep it on the wall 30 more days");
  });

  it("accepts the whole link pasted into the field", async () => {
    const app = testApp();
    const { token } = await postRequest(app);
    const html = await (await app.post("/en/mine", { token: `https://wall.example/en/mine#${token}` })).text();
    expect(html).toContain("Waiting for review");
  });

  it("shows each status", async () => {
    const app = testApp();
    const { token } = await postRequest(app);
    const status = async () => (await app.post("/en/mine", { token: token! })).text();
    await publish();
    await rows("UPDATE requests SET prayed_count = 12");
    const published = await status();
    expect(published).toContain("Your request is on the wall, and people can pray for it.");
    expect(published).toContain("Prayed 12 times");
    await rows("UPDATE requests SET status = 'removed'");
    const removed = await status();
    expect(removed).toContain("This request was removed by a moderator.");
    expect(removed).not.toContain("Mark as answered");
    await rows("UPDATE requests SET status = 'published'");
    app.state.now += 31 * DAY;
    expect(await status()).toContain("This request has ended.");
  });

  it("says so for an unknown, malformed or missing link, without revealing which", async () => {
    const app = testApp();
    await postRequest(app);
    for (const token of ["0123456789abcdef0123456789abcdef", "nonsense", ""]) {
      const res = await app.post("/en/mine", { token });
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("We could not find a request for this link.");
    }
  });

  it("refuses the thirty-first lookup in an hour from one visitor hash", async () => {
    const app = testApp();
    const { token } = await postRequest(app);
    for (let i = 0; i < 30; i++) expect((await app.post("/en/mine", { token: token! })).status).toBe(200);
    const res = await app.post("/en/mine", { token: token! });
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("too many tries from your network");
    app.state.ip = "198.51.100.50";
    expect((await app.post("/en/mine", { token: token! })).status).toBe(200);
  });

  it("refuses a post from another site", async () => {
    const app = testApp();
    const { token } = await postRequest(app);
    const res = await app.post("/en/mine", { token: token!, action: "delete_confirm" }, { "Sec-Fetch-Site": "cross-site" });
    expect(res.status).toBe(403);
    expect(await row()).toBeDefined();
  });
});

describe("the author's three actions", () => {
  it("mark as answered", async () => {
    const app = testApp();
    const { token } = await postRequest(app);
    const html = await (await app.post("/en/mine", { token: token!, action: "answered" })).text();
    expect(html).toContain("You marked this request as answered.");
    expect(html).not.toContain(">Mark as answered<");
    expect((await row())!.answered_at).toBe(NOW);
    // Doing it again changes nothing.
    app.state.now += 100;
    await app.post("/en/mine", { token: token!, action: "answered" });
    expect((await row())!.answered_at).toBe(NOW);
  });

  it("keep it on the wall 30 more days, once, and only when it is on the wall", async () => {
    const app = testApp();
    const { token } = await postRequest(app);
    await app.post("/en/mine", { token: token!, action: "extend" });
    expect((await row())!.extended).toBe(0); // still held: nothing to extend

    await publish();
    const html = await (await app.post("/en/mine", { token: token!, action: "extend" })).text();
    expect(html).toContain("Your request will stay on the wall 30 more days.");
    expect(html).not.toContain(">Keep it on the wall 30 more days<");
    expect(await row()).toMatchObject({ extended: 1, expires_at: NOW + 60 * DAY });
    await app.post("/en/mine", { token: token!, action: "extend" });
    expect((await row())!.expires_at).toBe(NOW + 60 * DAY);
  });

  it("delete now asks first, then really removes the row", async () => {
    const app = testApp();
    const { token } = await postRequest(app, { body: "Please pray for my exam." });
    const ask = await (await app.post("/en/mine", { token: token!, action: "delete" })).text();
    expect(ask).toContain("Delete this request?");
    expect(ask).toContain("It will be removed at once and cannot be brought back.");
    expect(await row()).toBeDefined();

    const done = await (await app.post("/en/mine", { token: token!, action: "delete_confirm" })).text();
    expect(done).toContain("Your request has been deleted");
    expect(done).toContain(`data-forget="${token}"`);
    expect(await rows("SELECT * FROM requests")).toEqual([]);
    expect((await app.post("/en/mine", { token: token! })).status).toBe(404);
  });

  it("cannot touch someone else's request", async () => {
    const app = testApp();
    await postRequest(app);
    await app.post("/en/mine", { token: "0123456789abcdef0123456789abcdef", action: "delete_confirm" });
    expect(await rows("SELECT * FROM requests")).toHaveLength(1);
  });

  it("is paused when the master secret is not configured", async () => {
    const html = await (await testApp({ configured: false }).post("/en/mine", { token: "x" })).text();
    expect(html).toContain("Posting is paused for now.");
  });
});
