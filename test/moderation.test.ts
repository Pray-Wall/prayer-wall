// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from "vitest";
import { D1DatabaseAdapter } from "../src/adapters/cloudflare/d1";
import { D1RateLimiter } from "../src/adapters/cloudflare/ratelimit";
import { ageLevel, checkQueue, isUnattended } from "../src/lib/moderation";
import { waited } from "../src/views/mod";
import { DAY, HOUR, NOW, addRequest, bodies, clearRequests, d1, postRequest, rows, testApp, type TestApp } from "./helpers";

beforeEach(clearRequests);

const MOD = "moderator@example.org";
const signedIn = () => {
  const app = testApp();
  app.state.moderator = MOD;
  return app;
};
const queue = async (app: TestApp, path = "/mod") => (await app.request(path)).text();
const act = (app: TestApp, id: string, action: string, fields: Record<string, string> = {}) => app.post(`/mod/r/${id}/${action}`, fields);
const request = async (id: string) =>
  (await rows<Record<string, unknown>>("SELECT * FROM requests WHERE id = ?", id))[0]!;
const log = () => rows<{ request_id: string; action: string; moderator: string; note: string | null; created_at: number }>(
  "SELECT request_id, action, moderator, note, created_at FROM mod_log ORDER BY id");
const idOf = async (body: string) => (await rows<{ id: string }>("SELECT id FROM requests WHERE body = ?", body))[0]!.id;

