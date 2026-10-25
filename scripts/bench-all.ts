import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Every eval set on every corpus in one command (docs/adr/adr-010-eval-loop-speed.md).
 *
 *   npx tsx scripts/bench-all.ts [--full]
 *
 * Retrieval-only by default, with the provider cache on, so a rerun after a
 * retrieval change is local. Prints one row per set and flags any metric that
 * fell since the previous run; exits 1 on a drop, so it can gate a change.
 */
const run = promisify(execFile);
const CORPORA = [
  { name: "main", dir: "" },
  { name: "site-b", dir: "tests/fixtures/site-b" },
  { name: "site-c", dir: "tests/fixtures/site-c" },
];
type Job = { label: string; args: string[]; corpus: string; split: string };
const jobs: Job[] = [
  { label: "main dev", args: ["--split", "dev"], corpus: "", split: "dev" },
  { label: "main test", args: ["--split", "test"], corpus: "", split: "test" },
];
for (const c of CORPORA) {
  const base = c.dir || "content";
  for (const [file, split] of [["edge-cases.json", "edge"], ["blind-eval.json", "blind"]] as const) {
    if (existsSync(join(base, file))) jobs.push({ label: `${c.name} ${split}`, args: ["--file", join(base, file), "--split", split], corpus: c.dir, split });
  }
}

const METRICS = ["pass", "precision5", "recall5", "ndcg5", "mrr", "answerRate", "abstainAccuracy", "injectionBlock"] as const;
type Row = Record<string, number | number[] | null>;

async function one(job: Job): Promise<[string, Row | null]> {
  const env = { ...process.env, AGENT_EVAL_CACHE: "1", ...(job.corpus ? { AGENT_CORPUS: job.corpus } : {}) };
  if (!job.corpus) delete (env as Record<string, string | undefined>).AGENT_CORPUS;
  const args = ["tsx", "scripts/agent-scenarios.ts", ...job.args, ...(process.argv.includes("--full") ? [] : ["--retrieval-only"])];
  try {
    const { stdout } = await run("npx", args, { env, maxBuffer: 1 << 26 });
    const line = stdout.split("\n").find((l) => l.startsWith(`${job.split} `) && l.includes('"cases":') && !l.includes('"cases":0'));
    return [job.label, line ? JSON.parse(line.slice(job.split.length + 1)) : null];
  } catch (e) {
    console.error(`${job.label}: ${String(e).slice(0, 200)}`);
    return [job.label, null];
  }
}

async function main() {
  const results: [string, Row | null][] = [];
  // Four at a time: cache misses still go to free-tier providers.
  for (let i = 0; i < jobs.length; i += 4) results.push(...(await Promise.all(jobs.slice(i, i + 4).map(one))));
  const lastPath = join(process.cwd(), ".cache/bench-last.json");
  const last: Record<string, Row> = existsSync(lastPath) ? JSON.parse(readFileSync(lastPath, "utf8")) : {};
  const drops: string[] = [];
  const fmt = (x: unknown) => (typeof x === "number" ? (Number.isInteger(x) ? String(x) : x.toFixed(3)) : "-");
  console.log(["set".padEnd(13), "cases", ...METRICS.map((m) => m.slice(0, 8).padStart(8)), "pass CI"].join(" "));
  for (const [label, r] of results) {
    if (!r) {
      console.log(`${label.padEnd(13)} FAILED`);
      drops.push(`${label} did not run`);
      continue;
    }
    const cells = METRICS.map((m) => {
      const prev = last[label]?.[m];
      const fell = typeof prev === "number" && typeof r[m] === "number" && (r[m] as number) < prev - 1e-9;
      if (fell) drops.push(`${label} ${m} ${fmt(prev)} -> ${fmt(r[m])}`);
      return `${fmt(r[m])}${fell ? "!" : " "}`.padStart(8);
    });
    console.log([label.padEnd(13), String(r.cases).padStart(5), ...cells, JSON.stringify(r.passCI)].join(" "));
  }
  // One line per run in the change log (ADR-010 item 4).
  const summary = results.map(([l, r]) => (r ? `${l} ${r.pass}/${r.cases}` : `${l} FAILED`)).join(", ");
  // --accept "<reason>": a trade-off chosen on purpose (dev-tuned), saved as the
  // new baseline with its reason in the log. A set that did not run is never accepted.
  const accept = process.argv.includes("--accept") ? process.argv[process.argv.indexOf("--accept") + 1] : null;
  const accepted = !!accept && drops.length > 0 && results.every(([, r]) => r);
  appendFileSync(join(process.cwd(), "docs/workflow.md"), `\n- bench ${new Date().toISOString().slice(0, 16)}: ${summary}${drops.length ? ` | DROPS: ${drops.join("; ")}` : ""}${accepted ? ` | ACCEPTED: ${accept}` : ""}`);
  // The baseline only moves forward: a run with a drop is reported, never saved,
  // so the next run is still compared against the last good one.
  if (!drops.length || accepted) {
    mkdirSync(join(process.cwd(), ".cache"), { recursive: true });
    writeFileSync(lastPath, JSON.stringify(Object.fromEntries(results.filter(([, r]) => r)), null, 1));
  }
  if (drops.length) {
    console.log(`\nREGRESSION vs previous run:\n  ${drops.join("\n  ")}`);
    if (accepted) return console.log(`\naccepted as the new baseline: ${accept}`);
    process.exit(1);
  }
  console.log("\nno metric fell since the previous run");
}

main();
