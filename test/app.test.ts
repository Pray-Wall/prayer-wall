// SPDX-License-Identifier: AGPL-3.0-or-later
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { sourceUrl } from "../src/index";

describe("home page", () => {
  it("says Prayer Wall", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<h1>Prayer Wall</h1>");
    expect(html).toContain('lang="en"');
  });

  it("links to the source code", async () => {
    const html = await (await SELF.fetch("https://example.com/")).text();
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
    const app = createApp({ db: { ping: async () => false }, sourceUrl: "x" });
    const res = await app.request("/healthz");
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
  it("return 404", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
  });
});
