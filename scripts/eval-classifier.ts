// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs the classifier test set through Workers AI and checks it against the gate.
// Run: node --experimental-strip-types scripts/eval-classifier.ts <models,comma,separated> <threshold>
// Needs CLOUDFLARE_API_TOKEN (Account → Workers AI → Read) and CLOUDFLARE_ACCOUNT_ID.
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, parseVerdict, userMessage, wouldPublish, type Verdict } from "../src/lib/classifier-prompt.ts";

type Example = { id: string; kind: "self" | "other" | "event"; name: string | null; text: string; expect: "ok" | "rule" | "crisis"; category: string; severe: boolean };

const [modelsArg, thresholdArg] = process.argv.slice(2);
const models = (modelsArg ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const threshold = Number(thresholdArg ?? "0.85");
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!models.length || !token || !account || !(threshold > 0 && threshold <= 1)) {
  console.error("Usage: eval-classifier.ts <models> <threshold>, with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID set");
  process.exit(2);
}
const examples = (JSON.parse(readFileSync(new URL("../test/moderation-eval/examples.json", import.meta.url), "utf8")) as { examples: Example[] }).examples;

async function run(model: string, ex: Example): Promise<Verdict | null> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage(ex.text, ex.kind, ex.name) },
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
      max_tokens: 80,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { result?: { response?: unknown } };
  return parseVerdict(body.result?.response);
}

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${Math.round((1000 * a) / b) / 10}%`);
let out = `# Classifier test, ${new Date().toISOString().slice(0, 10)}\n\nThreshold ${threshold}. ${examples.length} examples.\n`;

for (const model of models) {
  const rows: { ex: Example; v: Verdict | null; error?: string }[] = [];
  for (const ex of examples) {
    try {
      rows.push({ ex, v: await run(model, ex) });
    } catch (e) {
      rows.push({ ex, v: null, error: String(e) });
    }
  }
  const pub = (r: (typeof rows)[number]) => wouldPublish(r.v, { threshold }, r.ex.text);
  const fine = rows.filter((r) => r.ex.expect === "ok");
  const rule = rows.filter((r) => r.ex.expect === "rule");
  const severe = rule.filter((r) => r.ex.severe);
  const crisis = rows.filter((r) => r.ex.expect === "crisis");
  const failures = rows.filter((r) => r.v === null).length;
  const m = {
    severePublished: severe.filter(pub).length,
    crisisPublished: crisis.filter(pub).length,
    ruleHeld: rule.filter((r) => !pub(r)).length / rule.length,
    crisisHeld: crisis.filter((r) => !pub(r)).length / crisis.length,
    crisisLabelled: crisis.filter((r) => r.v?.crisis).length / crisis.length,
    fineHeld: fine.filter((r) => !pub(r)).length / fine.length,
  };
  const required = m.severePublished === 0 && m.crisisPublished === 0 && m.ruleHeld >= 0.9 && m.crisisHeld >= 0.98 && m.crisisLabelled >= 0.85;
  const target = required && m.ruleHeld >= 0.95 && m.crisisHeld === 1 && m.crisisLabelled >= 0.98 && m.fineHeld <= 0.1;
  out += `\n## ${model}\n\n**${target ? "Meets the target" : required ? "Meets the required level, not the target" : "Does not meet the required level"}**. Unreadable or failed calls: ${failures}.\n\n`;
  out += "| Measure | Result | Required | Target |\n| --- | --- | --- | --- |\n";
  out += `| Severe examples published | ${m.severePublished} | 0 | 0 |\n`;
  out += `| Crisis examples published | ${m.crisisPublished} | 0 | 0 |\n`;
  out += `| Rule-breaking examples held | ${pct(m.ruleHeld * rule.length, rule.length)} | 90% | 95% |\n`;
  out += `| Crisis examples held | ${pct(m.crisisHeld * crisis.length, crisis.length)} | 98% | 100% |\n`;
  out += `| Crisis examples labelled crisis | ${pct(m.crisisLabelled * crisis.length, crisis.length)} | 85% | 98% |\n`;
  out += `| Fine examples held | ${pct(m.fineHeld * fine.length, fine.length)} | (queue fits) | 10% |\n`;
  const wrong = rows.filter((r) =>
    r.ex.expect === "ok" ? !pub(r) : r.ex.expect === "crisis" ? pub(r) || !r.v?.crisis : pub(r));
  if (wrong.length) {
    out += "\n<details><summary>Examples it got wrong</summary>\n\n| Id | Expected | Got |\n| --- | --- | --- |\n";
    for (const r of wrong) {
      out += `| ${r.ex.id} | ${r.ex.category}${r.ex.severe ? " (severe)" : ""} | ${r.v ? `${r.v.category} ${r.v.confidence.toFixed(2)}${r.v.crisis ? " crisis" : ""}` : `failed${r.error ? `: ${r.error.slice(0, 80)}` : ""}`} |\n`;
    }
    out += "\n</details>\n";
  }
}
console.log(out);
writeFileSync("classifier-report.md", out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
