// SPDX-License-Identifier: AGPL-3.0-or-later
// Load tests from the blueprint (M7), run against the STAGING copy only, never production.
//   node --experimental-strip-types scripts/load-test.ts https://prayer-wall-staging.example.workers.dev normal
// Scenarios: normal, burst, reports, farming. See docs/runbook.md, "Load tests".
// Staging trusts the X-Test-Client-IP header (ENVIRONMENT=staging only) so one machine can act as many visitors,
// and uses Turnstile's always-pass test keys.

const [base, scenario = "normal", minutesArg = "10"] = process.argv.slice(2);
if (!base || !base.includes("staging")) {
  console.error("Usage: load-test.ts <staging url> <normal|burst|reports|farming> [minutes]. The address must contain 'staging'.");
  process.exit(2);
}
const minutes = Number(minutesArg);
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX"; // accepted by Turnstile's test secret
const ip = (n: number) => `198.18.${(n >> 8) & 255}.${n & 255}`;
const times: number[] = [];
let errors = 0;
let total = 0;

async function call(path: string, init: RequestInit & { ip: number }): Promise<Response | null> {
  const t = performance.now();
  total++;
  try {
    const res = await fetch(base + path, {
      ...init, redirect: "manual",
      headers: { Origin: base, "X-Test-Client-IP": ip(init.ip), ...(init.headers as Record<string, string> | undefined) },
    });
    times.push(performance.now() - t);
    if (res.status >= 500) errors++;
    await res.arrayBuffer();
    return res;
  } catch {
    errors++;
    return null;
  }
}
const form = (o: Record<string, string>) => ({ method: "POST", body: new URLSearchParams(o), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
const post = (n: number, body: string) =>
  call("/en/new", { ...form({ kind: "self", name: "", body, device: `load-${n}-device-0123456789`, "cf-turnstile-response": TOKEN }), ip: n });
const pray = (id: string, n: number, device: string) =>
  call(`/api/r/${id}/prayed`, { method: "POST", body: JSON.stringify({ device }), headers: { "X-Prayer-Wall": "1", "Content-Type": "application/json" }, ip: n });
const report = (id: string, n: number) => call(`/en/r/${id}/report`, { ...form({ reason: "spam" }), ip: n });

/** Runs `fn` `perMinute` times a minute, spread evenly, for the test's length. */
async function paced(perMinute: number, fn: (i: number) => Promise<unknown>, mins = minutes) {
  const gap = 60000 / perMinute;
  const end = Date.now() + mins * 60000;
  const running: Promise<unknown>[] = [];
  for (let i = 0; Date.now() < end; i++) {
    running.push(fn(i));
    await new Promise((r) => setTimeout(r, gap));
  }
  await Promise.all(running);
}

async function wallIds(): Promise<string[]> {
  const html = await (await fetch(`${base}/en?view=new`)).text();
  return [...html.matchAll(/action="\/en\/r\/([a-z0-9]+)\/prayed"/g)].map((m) => m[1]!);
}

const scenarios: Record<string, () => Promise<void>> = {
  // 50 posts and 2,000 prayers a minute, with 100 wall views a second.
  async normal() {
    const ids = await wallIds();
    if (!ids.length) throw new Error("Seed the staging wall first (Seed sample data on staging).");
    await Promise.all([
      paced(50, (i) => post(i % 5000, `Please pray for my family, load test ${Date.now()} ${i}.`)),
      paced(2000, (i) => pray(ids[i % ids.length]!, i % 20000, `load-device-${i}-0123456789`)),
      paced(6000, (i) => call(i % 2 ? "/en" : "/en?view=new", { ip: i % 20000 })),
    ]);
  },
  // 200 posts in 10 minutes from 50 visitors: the site must be in review_all within a minute.
  async burst() {
    await paced(20, (i) => post(i % 50, `Please pray for peace, burst ${Date.now()} ${i}.`), 10);
  },
  // 500 reports in 5 minutes from 20 visitors against 50 requests.
  async reports() {
    const ids = (await wallIds()).slice(0, 50);
    await paced(100, (i) => report(ids[i % ids.length]!, i % 20), 5);
  },
  // 5,000 taps on one request from one address, a new device id each time.
  async farming() {
    const [id] = await wallIds();
    await paced(500, (i) => pray(id!, 1, `farm-${i}-0123456789abcdef`), 10);
  },
};

const run = scenarios[scenario];
if (!run) throw new Error(`Unknown scenario ${scenario}`);
const started = Date.now();
await run();
times.sort((a, b) => a - b);
const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
console.log(JSON.stringify({ scenario, seconds: Math.round((Date.now() - started) / 1000), requests: total, errors, errorRate: total ? errors / total : 0, p95ms: Math.round(p95) }, null, 2));
console.log("Then check the expectations in docs/runbook.md (counts, mode, alerts) by hand.");
