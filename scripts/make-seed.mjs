// SPDX-License-Identifier: AGPL-3.0-or-later
// Writes seed/seed.sql: 40 invented sample requests in English, for development and staging.
// None of these is a real person's request. Run: node scripts/make-seed.mjs
import { writeFileSync } from "node:fs";

// [lang, kind, name, body]
const samples = [
  ["en", "self", null, "Please pray for me. I have an important exam on Friday and I am very anxious."],
  ["en", "other", "Grace", "My mother Grace is having surgery this week. Please pray for the doctors and for her recovery."],
  ["en", "self", "Daniel", "I lost my job last month. Please pray that I find work and stay hopeful."],
  ["en", "event", null, "Our youth group is travelling this weekend. Please pray for a safe journey."],
  ["en", "self", null, "Thank you God for a healthy baby girl. Please pray for strength for our family."],
  ["en", "other", "Tom", "My friend Tom is grieving the loss of his father. Please pray for comfort."],
  ["en", "self", null, "Please pray for my marriage. We are going through a hard season and need patience and kindness."],
  ["en", "other", "Lucy", "My daughter Lucy has a high fever tonight. Please pray for her healing and for calm in our home."],
  ["en", "self", "Carlos", "I start a new job on Monday. Please pray that I do it well and get along with my team."],
  ["en", "event", null, "Our church is hosting a meal for families in need this Sunday. Please pray for peace and enough food for all."],
  ["en", "self", null, "I have medical tests next week. Please pray for good results and for peace while I wait."],
  ["en", "other", "John", "My brother John has been out of work for a long time. Please pray for an open door."],
  ["en", "self", "Anna", "Thank God my mother is home from hospital. Please pray that she keeps getting stronger."],
  ["en", "self", null, "I moved to a new city and feel very lonely. Please pray that I find good friends."],
  ["en", "other", "Mary", "My grandmother Mary is in hospital. Please pray for her comfort and peace."],
  ["en", "event", null, "Our choir sings for elderly neighbours tonight. Please pray that it brings them joy."],
  ["en", "self", null, "I am facing a difficult operation next month. Please pray for the surgeons and for my courage."],
  ["en", "other", "Sarah", "My sister Sarah is expecting a baby. Please pray for a safe birth and a healthy mother and child."],
  ["en", "self", "Peter", "I made peace with my father after many years. Please pray for our family as we heal."],
  ["en", "self", null, "Please pray for me. I keep worrying about the future and cannot sleep."],
  ["en", "other", "Ruth", "My mum Ruth has been unwell for weeks. Please pray for her recovery."],
  ["en", "event", null, "Our neighbourhood is collecting help for a family who lost their home in a fire. Please pray it all comes together."],
  ["en", "self", null, "I am looking for work and feel discouraged. Please pray for patience and the right opportunity."],
  ["en", "other", "Ben", "My dad Ben is waiting for a diagnosis. Please pray for good news and for strength."],
  ["en", "self", "Esther", "I passed my final exams. Thank you God. Please pray for wisdom about what comes next."],
  ["en", "event", null, "We are visiting a care home this weekend. Please pray that our visit brings comfort."],
  ["en", "self", null, "Please pray for me. I am going through a hard time and need peace."],
  ["en", "other", "Miriam", "My mother Miriam is in hospital after a fall. Please pray for her healing."],
  ["en", "self", "Joseph", "Thank God I got the scholarship. Please pray I make the most of it."],
  ["en", "event", null, "Our family is meeting this week after many years apart. Please pray for love and understanding."],
  ["en", "self", null, "Please pray for my small business. It has been a slow year and I am worried about paying the bills."],
  ["en", "other", "Rachel", "My grandmother Rachel is ill. Please pray for her healing and comfort."],
  ["en", "event", null, "Our family is driving across the country this week. Please pray we arrive safely."],
  ["en", "self", null, "Please pray for me. My exam is next week and I am behind on my studies."],
  ["en", "other", "Hope", "My mother Hope is unwell. Please pray for her health and for our family as we care for her."],
  ["en", "self", null, "Please pray for me. I feel very tired, and work has become hard to face."],
  ["en", "other", "Michael", "My younger brother Michael has surgery coming up. Please pray for his recovery."],
  ["en", "self", null, "Please pray for my health. I have been ill for a long time and want to feel well again."],
  ["en", "other", "Sam", "My friend Sam is in hospital. Please pray for his recovery and for his family."],
  ["en", "event", null, "Our small group is visiting older people living alone this weekend. Please pray for us."],
];

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const id = (n) => {
  // Deterministic 12-character base32 id so reseeding replaces the same rows.
  let x = BigInt(n + 1) * 0x9e3779b97f4a7c15n, s = "";
  for (let i = 0; i < 10; i++) { s += B32[Number(x & 31n)]; x >>= 5n; }
  return "sd" + s;
};
const q = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const HOUR = 3600, DAY = 86400;
const reach = [0, 0, 1, 0, 3, 2, 0, 5, 1, 0, 8, 0, 2, 1, 0, 12, 4, 0, 1, 6];

let sql = `-- Generated by scripts/make-seed.mjs. Invented sample data; safe to run again.
DELETE FROM requests WHERE poster_hash = 'seed';
`;
samples.forEach(([lang, kind, name, body], i) => {
  const age = Math.round(((i * 7919) % 190) * HOUR + 600); // spread over about 8 days
  const r = reach[i % reach.length];
  const prayed = r + (r > 0 ? i % 4 : 0);
  const now = "CAST(strftime('%s','now') AS INTEGER)";
  sql += `INSERT INTO requests (id, owner_hash, kind, display_name, body, lang, status, decided_by, prayed_count, reach_count, body_hash, poster_hash, created_at, published_at, expires_at) VALUES (${q(id(i))}, ${q("seed-" + i)}, ${q(kind)}, ${q(name)}, ${q(body)}, ${q(lang)}, 'published', 'moderator', ${prayed}, ${r}, ${q("seed-" + i)}, 'seed', ${now} - ${age}, ${now} - ${age}, ${now} - ${age} + ${30 * DAY});\n`;
});
writeFileSync(new URL("../seed/seed.sql", import.meta.url), sql);
console.log(`Wrote ${samples.length} sample requests to seed/seed.sql`);
