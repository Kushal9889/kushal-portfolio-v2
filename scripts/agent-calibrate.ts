import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { retrieve, sectionEvidence } from "../lib/agent/retrieve";

/**
 * Where relevant and irrelevant sections sit on raw cosine and BM25, dev split only
 * (odd ids in content/agent-scenarios.json). Prints the distributions an absolute
 * threshold is chosen from. Never run with test cases: they are held out.
 *
 *   npx tsx scripts/agent-calibrate.ts
 */
type Case = { id: number; q: string; expect: string; rel: Record<string, number> };
const file = JSON.parse(readFileSync(join(process.cwd(), "content/agent-scenarios.json"), "utf8")) as { sections: Record<string, string>; cases: Case[] };

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) : null;
};

async function main() {
  const rel: number[] = [], irr: number[] = [], lead: number[] = [], noAnswerLead: number[] = [];
  const relLex: number[] = [], irrLex: number[] = [];
  for (const c of file.cases.filter((c) => c.id % 2 === 1)) {
    const ev = await sectionEvidence(c.q);
    const labels = new Set(Object.keys(c.rel).map((k) => file.sections[k]));
    const cosines = [...ev.values()].map((v) => v.cosine ?? -1);
    if (cosines.every((x) => x < 0)) { console.log(`#${c.id} no embedding`); continue; }
    const top = Math.max(...cosines);
    (labels.size ? lead : noAnswerLead).push(top);
    for (const [title, v] of ev) {
      (labels.has(title) ? rel : irr).push(v.cosine ?? -1);
      (labels.has(title) ? relLex : irrLex).push(v.lexical);
    }
    const best = [...ev.entries()].sort((a, b) => (b[1].cosine ?? 0) - (a[1].cosine ?? 0)).slice(0, 3).map(([t, v]) => `${labels.has(t) ? "*" : " "}${t.slice(0, 22)} ${v.cosine?.toFixed(3)}`);
    console.log(`#${String(c.id).padStart(2)} ${c.expect.padEnd(7)} ${best.join(" | ")}`);
  }
  console.log("\ncosine  relevant  p10/p50/p90", q(rel, 0.1), q(rel, 0.5), q(rel, 0.9), "min", q(rel, 0));
  console.log("cosine  irrelev.  p50/p90/p99", q(irr, 0.5), q(irr, 0.9), q(irr, 0.99), "max", q(irr, 1));
  console.log("leader  answerable p10/p50", q(lead, 0.1), q(lead, 0.5), "| unanswerable leaders", noAnswerLead.map((x) => x.toFixed(3)).join(" "));
  console.log("bm25    relevant p10/p50", q(relLex, 0.1), q(relLex, 0.5), "| irrelevant p90/p99", q(irrLex, 0.9), q(irrLex, 0.99));
}

/** Reranker logits per dev case: where the band cut points can sit (--rerank). */
async function rerankMode() {
  const ans: number[] = [], none: number[] = [];
  for (const c of file.cases.filter((c) => c.id % 2 === 1)) {
    const t0 = Date.now();
    const { trace, chunks } = await retrieve(c.q);
    const labels = new Set(Object.keys(c.rel).map((k) => file.sections[k]));
    const r = trace.relevance ?? NaN;
    (labels.size ? ans : none).push(r);
    const top = chunks.map((x) => `${labels.has(x.title) ? "*" : " "}${x.title.slice(0, 20)}`).join(" | ");
    console.log(`#${String(c.id).padStart(2)} ${c.expect.padEnd(7)} logit ${r.toFixed(2).padStart(6)} band ${trace.band?.padEnd(7)} ${Date.now() - t0}ms  ${top}`);
  }
  console.log("\nanswerable best logit p10/p50", q(ans, 0.1), q(ans, 0.5), "min", q(ans, 0), "| no-answer", none.map((x) => x.toFixed(2)).join(" "));
}

process.argv.includes("--rerank") ? rerankMode() : main();
