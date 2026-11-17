// SPDX-License-Identifier: AGPL-3.0-or-later
// The fixed text rules. They work the same in every language, and each has a plain message
// (locales: err_<code>). A refused post is returned with everything the author typed.

export const MAX_BODY = 500;
export const MAX_NAME = 30;

export type RuleError =
  | "empty" | "too_long" | "link" | "email" | "phone" | "handle"
  | "name_long" | "name_contact" | "kind";

/** Length as people count it: by character, not by UTF-16 unit. */
export const length = (s: string) => [...s].length;

/** Turns every Unicode decimal digit (Arabic-Indic, Devanagari, full-width ...) into 0-9. */
function asciiDigits(s: string): string {
  return s.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!;
    if (cp < 128) return d;
    // Digit blocks are runs of ten starting at a zero: count back to the start of the run.
    let steps = 0;
    while (steps < 60 && /\p{Nd}/u.test(String.fromCodePoint(cp - steps - 1))) steps++;
    return String(steps % 10);
  });
}

const TLDS =
  "com|org|net|info|biz|io|me|co|app|dev|xyz|online|site|link|shop|club|live|top|tv|cc|gg|ly|" +
  "ru|ua|by|kz|id|br|pt|es|fr|de|it|nl|pl|uk|us|ca|au|in|pk|kr|jp|cn|tw|il|sa|ae|eg|tr|ir|ng|za|mx|ar|рф";
const LINK = new RegExp(
  String.raw`[a-z][a-z0-9+.-]*:\/\/|\bwww\.[\p{L}\p{N}-]|[\p{L}\p{N}-]+\.(?:${TLDS})(?![\p{L}\p{N}])`,
  "iu",
);
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/u;
const HANDLE = /(?:^|[^\p{L}\p{N}])@[\p{L}\p{N}_.]{2,}/u;
// Seven or more digits, allowing spaces, dashes and brackets between them.
const PHONE = /(?:\+?\d[\s()\-‐-―]{0,3}){7,}/u;

/** The first contact detail found in the text, if any. */
export function contactIn(text: string): "link" | "email" | "phone" | "handle" | null {
  if (EMAIL.test(text)) return "email";
  if (LINK.test(text)) return "link";
  if (HANDLE.test(text)) return "handle";
  if (PHONE.test(asciiDigits(text))) return "phone";
  return null;
}

export type Draft = { kind: string; name: string; body: string };

/** Returns the first rule the draft breaks, or null when it may go on. */
export function checkDraft(d: Draft): RuleError | null {
  if (!["self", "other", "event"].includes(d.kind)) return "kind";
  const body = d.body.trim();
  if (body === "") return "empty";
  if (length(body) > MAX_BODY) return "too_long";
  const contact = contactIn(body);
  if (contact) return contact;
  const name = d.name.trim();
  if (length(name) > MAX_NAME) return "name_long";
  if (name && contactIn(name)) return "name_contact";
  return null;
}
