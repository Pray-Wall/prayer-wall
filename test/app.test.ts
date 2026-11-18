// SPDX-License-Identifier: AGPL-3.0-or-later
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp, type AppDeps } from "../src/app";
import type { Database } from "../src/lib/database";
import { sourceUrl } from "../src/index";
import { testApp } from "./helpers";

describe("root", () => {
  it("redirects to the browser's language", async () => {
    const res = await SELF.fetch("https://example.com/", { redirect: "manual", headers: { "Accept-Language": "en-GB,en;q=0.9" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/en");
    expect(res.headers.get("vary")).toContain("Accept-Language");
  });

  it("falls back to English for an unsupported or missing language", async () => {
    const app = testApp();
    expect((await app.request("/", { headers: { "Accept-Language": "xx, yy;q=0.5" } })).headers.get("location")).toBe("/en");
    expect((await app.request("/")).headers.get("location")).toBe("/en");
  });

  it("skips languages the interface does not have", async () => {
    const res = await testApp().request("/", { headers: { "Accept-Language": "ar;q=0.9, en;q=0.3" } });
    expect(res.headers.get("location")).toBe("/en");
  });
});

describe("the deployed worker", () => {
  it("serves the wall and the stylesheet", async () => {
    const res = await SELF.fetch("https://example.com/en");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Prayer Wall");
    expect(html).toContain('href="https://github.com/Pray-Wall/prayer-wall"');
  });
});

describe("/healthz", () => {
  it("returns 200 when the database answers", async () => {
    const res = await SELF.fetch("https://example.com/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 when the database does not answer", async () => {
    const db = { ping: async () => false } as unknown as Database;
    const res = await createApp({ ...({} as AppDeps), db, sourceUrl: "x" }).request("/healthz");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});

describe("sourceUrl", () => {
  const REPO_URL = "https://github.com/Pray-Wall/prayer-wall";
  it("points at the deployed commit", () => {
    expect(sourceUrl({ GIT_SHA: "0123abc", REPO_URL })).toBe(`${REPO_URL}/tree/0123abc`);
  });
  it("falls back to the repository when no commit is known", () => {
    expect(sourceUrl({ GIT_SHA: "dev", REPO_URL })).toBe(REPO_URL);
  });
});

describe("unknown paths", () => {
  it("an unknown language code falls back to English, keeping the query", async () => {
    const res = await testApp().request("/de?view=new");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/en?view=new");
  });
  it("anything else is a 404", async () => {
    expect((await testApp().request("/not-a-language-code")).status).toBe(404);
    expect((await testApp().request("/en/nope")).status).toBe(404);
    expect((await testApp().request("/de/new")).headers.get("location")).toBe("/en/new");
  });
});
