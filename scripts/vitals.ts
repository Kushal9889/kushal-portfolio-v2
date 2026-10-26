import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Writes lib/agent/vitals.json from runs that already happened: the newest
 * end-to-end test-split report and the newest outage fault run in
 * docs/agent-bench, and the retrieval bench in .cache/bench-last.json when it
 * exists. Reads only; it calls no model, so the page's measured numbers cost
 * nothing to refresh and can never be newer than the run behind them.
 *
 *     npx tsx scripts/vitals.ts
 */
const DIR = join(process.cwd(), "docs/agent-bench");
type Split = { cases: number; pass: number; p50ms: number; p95ms: number; groundedness?: number | null; citeCoverage?: number | null; degraded?: number };
type Report = { at: string; retrievalOnly?: boolean; test?: Split };

const reports = readdirSync(DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}T\d{6}(-fault-outage)?\.json$/.test(f))
  .sort()
  .reverse()
  .map((f) => ({ f, r: JSON.parse(readFileSync(join(DIR, f), "utf8")) as Report }));

const live = reports.find(({ f, r }) => !f.includes("fault") && r.retrievalOnly === false && r.test);
const outage = reports.find(({ f, r }) => f.includes("fault-outage") && r.test);
if (!live) throw new Error("no end-to-end test-split report in docs/agent-bench");

const cachePath = join(process.cwd(), ".cache/bench-last.json");
const bench = existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, Split>)["main test"] : undefined;

const t = live.r.test!;
const vitals = {
  endToEnd: {
    at: live.r.at.slice(0, 10),
    cases: t.cases,
    pass: t.pass,
    p50ms: t.p50ms,
    p95ms: t.p95ms,
    groundedness: t.groundedness ?? null,
    citeCoverage: t.citeCoverage ?? null,
  },
  // Every model switched off: what the retrieval-only fallback still gets right.
  outage: outage
    ? { at: outage.r.at.slice(0, 10), cases: outage.r.test!.cases, pass: outage.r.test!.pass, degraded: outage.r.test!.degraded ?? null, p95ms: outage.r.test!.p95ms }
    : null,
  retrieval: bench ? { p50ms: bench.p50ms, p95ms: bench.p95ms } : null,
};

writeFileSync(join(process.cwd(), "lib/agent/vitals.json"), JSON.stringify(vitals, null, 1) + "\n");
console.log("vitals:", JSON.stringify(vitals));
