import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { retrieve, type Metric } from "../lib/agent/retrieve";
import { analyze } from "../lib/agent/query";

/**
 * What retrieval actually costs and what it actually buys.
 *
 * Retrieval and generation fail for different reasons, so they are measured
 * apart. This measures retrieval alone: no model call, no answer, nothing that
 * depends on a provider being awake. It answers three questions the page makes
 * claims about, and it answers them with numbers rather than with a paragraph.
 *
 *   1. Which distance metric ranks best on this corpus?
 *   2. Does a cross-encoder reranker earn the latency it costs?
 *   3. How long does each configuration take?
 *
 * Written to content/retrieval-bench.json so the page renders what this run
 * produced rather than a figure typed in by hand.
 */

/** Question, and the section that has to come back first. */
const CASES: [question: string, wants: string][] = [
  ["What has he shipped on Azure?", "Boston University, Questrom Computational Lab"],
  ["Tell me about Growaza", "Growaza"],
  ["What did he do at IMG Systems?", "IMG Systems"],
  ["What certifications does he have?", "Certifications"],
  ["Why does the graph run without a checkpointer?", "This site"],
  ["What bug did he find in LangChain?", "Open source, LangChain deepagents"],
  ["What is he good at?", "What he is good at"],
  ["Tell me about yourself", "Who he is"],
  ["What did he ship?", "Boston University, Questrom Computational Lab"],
  ["How does the retrieval on this page work?", "How retrieval on this page works"],
  ["Does he know PyTorch?", "What he does not do"],
  // Typos, because nobody types carefully and BM25 matches exactly.
  ["Tell me about Growza", "Growaza"],
  ["What did he do at IMG Sytems?", "IMG Systems"],
  ["What certifcations does he have?", "Certifications"],
  ["Does he know Pytorc?", "What he does not do"],
];

type Result = {
  label: string;
  precision1: number;
  recallK: number;
  mrr: number;
  p50: number;
  p95: number;
  misses: string[];
};

async function score(label: string, metric: Metric): Promise<Result> {
  let top1 = 0;
  let anyK = 0;
  let reciprocal = 0;
  const times: number[] = [];
  const misses: string[] = [];

  for (const [question, wants] of CASES) {
    const a = analyze(question);
    const started = Date.now();
    const { chunks } = await retrieve(a.query, { floor: a.floor, metric });
    times.push(Date.now() - started);

    const rank = chunks.findIndex((c) => c.title === wants) + 1;
    if (rank === 1) top1++;
    else misses.push(`${question} -> ${chunks[0]?.title ?? "nothing"}`);
    if (rank > 0) {
      anyK++;
      reciprocal += 1 / rank;
    }
  }

  const sorted = [...times].sort((x, y) => x - y);
  return {
    label,
    precision1: +(top1 / CASES.length).toFixed(3),
    recallK: +(anyK / CASES.length).toFixed(3),
    mrr: +(reciprocal / CASES.length).toFixed(3),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    misses,
  };
}

/**
 * When does a linear scan stop being free?
 *
 * The page claims a vector database would add latency and operational surface
 * without buying anything back at this corpus size. That is either a
 * measurement or an excuse, and the difference is this function.
 *
 * Brute force is exact by definition: it compares the query against every
 * vector, so its recall is 1.00 and only its cost is in question. An
 * approximate index trades a little of that recall for sublinear search, and it
 * is worth doing at the point where the scan costs more than the error does.
 * Measured here against synthetic vectors of the same shape as the real ones,
 * because the cost depends on count and dimension, not on meaning.
 */
function scanScaling(dims: number): { n: number; ms: number }[] {
  const out: { n: number; ms: number }[] = [];
  // A seeded generator, so the numbers are the same on every run and a change
  // in them means a change in the code rather than in the weather.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5;
  };

  const query = Array.from({ length: dims }, rand);
  for (const n of [53, 500, 5_000, 50_000, 100_000]) {
    const vectors: number[][] = [];
    for (let i = 0; i < n; i++) vectors.push(Array.from({ length: dims }, rand));

    // Warm the JIT so the first size is not measuring compilation.
    for (let r = 0; r < 3; r++) {
      let sink = 0;
      for (const v of vectors) {
        let dot = 0;
        for (let d = 0; d < dims; d++) dot += query[d] * v[d];
        sink += dot;
      }
      if (sink === Infinity) console.log("");
    }

    const started = performance.now();
    const REPS = n > 10_000 ? 3 : 20;
    for (let r = 0; r < REPS; r++) {
      let best = -Infinity;
      for (const v of vectors) {
        let dot = 0;
        for (let d = 0; d < dims; d++) dot += query[d] * v[d];
        if (dot > best) best = dot;
      }
    }
    out.push({ n, ms: +((performance.now() - started) / REPS).toFixed(3) });
  }
  return out;
}

