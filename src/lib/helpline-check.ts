// SPDX-License-Identifier: AGPL-3.0-or-later
// The weekly check of the crisis helpline link (blueprint, "The helpline link").
import { HELPLINE_URL } from "../views/support";
import type { Database } from "./database";
import type { Alerter } from "./services";

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** True when the directory answers with a page. A failure alerts the maintainer; a person then checks it by hand. */
export async function checkHelpline(deps: { db: Database; alerter: Alerter; fetch: Fetcher }, now: number): Promise<boolean> {
  let ok = false;
  let detail = "";
  try {
    const res = await deps.fetch(HELPLINE_URL, { redirect: "follow", headers: { "User-Agent": "PrayerWall-link-check" } });
    ok = res.ok && (res.headers.get("Content-Type") ?? "").includes("text/html");
    detail = `HTTP ${res.status}`;
  } catch (e) {
    detail = String(e).slice(0, 100);
  }
  await deps.db.logEvent("helpline_check", "schedule", ok ? "ok" : detail, now);
  if (!ok) await deps.alerter.send("helpline", `The helpline link ${HELPLINE_URL} did not answer properly (${detail}). Check it by hand; the support panel depends on it.`);
  return ok;
}
