import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { retrieve, sectionEvidence } from "../lib/agent/retrieve";
import { LOAD_QUESTION } from "../lib/journeys";

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

/**
 * --check: the 30 calibration questions are what they claim to be. An
 * answerable case names a word its rel section actually contains; an
 * unanswerable case names a term the corpus never mentions.
 */
async function checkMode() {
  const { loadContent } = await import("../lib/content");
  const raw = JSON.parse(readFileSync(join(process.cwd(), "content/agent-scenarios.json"), "utf8")) as {
    sections: Record<string, string>;
    cases: { id: number; kind: string; q: string; expect: string; rel: Record<string, number>; must?: string[]; absent?: string }[];
  };
  const bodies = new Map(loadContent().sections.map((s) => [s.title, s.body]));
  const corpus = [...bodies.values()].join("\n");
  const word = (t: string) => new RegExp(`(^|[^a-z0-9])${t.toLowerCase().replace(/[.+#*?()[\]]/g, "\\$&")}($|[^a-z0-9])`);
  const calib = raw.cases.filter((c) => c.kind === "calib");
  const bad: string[] = [];
  if (calib.length !== 30) bad.push(`expected 30 calib cases, found ${calib.length}`);
  if (calib.filter((c) => c.expect === "answer").length !== 18) bad.push("expected 18 answer and 12 abstain");
  const seen = new Set<number>();
  for (const c of calib) {
    if (c.id % 2 !== 1 || c.id < 65 || c.id > 123 || seen.has(c.id)) bad.push(`#${c.id}: id must be odd, 65-123, unique`);
    seen.add(c.id);
    if (/[\u2013\u2014]/.test(c.q)) bad.push(`#${c.id}: dash character`);
    if (c.expect === "answer") {
      const keys = Object.keys(c.rel);
      if (!keys.length || keys.some((k) => !raw.sections[k] || k === "auth")) bad.push(`#${c.id}: rel keys must exist in sections, never auth`);
      const term = c.must?.[0];
      if (!term || !keys.some((k) => word(term).test((bodies.get(raw.sections[k]) ?? "").toLowerCase()))) bad.push(`#${c.id}: must "${term}" not in its rel sections`);
    } else if (c.expect === "abstain") {
      if (Object.keys(c.rel).length) bad.push(`#${c.id}: abstain cases have rel {}`);
      if (!c.absent || word(c.absent).test(corpus.toLowerCase())) bad.push(`#${c.id}: absent "${c.absent}" appears in the corpus`);
    } else bad.push(`#${c.id}: expect must be answer or abstain`);
  }
  if (bad.length) {
    console.error(`CALIB CHECK FAIL\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log("calib check ok: 30 cases, 18 answer, 12 abstain");
}

/**
 * --bands: Youden J cut on dev rerank logits with a bootstrap 95% CI.
 * Retrieval only (one rerank call per question, no answer generation), so it
 * spends no chat quota. Never reads the test split.
 */
async function bandsMode() {
  const { analyze } = await import("../lib/agent/query");
  const { classify } = await import("../lib/agent/policy");
  const { BANDS } = await import("../lib/agent/retrieve");
  const raw = JSON.parse(readFileSync(join(process.cwd(), "content/agent-scenarios.json"), "utf8")) as {
    cases: { id: number; q: string; expect: string; rel: Record<string, number>; history?: unknown[] }[];
  };
  const dev = raw.cases.filter((c) => c.id % 2 === 1 && !c.history?.length);
  const pts: { id: number; x: number; y: 0 | 1 }[] = [];
  for (const c of dev) {
    const y = c.expect === "answer" && Object.keys(c.rel).length ? 1 : c.expect === "abstain" || c.expect === "deflect" ? 0 : null;
    if (y === null) continue;
    const route = classify(c.q);
    if (route !== "answer" && route !== "handoff") continue;
    const { query, floor } = analyze(c.q);
    const { trace } = await retrieve(query, { floor, question: c.q });
    if (trace.relevance == null) {
      console.log(`#${c.id} skipped: reranker down`);
      continue;
    }
    pts.push({ id: c.id, x: trace.relevance, y });
    console.log(`#${String(c.id).padStart(3)} ${y ? "answer " : "abstain"} ${trace.relevance.toFixed(3)}`);
  }
  const youden = (p: typeof pts) => {
    const P = p.filter((d) => d.y).length || 1;
    const N = p.filter((d) => !d.y).length || 1;
    let best = { t: NaN, j: -Infinity };
    for (const t of [...new Set(p.map((d) => d.x))].sort((a, b) => b - a)) {
      const j = p.filter((d) => d.y && d.x >= t).length / P - p.filter((d) => !d.y && d.x >= t).length / N;
      if (j > best.j) best = { t, j };
    }
    return best;
  };
  let seed = 42;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const cuts: number[] = [];
  for (let b = 0; b < 1000; b++) {
    const sample = pts.map(() => pts[Math.floor(rand() * pts.length)]);
    if (sample.some((d) => d.y) && sample.some((d) => !d.y)) cuts.push(youden(sample).t);
  }
  cuts.sort((a, b) => a - b);
  const fit = youden(pts);
  const maxNeg = Math.max(...pts.filter((d) => !d.y).map((d) => d.x));
  const ci = [cuts[Math.floor(cuts.length * 0.025)], cuts[Math.floor(cuts.length * 0.975)]];
  const heroQ = LOAD_QUESTION;
  const hero = (await retrieve(analyze(heroQ).query, { floor: analyze(heroQ).floor, question: heroQ })).trace.relevance ?? null;
  const result = {
    at: new Date().toISOString().slice(0, 19),
    points: pts.length,
    positives: pts.filter((d) => d.y).length,
    negatives: pts.filter((d) => !d.y).length,
    partial: +fit.t.toFixed(2),
    j: +fit.j.toFixed(3),
    ci95: ci.map((v) => +v.toFixed(2)),
    sure: +Math.max(fit.t, maxNeg + 0.01).toFixed(2),
    highestNegative: +maxNeg.toFixed(3),
    current: BANDS,
    hero: hero === null ? null : +hero.toFixed(3),
    heroInsideCi: hero !== null && hero >= ci[0] && hero <= ci[1],
  };
  const dir = join(process.cwd(), "docs/agent-bench");
  writeFileSync(join(dir, `calibration-${result.at.replace(/:/g, "")}.json`), JSON.stringify({ ...result, data: pts }, null, 1));
  console.log(JSON.stringify(result));
}

const mode = process.argv.includes("--check") ? checkMode : process.argv.includes("--bands") ? bandsMode : process.argv.includes("--rerank") ? rerankMode : main;
mode();