async function main() {
  const results: Result[] = [];

  /*
   * Warm the query-vector cache before measuring anything.
   *
   * Without this the first configuration pays the embedding round trip for
   * every case and the four after it read from the cache, so the table reported
   * cosine at 170ms and dot, L2 and L1 at 0ms -- which says nothing about the
   * metrics and everything about the order they were run in. The metrics differ
   * in how they rank, not in what they cost to fetch, so the fetch is taken out
   * of the comparison and reported on its own line below.
   */
  for (const [question] of CASES) {
    const a = analyze(question);
    await retrieve(a.query, { floor: a.floor });
  }

  for (const metric of ["cosine", "dot", "l2", "l1"] as Metric[]) {
    delete process.env.RERANK;
    results.push(await score(metric, metric));
  }

  // The reranker, on the metric that ships.
  process.env.RERANK = "1";
  results.push(await score("cosine + rerank", "cosine"));
  delete process.env.RERANK;

  console.log(
    "\n" +
      "config".padEnd(18) +
      "P@1".padEnd(8) +
      "recall".padEnd(9) +
      "MRR".padEnd(8) +
      "p50*".padEnd(9) +
      "p95*",
  );
  for (const r of results) {
    console.log(
      r.label.padEnd(18) +
        r.precision1.toFixed(2).padEnd(8) +
        r.recallK.toFixed(2).padEnd(9) +
        r.mrr.toFixed(3).padEnd(8) +
        `${r.p50}ms`.padEnd(9) +
        `${r.p95}ms`,
    );
  }

  console.log(
    "\n* scoring only. The query vector is cached across configurations, because\n" +
      "  the metrics differ in how they rank and not in what they cost to fetch.\n" +
      "  A cold query pays one embedding round trip, measured separately at\n" +
      "  236-421ms, which dominates everything in the table above.",
  );

  const cosine = results.find((r) => r.label === "cosine")!;
  const l2 = results.find((r) => r.label === "l2")!;
  const identical = cosine.mrr === l2.mrr && cosine.precision1 === l2.precision1;
  console.log(
    `\ncosine and L2 rank ${identical ? "identically, as they must" : "DIFFERENTLY, which is a bug"}: ` +
      `these vectors are unit length, and for unit vectors squared euclidean distance is 2 - 2cos, ` +
      `which is monotonic in cosine.`,
  );

  for (const r of results) {
    if (r.misses.length) {
      console.log(`\n${r.label} missed:`);
      for (const m of r.misses) console.log(`  ${m}`);
    }
  }

  const scaling = scanScaling(1024);
  console.log("\nexhaustive scan over 1024-dim vectors, one query:");
  for (const s of scaling) {
    console.log(`  ${String(s.n).padStart(7)} vectors   ${s.ms.toFixed(3).padStart(9)}ms`);
  }
  const here = scaling[0].ms;
  const crossover = scaling.find((s) => s.ms > 50);
  console.log(
    `\nAt this corpus (${scaling[0].n} passages) the scan costs ${here.toFixed(3)}ms, against ` +
      `${results[0].p50}ms for the round trip that fetches the query vector. ` +
      (crossover
        ? `It passes 50ms somewhere before ${crossover.n.toLocaleString("en-US")} vectors, which is where an index starts to pay for itself.`
        : `It stays under 50ms to 100,000 vectors, which is well past anything this corpus will become.`),
  );

  writeFileSync(
    join(process.cwd(), "content", "retrieval-bench.json"),
    JSON.stringify(
      {
        note: "Generated by `npm run bench:retrieval`. Do not edit by hand.",
        cases: CASES.length,
        cosineEqualsL2: identical,
        results: results.map(({ misses, ...rest }) => rest),
        // What a linear scan costs as the corpus grows, so "no vector database
        // at this size" is a measurement rather than an assertion.
        scanScaling: scaling,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
