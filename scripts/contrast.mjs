// SPDX-License-Identifier: AGPL-3.0-or-later
// Checks every text/background pair of the design tokens against WCAG 2.2 AA (4.5:1).
// Run: node scripts/contrast.mjs   (exits 1 on a failure)
const light = { paper: "#ffffff", mist: "#f5f8fc", ink: "#14213d", muted: "#5b6b85", blue: "#1f4e9c", onBlue: "#ffffff", sky: "#dce9f9", goldInk: "#8a6a00", danger: "#a4262c" };
const dark = { paper: "#132243", mist: "#0b1730", ink: "#eef3fb", muted: "#a9b8d0", blue: "#8fb4f2", onBlue: "#0b1730", sky: "#1c3261", goldInk: "#e3c567", danger: "#f2a5a9" };
// [text, background] pairs the stylesheet actually uses
const pairs = [
  ["ink", "paper"], ["ink", "mist"], ["ink", "sky"],
  ["muted", "paper"], ["muted", "mist"],
  ["blue", "paper"], ["blue", "mist"],
  ["onBlue", "blue"], ["goldInk", "paper"], ["danger", "paper"], ["danger", "mist"],
];
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let failed = false;
for (const [name, theme] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of pairs) {
    const r = ratio(theme[fg], theme[bg]);
    const ok = r >= 4.5;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)}`);
  }
}
process.exit(failed ? 1 : 0);
