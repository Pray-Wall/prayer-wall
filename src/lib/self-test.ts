// SPDX-License-Identifier: AGPL-3.0-or-later
// The weekly self-test (Revision 2.2, change 3): 10 fine, 10 rule-breaking and 3 crisis examples
// from the test set go through the live classifier. If any rule-breaking or crisis example would be
// published, the stricter threshold is applied at once and the maintainer is alerted.
import examples from "../../test/moderation-eval/examples.json";
import { wouldPublish } from "./classifier-prompt";
import { classify, type ClassifierDeps } from "./classifier";
import type { Database } from "./database";
import { setStrictForced, strictForced } from "./operating";

type Example = { id: string; kind: "self" | "other" | "event"; name: string | null; text: string; expect: string; severe: boolean };

const IDS = [
  "ok001", "ok002", "ok005", "ok010", "ok014", "ok020", "ok028", "ok036", "ok047", "ok060",
  "rule001", "rule009", "rule017", "rule024", "rule030", "rule036", "rule043", "rule051", "rule052", "rule059",
  "crisis001", "crisis006", "crisis026",
];

export const SELF_TEST: Example[] = (examples.examples as Example[]).filter((e) => IDS.includes(e.id));

const RESULT = "self_test_ok";
const AT = "self_test_at";

export async function runSelfTest(deps: ClassifierDeps & { db: Database }, threshold: number, now: number): Promise<boolean> {
  let leaks = 0;
  let failures = 0;
  for (const ex of SELF_TEST) {
    const result = await classify(deps, { text: ex.text, kind: ex.kind, name: ex.name }, now);
    if (!result) failures++;
    else if (ex.expect !== "ok" && wouldPublish(result.verdict, { threshold }, ex.text)) leaks++;
  }
  const passed = leaks === 0 && failures === 0;
  await deps.db.setState(RESULT, passed ? 1 : 0);
  await deps.db.setState(AT, now);
  await deps.db.logEvent("self_test", "schedule", `${leaks} leak(s), ${failures} failure(s) of ${SELF_TEST.length}`, now);
  if (leaks > 0 && !(await strictForced(deps.db))) {
    await setStrictForced(deps.db, true, "self_test", now);
  }
  if (!passed) {
    await deps.alerter.send(
      "self_test",
      `Weekly classifier self-test: ${leaks} rule-breaking or crisis example(s) would have been published and ${failures} call(s) failed.${leaks ? " The stricter threshold now applies." : ""}`,
    );
  }
  return passed;
}

/** For /healthz/ai: pass only when a self-test has run in the last 8 days and passed. */
export async function selfTestHealthy(db: Database, now: number): Promise<boolean> {
  const at = (await db.getState(AT)) ?? 0;
  return (await db.getState(RESULT)) === 1 && now - at < 8 * 86400;
}