describe("/mod sign-in", () => {
  it("does not exist until sign-in is configured", async () => {
    const app = testApp({ noModeration: true });
    expect((await app.request("/mod")).status).toBe(404);
    expect((await app.post("/mod/r/aaaaaaaaaaaa/publish", {})).status).toBe(404);
  });

  it("is unreachable without sign-in, for reading and for deciding", async () => {
    const app = testApp();
    const id = await addRequest({ status: "held", body: "secret held text" });
    await rows("UPDATE requests SET queued_at = created_at");
    for (const path of ["/mod", "/mod?view=removed"]) {
      const res = await app.request(path);
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain("secret held text");
    }
    for (const action of ["publish", "remove", "restore", "escalate"]) {
      expect((await act(app, id, action, { reason: "spam" })).status).toBe(403);
    }
    expect((await request(id)).status).toBe("held");
    expect(await log()).toEqual([]);
  });

  it("is not mistaken for a language, is never cached, and is kept out of search engines", async () => {
    const res = await signedIn().request("/mod");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Moderation queue");
    expect(html).toContain(`Signed in as ${MOD}`);
    expect(html).toContain('<meta name="robots" content="noindex"/>');
  });

  it("is not linked from the public site", async () => {
    const app = testApp();
    await addRequest({});
    for (const path of ["/en", "/en/new", "/en/mine"]) expect(await (await app.request(path)).text()).not.toContain("/mod");
  });

  it("refuses a decision sent from another site", async () => {
    const app = signedIn();
    const { token } = await postRequest(app);
    const id = (await rows<{ id: string }>("SELECT id FROM requests"))[0]!.id;
    expect(token).toBeDefined();
    expect((await app.post(`/mod/r/${id}/publish`, {}, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await request(id)).status).toBe("held");
  });
});

describe("the test alert", () => {
  it("sends one alert, at most once a minute, and only for a signed-in moderator", async () => {
    const app = testApp();
    expect((await app.post("/mod/test-alert", {})).status).toBe(403);
    app.state.moderator = MOD;
    expect(await queue(app)).toContain('action="/mod/test-alert"');
    const res = await app.post("/mod/test-alert", {});
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/mod?alert=sent");
    await app.post("/mod/test-alert", {});
    expect(app.state.alerts).toEqual([{ kind: "test", text: "Test alert. If you can read this, alerts reach you." }]);
    expect(await queue(app, "/mod?alert=sent")).toContain("A test alert was sent.");
    app.state.now += 61;
    await app.post("/mod/test-alert", {});
    expect(app.state.alerts).toHaveLength(2);
  });
});

describe("the queue", () => {
  it("shows every field a moderator needs", async () => {
    const app = signedIn();
    app.state.country = "ID";
    await postRequest(app, { kind: "other", name: "Grace", body: "Please pray for <b>Grace</b>." });
    await postRequest(app, { body: "Another from the same visitor." });
    app.state.now += 3 * HOUR + 120;
    const html = await queue(app);
    for (const s of [
      "For someone else · <bdi>Grace</bdi> · ID · written in: en",
      "Please pray for &lt;b&gt;Grace&lt;/b&gt;.",
      "Not run (the classifier arrives in milestone 5)",
      "review_all mode: every request is reviewed",
      "<dt>Reports</dt><dd>None</dd>",
      "3 h 2 min",
      "1 other request(s) held or removed",
      ">Publish<", ">Remove<", ">Ask for a second opinion<", ">Skip<",
      "2 waiting",
    ]) expect(html).toContain(s);
    for (const reason of ["contact", "money", "identifies", "preaching", "harm", "unsuitable", "not_prayer", "not_english", "spam", "other"]) {
      expect(html).toContain(`<option value="${reason}">`);
    }
  });

  it("orders crisis first, then reported, then oldest first", async () => {
    const app = signedIn();
    for (const [body, priority, age] of [["ordinary old", 0, 9], ["ordinary new", 0, 1], ["reported", 1, 2], ["crisis", 2, 0.5]] as const) {
      await addRequest({ status: "held", body, age: age * HOUR });
      await rows("UPDATE requests SET priority = ?, queued_at = created_at WHERE body = ?", priority, body);
    }
    expect(bodies(await queue(app))).toEqual(["crisis", "reported", "ordinary old", "ordinary new"]);
  });

  it("colours the waiting time amber past the target and red past the hard limit", async () => {
    const at = (priority: number, hours: number) => ageLevel({ priority, queuedAt: NOW - hours * HOUR }, NOW);
    expect([at(0, 11), at(0, 13), at(0, 25)]).toEqual(["ok", "amber", "red"]); // ordinary: 12 h, 24 h
    expect([at(1, 5), at(1, 7), at(1, 25)]).toEqual(["ok", "amber", "red"]); // reported: 6 h, 24 h
    expect([at(2, 1), at(2, 3), at(2, 7)]).toEqual(["ok", "amber", "red"]); // crisis: 2 h, 6 h
    expect([waited(59), waited(3 * 3600 + 125), waited(2 * 86400 + 3600)]).toEqual(["0 min", "3 h 2 min", "2 d 1 h"]);

    const app = signedIn();
    await addRequest({ status: "held", body: "late", age: 13 * HOUR });
    await rows("UPDATE requests SET queued_at = created_at");
    expect(await queue(app)).toContain('<span class="tag amber">13 h 0 min, past its target</span>');
  });

  it("lets a moderator skip an item without any record", async () => {
    const app = signedIn();
    await postRequest(app, { body: "hard to read" });
    await postRequest(app, { body: "easy" });
    const id = await idOf("hard to read");
    const first = await queue(app);
    expect(first).toContain(`href="/mod?skip=${id}"`);
    const skippedView = await queue(app, `/mod?skip=${id}`);
    expect(bodies(skippedView)).toEqual(["easy"]);
    expect(skippedView).toContain("Show the 1 skipped");
    expect(await log()).toEqual([]);
    expect((await request(id)).status).toBe("held");
  });
});

describe("a moderator's decisions", () => {
  it("a held request appears on the wall only after a moderator publishes it", async () => {
    const app = signedIn();
    const { token } = await postRequest(app, { body: "Please pray for my exam." });
    const id = await idOf("Please pray for my exam.");
    const wall = async () => bodies(await (await app.request("/en?view=new")).text());
    expect(await wall()).toEqual([]);

    app.state.now += HOUR;
    const res = await act(app, id, "publish");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/mod");
    expect(await wall()).toEqual(["Please pray for my exam."]);
    expect(await request(id)).toMatchObject({
      status: "published", decided_by: "moderator", published_at: NOW + HOUR, expires_at: NOW + HOUR + 30 * DAY, queued_at: null, priority: 0,
    });
    expect(bodies(await queue(app))).toEqual([]);
    expect(await (await app.post("/en/mine", { token: token! })).text()).toContain("Your request is on the wall, and people can pray for it.");
    expect(await log()).toEqual([{ request_id: id, action: "publish", moderator: MOD, note: null, created_at: NOW + HOUR }]);
    expect(await rows("SELECT * FROM counters WHERE name = 'requests_total'")).toEqual([{ name: "requests_total", value: 1 }]);
  });

  it("a removal's reason shows on the author's private page", async () => {
    const app = signedIn();
    const { token } = await postRequest(app, { body: "Send me money please" });
    const id = await idOf("Send me money please");
    await act(app, id, "remove", { reason: "money" });
    expect(await request(id)).toMatchObject({ status: "removed", remove_reason: "money", queued_at: null });
    const mine = await (await app.post("/en/mine", { token: token! })).text();
    expect(mine).toContain("This request was removed by a moderator.");
    expect(mine).toContain("It asked for money, gifts or business.");
    expect(bodies(await (await app.request("/en?view=new")).text())).toEqual([]);
    expect(await log()).toMatchObject([{ request_id: id, action: "remove", moderator: MOD, note: "money" }]);
  });

  it("records an unknown removal reason as 'other', with no extra sentence for the author", async () => {
    const app = signedIn();
    const { token } = await postRequest(app);
    const id = (await rows<{ id: string }>("SELECT id FROM requests"))[0]!.id;
    await act(app, id, "remove", { reason: "<script>" });
    expect((await request(id)).remove_reason).toBe("other");
    const mine = await (await app.post("/en/mine", { token: token! })).text();
    expect(mine).toContain("<strong>This request was removed by a moderator.</strong></p>");
  });

  it("escalating keeps the item held and shows who asked", async () => {
    const app = signedIn();
    await postRequest(app, { body: "unsure about this" });
    const id = await idOf("unsure about this");
    await act(app, id, "escalate");
    expect(await request(id)).toMatchObject({ status: "held", escalated_by: MOD });
    app.state.moderator = "second@example.org";
    expect(await queue(app)).toContain(`Second opinion asked by ${MOD}`);
    await act(app, id, "publish");
    expect(await request(id)).toMatchObject({ status: "published", escalated_by: null });
    expect((await log()).map((l) => [l.action, l.moderator])).toEqual([["escalate", MOD], ["publish", "second@example.org"]]);
  });

  it("a removed request can be restored to the wall", async () => {
    const app = signedIn();
    await postRequest(app, { body: "removed by mistake" });
    const id = await idOf("removed by mistake");
    await act(app, id, "remove", { reason: "spam" });
    const removed = await queue(app, "/mod?view=removed");
    expect(removed).toContain("removed by mistake");
    expect(removed).toContain("Removed: Spam or a repeat");
    const res = await act(app, id, "restore");
    expect(res.headers.get("location")).toBe("/mod?view=removed");
    expect(await request(id)).toMatchObject({ status: "published", remove_reason: null, published_at: NOW });
    expect((await log()).map((l) => l.action)).toEqual(["remove", "restore"]);
  });

  it("writes every decision to the log, and nothing when a decision does not apply", async () => {
    const app = signedIn();
    await postRequest(app, { body: "one" });
    const id = await idOf("one");
    await act(app, id, "publish");
    // None of these applies: already published and not queued, not removed, unknown id, unknown action.
    await act(app, id, "publish");
    await act(app, id, "restore");
    await act(app, id, "escalate");
    await act(app, "aaaaaaaaaaaa", "remove", { reason: "spam" });
    expect((await act(app, id, "delete")).status).toBe(404);
    expect((await act(app, "not-an-id", "publish")).status).toBe(404);
    expect((await log()).map((l) => l.action)).toEqual(["publish"]);
    expect((await rows<{ value: number }>("SELECT value FROM counters WHERE name = 'requests_total'"))[0]!.value).toBe(1);
  });

  it("can never publish a seeded test post", async () => {
    const app = signedIn();
    const id = await addRequest({ status: "held", isTest: 1, body: "seeded rule-breaking example" });
    await rows("UPDATE requests SET queued_at = created_at");
    const html = await queue(app);
    expect(html).toContain("Test post: cannot be published");
    expect(html).not.toContain(`action="/mod/r/${id}/publish"`);
    await act(app, id, "publish");
    expect((await request(id)).status).toBe("held");
    expect(await log()).toEqual([]);
  });
});

describe("when nobody is moderating (unattended)", () => {
  const db = new D1DatabaseAdapter(d1);
  const deps = (alerts: { kind: string; text: string }[]) => ({
    db, limiter: new D1RateLimiter(d1), alerter: { send: async (kind: string, text: string) => void alerts.push({ kind, text }) },
  });

  it("pauses posting after a held request has waited 48 hours with no moderator action, and reopens on the first decision", async () => {
    const app = signedIn();
    await postRequest(app, { body: "waiting" });
    const id = await idOf("waiting");
    app.state.now += 47 * HOUR;
    expect(await isUnattended(db, app.state.now)).toBe(false);
    expect(await (await app.request("/en/new")).text()).toContain("<form");

    app.state.now += 2 * HOUR;
    expect(await isUnattended(db, app.state.now)).toBe(true);
    const form = await (await app.request("/en/new")).text();
    expect(form).toContain("Posting is paused for now. You can still read the wall.");
    expect(form).not.toContain("<form");
    expect(await (await postRequest(app)).html).toContain("Posting is paused for now.");
    expect(await rows("SELECT id FROM requests")).toHaveLength(1);
    expect(await queue(app)).toContain("Nobody has moderated for 48 hours, so posting is paused.");
    // Reading continues.
    expect((await app.request("/en")).status).toBe(200);

    await act(app, id, "publish");
    expect(await isUnattended(db, app.state.now)).toBe(false);
    expect(await (await app.request("/en/new")).text()).toContain("<form");
  });

  it("is not triggered by a quiet wall, or while a moderator is still acting", async () => {
    expect(await isUnattended(db, NOW)).toBe(false); // nothing waiting at all
    const app = signedIn();
    await postRequest(app, { body: "old" });
    await postRequest(app, { body: "other" });
    app.state.now += 40 * HOUR;
    await act(app, await idOf("other"), "publish"); // a moderator acted 40 hours in
    app.state.now += 20 * HOUR;
    expect(await isUnattended(db, app.state.now)).toBe(false);
    app.state.now += 30 * HOUR;
    expect(await isUnattended(db, app.state.now)).toBe(true);
  });

  it("alerts once when 20 items are waiting, and again only after six hours", async () => {
    const alerts: { kind: string; text: string }[] = [];
    for (let i = 0; i < 19; i++) await addRequest({ status: "held", age: HOUR });
    await rows("UPDATE requests SET queued_at = created_at");
    await checkQueue(deps(alerts), NOW);
    expect(alerts).toEqual([]);
    await addRequest({ status: "held", age: HOUR });
    await rows("UPDATE requests SET queued_at = created_at");
    await checkQueue(deps(alerts), NOW);
    await checkQueue(deps(alerts), NOW + 1800);
    expect(alerts).toEqual([{ kind: "queue_waiting", text: "20 item(s) are waiting for review; 0 past their target time." }]);
    await checkQueue(deps(alerts), NOW + 7 * HOUR);
    expect(alerts).toHaveLength(2);
  });

  it("alerts when any item is past its target time, and never includes request text", async () => {
    const alerts: { kind: string; text: string }[] = [];
    await addRequest({ status: "held", body: "private words", age: 13 * HOUR });
    await rows("UPDATE requests SET queued_at = created_at");
    await checkQueue(deps(alerts), NOW);
    expect(alerts).toEqual([{ kind: "queue_waiting", text: "1 item(s) are waiting for review; 1 past their target time." }]);
    expect(JSON.stringify(alerts)).not.toContain("private words");
  });

  it("sends the unattended alert once a day, and nothing when the queue is empty", async () => {
    const alerts: { kind: string; text: string }[] = [];
    await checkQueue(deps(alerts), NOW);
    await addRequest({ status: "held", age: 50 * HOUR });
    await rows("UPDATE requests SET queued_at = created_at");
    await checkQueue(deps(alerts), NOW);
    await checkQueue(deps(alerts), NOW + HOUR);
    expect(alerts.map((a) => a.kind)).toEqual(["unattended"]);
    expect(alerts[0]!.text).toContain("Posting is paused");
  });
});
