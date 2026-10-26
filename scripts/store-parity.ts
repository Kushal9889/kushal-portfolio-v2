import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { embedQuery } from "../lib/agent/model";
import { index } from "../lib/agent/corpus-index";
import { similarity } from "../lib/agent/retrieve";
import { denseFromNeon, tableFor } from "../lib/agent/store";

/**
 * Neon and the bundled index must rank passages identically (R13).
 *
 *   [AGENT_CORPUS=<dir>] npx tsx scripts/store-parity.ts <cases.json>
 *
 * Per question: top-10 passage order from each store, and the largest cosine
 * difference (halfvec storage rounds to 16 bits). Exits 1 on any top-10 mismatch.
 */
type Idx = { vectors: number[][]; passages: { text: string }[]; hashes?: Record<string, string> };
const idx = index as Idx;

async function main() {
  const cases = (JSON.parse(readFileSync(process.argv[2], "utf8")) as { cases: { q: string }[] }).cases.filter((c) => c.q.trim());
  const table = tableFor(idx);
  let same = 0, maxDiff = 0;
  const ms: number[] = [];
  for (const c of cases) {
    const q = await embedQuery(c.q, Infinity, (idx as { embedModel?: string }).embedModel);
    if (!q) continue;
    const mem = idx.vectors.map((v, i) => [i, similarity(q, v)] as const).sort((a, b) => b[1] - a[1]);
    const t = performance.now();
    const db = await denseFromNeon(table, q, idx.passages.length, 5000);
    ms.push(performance.now() - t);
    if (!db) throw new Error("neon unreachable");
    const dbOrder = [...db.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i);
    for (const [i, cos] of mem) maxDiff = Math.max(maxDiff, Math.abs(cos - (db.get(i) ?? 0)));
    if (mem.slice(0, 10).every(([i], r) => dbOrder[r] === i)) same++;
    else console.log("MISMATCH", c.q.slice(0, 60), mem.slice(0, 10).map(([i]) => i).join(","), "|", dbOrder.slice(0, 10).join(","));
  }
  ms.sort((a, b) => a - b);
  console.log(`parity ${same}/${cases.length} top-10 identical; max |cos diff| ${maxDiff.toFixed(5)}; neon ms p50 ${ms[ms.length >> 1]?.toFixed(0)} p95 ${ms[Math.floor(ms.length * 0.95)]?.toFixed(0)}`);
  if (same !== cases.length) process.exit(1);
}
main();
