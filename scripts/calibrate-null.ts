import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { CONTENT_DIR } from "../lib/content";
import { retrieve, sectionEvidence, isNoise } from "../lib/agent/retrieve";

/**
 * Abstain floors for the active corpus, from questions no profile answers.
 *
 *   AGENT_CORPUS=<dir> npx tsx scripts/calibrate-null.ts
 *
 * Every signal the gate reads (best passage cosine, best BM25, best reranker
 * logit) lives on a scale that moves with the corpus: BM25 grows with corpus
 * size, the reranker scores a technical corpus higher than a design one. A
 * fixed cut point set on one corpus therefore refuses correct answers on the
 * next. So each corpus is scored against the same corpus-agnostic null set
 * (lib/agent/null-questions.json) and a floor sits at the null set's 90th
 * percentile per signal. Percentile chosen on the dev split of
 * content/agent-scenarios.json only.
 *
 * Writes calibration.json next to the corpus index (lib/agent/ for the site).
 */
const PERCENTILE = 0.9;

async function main() {
  const { questions } = JSON.parse(readFileSync(join(process.cwd(), "lib/agent/null-questions.json"), "utf8")) as { questions: string[] };
  const cos: number[] = [], lex: number[] = [], logit: number[] = [];
  for (const q of questions) {
    if (isNoise(q)) continue;
    const ev = [...(await sectionEvidence(q)).values()];
    cos.push(Math.max(...ev.map((v) => v.cosine ?? -1)));
    lex.push(Math.max(...ev.map((v) => v.lexical)));
    const r = await retrieve(q);
    if (r.trace.relevance !== null && r.trace.relevance !== undefined) logit.push(r.trace.relevance);
  }
  const at = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? +s[Math.min(s.length - 1, Math.floor(PERCENTILE * s.length))].toFixed(4) : null;
  };
  const out = {
    note: "Abstain floors from lib/agent/null-questions.json, 90th percentile per signal. Regenerate after any corpus or model change.",
    at: new Date().toISOString().slice(0, 10),
    n: cos.length,
    floor: { cosine: at(cos), lexical: at(lex), logit: at(logit) },
    max: { logit: logit.length ? Math.max(...logit) : null },
  };
  const path = process.env.AGENT_CORPUS ? join(CONTENT_DIR, "calibration.json") : join(process.cwd(), "lib/agent/calibration.json");
  writeFileSync(path, JSON.stringify(out, null, 1));
  console.log(`calibrate-null: ${path.replace(process.cwd() + "/", "")}`, JSON.stringify(out.floor), "logit max", out.max.logit);
}

main();
