import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * Retrieval-only probe on questions never used for tuning (RAG v3 phase 0).
 *
 *   npx tsx scripts/probe-fresh.ts [questions.json]
 *
 * Prints one JSON line per question: route, intent, band, best logit, and the
 * top three sections with their lexical and dense rank, so a ranking miss can
 * be traced to the leg that caused it. Appends the same lines to
 * docs/agent-bench/probe-<iso>.jsonl. No model call: route, analyze, retrieve.
 */
import { retrieve } from "../lib/agent/retrieve";
import { classify } from "../lib/agent/policy";
import { analyze } from "../lib/agent/query";

const DEFAULT = [
  "What is Kushal currently doing?", "Is he a teaching assistant?", "Which university is he studying at?",
  "What programming languages does he know?", "Has he worked with LLMs in production?", "What's his strongest project?",
  "Does he have any internship experience?", "Where did he intern in 2024?", "How many years of experience does he have?",
  "What did he do at IMG?", "Tell me about his research paper", "Is he good at system design?",
  "What cloud platforms has he used?", "Has he contributed to open source?", "What kind of role is he looking for?",
  "When can he start working?", "what does he do at questrom lab", "Is he a backend engineer?",
  "What is his GPA?", "Can he do frontend work?", "What makes him different from other candidates?",
  "Why should we hire him?", "What tools does his agent at BU use?", "Does he know Kubernetes?",
];

async function main() {
const file = process.argv[2];
const questions: string[] = file ? JSON.parse(readFileSync(file, "utf8")) : DEFAULT;
const dir = join(process.cwd(), "docs/agent-bench");
mkdirSync(dir, { recursive: true });
const out = join(dir, `probe-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.jsonl`);

for (const q of questions) {
  const t = performance.now();
  const route = classify(q);
  const a = analyze(q);
  try {
    const r = await retrieve(a.query, { question: q, floor: a.floor, deadline: Date.now() + 8000 });
    const rows = new Map(r.trace.rows.map((x) => [x.title, x]));
    const line = JSON.stringify({
      q,
      route,
      intent: a.intent,
      band: r.band,
      logit: r.trace.relevance === null || r.trace.relevance === undefined ? null : +r.trace.relevance.toFixed(2),
      top: r.chunks.slice(0, 3).map((c) => ({ t: c.title, lex: rows.get(c.title)?.lexicalRank ?? null, dense: rows.get(c.title)?.denseRank ?? null })),
      fixes: r.trace.corrections,
      ms: Math.round(performance.now() - t),
    });
    console.log(line);
    appendFileSync(out, line + "\n");
  } catch (e) {
    console.log(JSON.stringify({ q, err: String(e).slice(0, 120) }));
  }
}
console.log("wrote", out.replace(process.cwd() + "/", ""));
}

main();
