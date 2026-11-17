// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bodyHash, dailyHasher, extractToken, newOwnerToken, newRequestId, normaliseBody, ownerHash } from "../src/lib/hashes";
import { checkDraft, contactIn } from "../src/lib/rules";

const draft = (body: string, name = "", kind = "self") => checkDraft({ kind, name, body });

describe("fixed text rules", () => {
  it.each([
    ["Please pray for my mother. She is having surgery on Friday.", null],
    ["Thank you God for 3 healthy children, born in 2019, 2021 and 2024.", null],
    ["My exam is on 12.11.2026 at 9:30. Please pray.", null],
    ["Pray for my family.We need peace.Thank you", null],
    ["أرجو أن تصلّوا من أجلي. أمرّ بفترة صعبة.", null],
    ["Psalm 23:4 gives me comfort. Pray for me @ this hard time.", null],
  ])("accepts %j", (body, expected) => {
    expect(draft(body)).toBe(expected);
  });

  it("refuses an empty request", () => {
    expect(draft("")).toBe("empty");
    expect(draft("   \n ")).toBe("empty");
  });

  it("refuses more than 500 characters, counting characters and not bytes", () => {
    expect(draft("a".repeat(500))).toBeNull();
    expect(draft("a".repeat(501))).toBe("too_long");
    expect(draft("🙏".repeat(500))).toBeNull();
    expect(draft("ص".repeat(501))).toBe("too_long");
  });

  it.each([
    "See https://example.com for my story",
    "visit www.example.org please",
    "my page is example.com",
    "write me on t.me/someone",
    "напишите на сайт.рф",
    "ftp://files.example/x",
  ])("refuses a link: %j", (body) => {
    expect(draft(body)).toBe("link");
  });

  it.each(["write to maria@example.com", "почта: ivan@почта.рф"])("refuses an email address: %j", (body) => {
    expect(draft(body)).toBe("email");
  });

  it.each([
    "call me on +1 415 555 0132",
    "my number is (0361) 555-0199",
    "whatsapp 081234567890",
    "اتصل بي ٠٥٥١٢٣٤٥٦٧",
    "फ़ोन ९८७६५४३२१०",
    "tel 0812-3456-7890",
  ])("refuses a phone number in any script: %j", (body) => {
    expect(draft(body)).toBe("phone");
  });

  it.each(["follow @prayer_help", "telegram: @someone.here"])("refuses a username: %j", (body) => {
    expect(draft(body)).toBe("handle");
  });

  it("applies the rules to the first name too", () => {
    expect(draft("Please pray", "Maria")).toBeNull();
    expect(draft("Please pray", "x".repeat(31))).toBe("name_long");
    expect(draft("Please pray", "@maria")).toBe("name_contact");
    expect(draft("Please pray", "0812 3456 789")).toBe("name_contact");
  });

  it("requires a valid choice of who it is for", () => {
    expect(draft("Please pray", "", "")).toBe("kind");
    expect(draft("Please pray", "", "everyone")).toBe("kind");
  });

  it("finds nothing in ordinary text", () => {
    expect(contactIn("Pray for peace in our home.")).toBeNull();
  });
});

describe("hashes", () => {
  it("gives one visitor the same hash within a day and a different one the next day", async () => {
    const day1 = await dailyHasher("secret", 1_800_000_000);
    const later = await dailyHasher("secret", 1_800_000_000 + 3600);
    const day2 = await dailyHasher("secret", 1_800_000_000 + 86400);
    const a = await day1.visitor("198.51.100.1");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await later.visitor("198.51.100.1")).toBe(a);
    expect(await day2.visitor("198.51.100.1")).not.toBe(a);
    expect(await day1.visitor("198.51.100.2")).not.toBe(a);
    expect(a).not.toContain("198.51.100.1");
  });

  it("depends on the master secret, and keeps device and visitor hashes apart", async () => {
    const h = await dailyHasher("secret", 1_800_000_000);
    const other = await dailyHasher("other", 1_800_000_000);
    expect(await other.visitor("198.51.100.1")).not.toBe(await h.visitor("198.51.100.1"));
    expect(await h.device("198.51.100.1")).not.toBe(await h.visitor("198.51.100.1"));
  });

  it("treats trivially different text as the same for duplicates", async () => {
    expect(normaliseBody("  Please   PRAY\nfor me ")).toBe("please pray for me");
    expect(await bodyHash("s", "Please pray for me")).toBe(await bodyHash("s", " please  PRAY for me\n"));
    expect(await bodyHash("s", "Please pray for me")).not.toBe(await bodyHash("s", "Please pray for him"));
  });

  it("makes ids and tokens of the documented shape", async () => {
    expect(newRequestId()).toMatch(/^[a-z2-7]{12}$/);
    const token = newOwnerToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(newOwnerToken()).not.toBe(token);
    expect(await ownerHash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(await ownerHash(token)).not.toContain(token);
  });

  it("reads the token from a bare token or a whole link", () => {
    const token = "0123456789abcdef0123456789abcdef";
    expect(extractToken(token)).toBe(token);
    expect(extractToken(` https://example.com/en/mine#${token} `)).toBe(token);
    expect(extractToken("nonsense")).toBeNull();
    expect(extractToken("")).toBeNull();
    expect(extractToken(undefined)).toBeNull();
  });
});
