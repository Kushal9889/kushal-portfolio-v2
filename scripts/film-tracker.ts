/**
 * Film deliverables check, run at the end of every loop iteration.
 *
 *   npx tsx scripts/film-tracker.ts
 *
 * Reads docs/film-tracker.md and prints every deliverable not yet delivered,
 * grouped by step, with counts, then names the first step that still has open
 * rows: that is the next step in plan order. Exits 0; it reports, it does not
 * gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const text = readFileSync(join(__dirname, "..", "docs", "film-tracker.md"), "utf8");
let heading = "";
const groups = new Map<string, { open: string[]; partial: string[]; deferred: string[]; done: number }>();
for (const line of text.split("\n")) {
  const h = line.match(/^#{2,3} (.+)/);
  if (h) {
    heading = h[1];
    continue;
  }
  const row = line.match(/^- \[( |x|~|-)\] (.+)/);
  if (!row || !heading) continue;
  const g = groups.get(heading) ?? { open: [], partial: [], deferred: [], done: 0 };
  if (row[1] === "x") g.done++;
  else if (row[1] === "~") g.partial.push(row[2]);
  else if (row[1] === "-") g.deferred.push(row[2]);
  else g.open.push(row[2]);
  groups.set(heading, g);
}

const total = { done: 0, open: 0, partial: 0, deferred: 0 };
let next = "";
for (const [name, g] of groups) {
  total.done += g.done;
  total.open += g.open.length;
  total.partial += g.partial.length;
  total.deferred += g.deferred.length;
  if (!g.open.length && !g.partial.length) continue;
  if (!next && /^\d/.test(name)) next = name;
  console.log(`\n${name}  (${g.done} done, ${g.partial.length} partial, ${g.open.length} open)`);
  for (const r of g.partial) console.log(`  [~] ${r}`);
  for (const r of g.open) console.log(`  [ ] ${r}`);
}
console.log(`\nTotal: ${total.done} delivered, ${total.partial} partial, ${total.open} open, ${total.deferred} deferred.`);
console.log(`Earliest step with open rows: ${next || "none"}`);
