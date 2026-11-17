// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from "vitest";
import { decodeCursor } from "../src/lib/wall";
import { DAY, HOUR, addRequest, bodies, clearRequests, testApp } from "./helpers";

const get = async (path: string) => (await testApp().request(path)).text();
const nextHref = (html: string) => html.match(/class="btn" href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");

beforeEach(clearRequests);

describe("the wall page", () => {
  it("is finished HTML with no script at all", async () => {
    await addRequest({ body: "Please pray for my exam" });
    const html = await get("/en");
    expect(html).toContain("Please pray for my exam");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
  });

  it("is left to right in English and right to left in Arabic", async () => {
    expect(await get("/en")).toMatch(/<html lang="en" dir="ltr">/);
    const ar = await get("/ar");
    expect(ar).toMatch(/<html lang="ar" dir="rtl">/);
    expect(ar).toContain("جدار الصلاة");
    expect(ar).toContain("بحاجة إلى صلاة");
    expect(ar).not.toContain("Needs prayer");
  });

  it("marks each request with its own language and automatic direction, hidden from snippets", async () => {
    await addRequest({ body: "أرجو أن تصلّوا من أجلي", lang: "ar" });
    const html = await get("/en");
    expect(html).toMatch(/<p class="text" lang="ar" dir="auto" data-nosnippet="[^"]*">أرجو أن تصلّوا من أجلي<\/p>/);
  });

  it("escapes user text and shows it as plain text", async () => {
    await addRequest({ body: `<script>alert(1)</script> & "quotes"`, name: "<b>Eve</b>", kind: "other" });
    const html = await get("/en");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;");
    expect(html).toContain("<bdi>&lt;b&gt;Eve&lt;/b&gt;</bdi>");
  });

  it("shows who it is for, the first name, the age and the prayer count", async () => {
    await addRequest({ kind: "other", name: "Grace", prayed: 3, age: 2 * HOUR });
    await addRequest({ kind: "event", prayed: 1, age: 3 * DAY });
    await addRequest({ kind: "self", prayed: 0, age: 60 });
    const html = await get("/en?view=new");
    expect(html).toContain("For someone else · <bdi>Grace</bdi>");
    expect(html).toContain("For an event or group");
    expect(html).toContain("Personal request");
    expect(html).toContain("2 hours ago");
    expect(html).toContain("3 days ago");
    expect(html).toContain("1 minute ago");
    expect(html).toContain("Prayed 3 times");
    expect(html).toContain("Prayed once");
    expect(html).toContain("No prayers yet");
  });

  it("uses Arabic plural forms", async () => {
    for (const prayed of [0, 1, 2, 5, 11]) await addRequest({ prayed });
    const html = await get("/ar");
    for (const s of ["لم يُصلِّ أحد بعد", "صلاة واحدة", "صلاتان", " صلوات", " صلاة"]) expect(html).toContain(s);
  });

  it("only shows published, unexpired, non-test requests", async () => {
    await addRequest({ body: "visible" });
    await addRequest({ body: "held", status: "held" });
    await addRequest({ body: "removed", status: "removed" });
    await addRequest({ body: "test post", isTest: 1 });
    await addRequest({ body: "expired", age: 2 * DAY, expiresAt: 1 });
    for (const view of ["need", "new"]) expect(bodies(await get(`/en?view=${view}`))).toEqual(["visible"]);
  });

  it("says so when the wall is empty", async () => {
    const html = await get("/en");
    expect(html).toContain("There are no requests here yet.");
    expect(html).not.toContain('class="btn"');
  });

  it("marks the active tab", async () => {
    expect(await get("/en")).toMatch(/<a href="\/en" aria-current="page">Needs prayer<\/a>/);
    expect(await get("/en?view=new")).toMatch(/<a href="\/en\?view=new" aria-current="page">Newest<\/a>/);
  });
});

describe("Needs prayer ordering", () => {
  it("puts a reach of zero ahead of a reach of ten, whatever the count on the card", async () => {
    await addRequest({ body: "ten", reach: 10, prayed: 10, age: 5 * HOUR });
    await addRequest({ body: "zero", reach: 0, prayed: 40, age: HOUR });
    expect(bodies(await get("/en"))).toEqual(["zero", "ten"]);
  });

  it("breaks ties oldest first", async () => {
    await addRequest({ body: "newer", reach: 2, age: HOUR });
    await addRequest({ body: "older", reach: 2, age: 9 * HOUR });
    expect(bodies(await get("/en"))).toEqual(["older", "newer"]);
  });

  it("is the default view", async () => {
    await addRequest({ body: "a", reach: 5, age: HOUR });
    await addRequest({ body: "b", reach: 0, age: 2 * HOUR });
    expect(bodies(await get("/en"))).toEqual(bodies(await get("/en?view=need")));
    expect(bodies(await get("/en?view=nonsense"))).toEqual(["b", "a"]);
  });

  it("draws on 7 days when that gives 60 requests", async () => {
    for (let i = 0; i < 60; i++) await addRequest({ body: `recent ${i}`, reach: 1, age: DAY });
    await addRequest({ body: "ten days old", reach: 0, age: 10 * DAY });
    expect(bodies(await get("/en"))).not.toContain("ten days old");
  });

  it("widens to 14 days, then 30, when the wall is quiet", async () => {
    await addRequest({ body: "ten days old", reach: 0, age: 10 * DAY });
    await addRequest({ body: "twenty days old", reach: 0, age: 20 * DAY });
    await addRequest({ body: "recent", reach: 3, age: DAY });
    // Fewer than 60 in 7 and in 14 days: the window is 30 days.
    expect(bodies(await get("/en"))).toEqual(["twenty days old", "ten days old", "recent"]);
    // 60 within 14 days: the window stops at 14.
    for (let i = 0; i < 58; i++) await addRequest({ body: `filler ${i}`, reach: 9, age: 12 * DAY });
    const first = bodies(await get("/en"));
    expect(first).toContain("ten days old");
    expect(first).not.toContain("twenty days old");
  });
});

describe("Newest ordering", () => {
  it("is newest first regardless of prayers", async () => {
    await addRequest({ body: "old", reach: 0, age: 3 * DAY });
    await addRequest({ body: "new", reach: 50, age: HOUR });
    await addRequest({ body: "ancient but unexpired", reach: 0, age: 25 * DAY });
    expect(bodies(await get("/en?view=new"))).toEqual(["new", "old", "ancient but unexpired"]);
  });
});

describe("paging", () => {
  it.each(["need", "new"])("walks every request exactly once in the %s view, 20 per page", async (view) => {
    // Ties in both sort keys, to prove the id breaks them.
    for (let i = 0; i < 45; i++) await addRequest({ body: `r${i}`, reach: i % 3, age: (i % 5) * HOUR + HOUR });
    const seen: string[] = [];
    let path: string | undefined = `/en?view=${view}`;
    const sizes: number[] = [];
    while (path) {
      const html: string = await get(path);
      const page = bodies(html);
      sizes.push(page.length);
      seen.push(...page);
      path = nextHref(html);
    }
    expect(sizes).toEqual([20, 20, 5]);
    expect(new Set(seen).size).toBe(45);
  });

  it("does not skip or repeat when counts change between pages", async () => {
    for (let i = 0; i < 30; i++) await addRequest({ body: `r${i}`, reach: i, age: HOUR });
    const page1 = await get("/en");
    const next = nextHref(page1)!;
    // A request already shown gets many prayers before the visitor asks for more.
    const { d1 } = await import("./helpers");
    await d1.prepare("UPDATE requests SET reach_count = 100 WHERE body = 'r3'").run();
    const page2 = bodies(await get(next));
    expect(page2.slice(0, 9)).toEqual(["r20", "r21", "r22", "r23", "r24", "r25", "r26", "r27", "r28"]);
  });

  it("has no More link on the last page, and keeps the view in the link", async () => {
    for (let i = 0; i < 21; i++) await addRequest({});
    const html = await get("/en?view=new");
    expect(nextHref(html)).toMatch(/^\/en\?view=new&after=[\w-]+$/);
    expect(nextHref(await get(nextHref(html)!))).toBeUndefined();
  });

  it("treats a malformed cursor as the first page", async () => {
    await addRequest({ body: "only" });
    for (const bad of ["garbage", "W10", "%00", "a".repeat(500)]) {
      expect(bodies(await get(`/en?after=${bad}`))).toEqual(["only"]);
    }
    expect(decodeCursor("need", "WzEsMiwibm90LWFuLWlkIl0")).toBeUndefined();
  });
});
