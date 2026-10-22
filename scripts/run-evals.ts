import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The suite has to measure the model the site serves.
 *
 * Next.js loads `.env.local` for the running app; a script run through tsx does
 * not, so this file inherited only whatever the shell exported. The key was
 * there and `NVIDIA_MODEL` was not, which meant the suite quietly graded the
 * code default instead of the configured model. On 2026-09-16 that default had
 * been retired by the provider and answered 410 Gone, so every run degraded to
 * the retrieved passage and the suite recorded three correct cases as
 * omissions. Values already in the environment still win.
 */
const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { ask } from "../lib/agent/graph";
import { assertNoReasoning, NOT_IN_PROFILE } from "../lib/agent/policy";
import { CASES, GROUND_TRUTH, type Group, type Case, type Mode } from "../lib/agent/evals";

/**
 * Evaluation suite for the agent.
 *
 * Two things are being measured, and they fail in opposite directions. Grounding
 * asks whether an answer stayed inside the corpus, because an assistant speaking
 * for a person is worse than useless when it invents. Routing asks whether the
 * policy layer fired, because answering a compensation question at all is a
 * failure regardless of how good the answer is.
 *
 * Assertions are substring and route checks rather than a model grading a model.
 * At this size a judge would add cost, latency, and a second thing to trust,
 * while the questions have known correct behaviour that can simply be stated.
 */

const RUNS = Number(process.env.EVAL_RUNS ?? 3);

async function main() {
  let failed = 0;
  const latencies: number[] = [];
  const results: {
    name: string;
    group: Group;
    asserts: string;
    pass: boolean;
    passRate: number;
    runs: number;
    modes: Mode[];
  }[] = [];
  let retrievalScored = 0;
  let retrievalTop1 = 0;
  let retrievalAnyK = 0;
  let reciprocalRanks = 0;
  let denseUsed = 0;
  let retrievals = 0;
  /**
   * Answers that still carried the model's working.
   *
   * Reasoning is disabled per provider in lib/agent/model.ts, so this is not a
   * quality metric -- it is a smoke alarm. Any value above zero means that flag
   * stopped being honoured, and the correct response is to fix the flag, never
   * to add one more pattern to cleanAnswer. That distinction is the whole
   * reason this counter exists: the previous defence grew to two hundred lines
   * of regex because nothing ever told anyone the source had broken.
   */
  /** How long to stand down before taking a provider-less run again. */
  const RETRY_PAUSE_MS = 4_000;
  let reasoningLeaks = 0;
  const leakSamples: string[] = [];
  let provider: string | null = null;

  for (const c of CASES) {
    const outcomes: boolean[] = [];
    const modes = new Set<Mode>();
    let asserts = "";
    let lastProblems: string[] = [];

    for (let run = 0; run < RUNS; run++) {
      /**
       * A run that got no provider is not a failed case.
       *
       * The suite makes 78 calls in a row against a free tier. When that tier
       * starts refusing, the answer comes back as the retrieved passage with no
       * provider on it, and scoring that as a missing substring makes the suite
       * report the tier's limit as the agent's quality: measured on 2026-09-16,
       * three cases that answer correctly one at a time were recorded as
       * omissions by a suite that had exhausted the tier reaching them.
       *
       * So a provider-less run waits and is taken again, once.
       */
      let r = await ask(c.question);
      if (!r.provider) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
        r = await ask(c.question);
      }
      provider ??= r.provider;
      if (r.trace) {
        retrievals++;
        if (r.trace.denseUsed) denseUsed++;
      }
      const answer = (r.answer ?? "").toString();
      latencies.push(r.total);

      // The unknown band's fixed text never came from a model, and its
      // "open-source" tripped the meta-sentence pattern (3/78 false leaks).
      try {
        if (answer !== NOT_IN_PROFILE) assertNoReasoning(answer);
      } catch (err) {
        reasoningLeaks++;
        if (leakSamples.length < 3) leakSamples.push(`${c.question}: ${(err as Error).message}`);
      }

      // Retrieval scored on its own terms, on the runs that have a ground truth.
      const want = GROUND_TRUTH[c.question];
      if (want && r.sources) {
        retrievalScored++;
        const rank = r.sources.indexOf(want) + 1;
        if (rank === 1) retrievalTop1++;
        if (rank > 0) {
          retrievalAnyK++;
          reciprocalRanks += 1 / rank;
        }
      }

      const problems: string[] = [];
      if (r.route !== c.route) {
        problems.push(`route ${r.route}, expected ${c.route}`);
        modes.add("route");
      }
      for (const term of c.expect ?? []) {
        if (!answer.includes(term)) {
          problems.push(`missing "${term}"`);
          modes.add("omission");
        }
      }
      if (c.expectAny && !c.expectAny.some((t) => answer.includes(t))) {
        problems.push(`none of [${c.expectAny.join(", ")}] present`);
        modes.add("omission");
      }
      if (c.minChars && answer.trim().length < c.minChars) {
        problems.push(`answer is ${answer.trim().length} chars, under ${c.minChars}`);
        modes.add("omission");
      }
      for (const term of c.reject ?? []) {
        if (answer.toLowerCase().includes(term.toLowerCase())) {
          problems.push(`leaked "${term}"`);
          modes.add(c.route === "answer" ? "invention" : "leak");
        }
      }

      outcomes.push(problems.length === 0);
      if (problems.length) lastProblems = problems;

      asserts = [
        `routes to ${c.route}`,
        ...(c.expect ?? []).map((t) => `states ${JSON.stringify(t)}`),
        ...(c.expectAny
          ? [`states one of ${c.expectAny.slice(0, 3).map((t) => JSON.stringify(t)).join(", ")}`]
          : []),
        ...(c.reject ?? []).map((t) => `never says ${JSON.stringify(t)}`),
        ...(c.minChars ? [`says more than "${"No."}"`] : []),
      ].join(" · ");
    }

    const passes = outcomes.filter(Boolean).length;
    const passRate = passes / RUNS;
    const problems = passRate === 1 ? [] : lastProblems;

    results.push({
      name: c.question,
      group: c.group,
      asserts,
      pass: passRate === 1,
      passRate: +passRate.toFixed(3),
      runs: RUNS,
      modes: [...modes],
    });

    // A case counts as failed if it did not pass every run. Flaky is failed:
    // an assertion that holds two times in three is not an assertion.
    if (passRate < 1) {
      failed++;
      console.log(`FAIL  ${passes}/${RUNS}  ${c.question}`);
      for (const p of problems) console.log(`        ${p}`);
      console.log(`        modes: ${[...modes].join(", ") || "none"}`);
    } else {
      console.log(`ok    ${passes}/${RUNS}  ${c.question}`);
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  const totalRuns = CASES.length * RUNS;
  const totalPasses = results.reduce((t, r) => t + Math.round(r.passRate * RUNS), 0);
  const precision1 = retrievalScored ? retrievalTop1 / retrievalScored : 0;
  const recallK = retrievalScored ? retrievalAnyK / retrievalScored : 0;
  const mrr = retrievalScored ? reciprocalRanks / retrievalScored : 0;

  console.log(
    `\n${CASES.length - failed}/${CASES.length} cases clean across ${RUNS} runs ` +
      `(${totalPasses}/${totalRuns} runs passed) · p50 ${p50}ms · p95 ${p95}ms`,
  );
  console.log(
    `retrieval: precision@1 ${precision1.toFixed(2)} · recall@k ${recallK.toFixed(2)} ` +
      `· MRR ${mrr.toFixed(3)} over ${retrievalScored} scored runs`,
  );

  if (reasoningLeaks > 0) {
    console.log(`\nREASONING LEAKED in ${reasoningLeaks}/${totalRuns} runs:`);
    for (const sample of leakSamples) console.log(`  ${sample}`);
    console.log(
      "  Reasoning is disabled per provider in lib/agent/model.ts. A leak means " +
        "that flag stopped working.\n  Fix the flag. Do not add a pattern to cleanAnswer.",
    );
  }

  // Written out so the page can render the numbers this run actually produced.
  //
  // The site is not allowed to state a figure it cannot support, and a latency
  // typed into a component by hand is exactly the kind of claim it exists to
  // avoid. The date travels with the numbers, because an eval result is only
  // true of the build that produced it.
  writeFileSync(
    join(process.cwd(), "content", "evals.json"),
    JSON.stringify(
      {
        note: "Generated by `npm run test:evals`. Do not edit by hand.",
        measured: new Date().toISOString().slice(0, 10),
        cases: CASES.length,
        passed: CASES.length - failed,
        // Every case, every run. The suite ran each case once against a model
        // that is not deterministic, so the headline moved between 14, 15 and
        // 16 out of 16 with no code change in between and every decision was
        // being made on a sample of one.
        runs: RUNS,
        totalRuns,
        totalPasses,
        // Retrieval scored on its own terms, because it and generation fail for
        // different reasons and were being reported as one number.
        retrieval: {
          scored: retrievalScored,
          precision1: +precision1.toFixed(3),
          recallK: +recallK.toFixed(3),
          mrr: +mrr.toFixed(3),
        },
        p50,
        p95,
        // Zero, or the build does not ship. See the counter's declaration.
        reasoningLeaks,
        // Which provider served the run. The site claims failover across four
        // providers and could not say which one answered.
        provider,
        model: process.env.OPENROUTER_MODEL ?? process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3-nano-30b-a3b",
        // How often both retrievers ran. The lexical short-circuit that used to
        // skip the embedding call was removed after measurement showed it fired
        // only on the weakest-scoring queries in the set; this is the number
        // that says so.
        denseUsed,
        retrievals,
        // 16/16 is four different claims in a trench coat. Split by what each
        // group actually proves.
        groups: Object.fromEntries(
          (["grounding", "policy", "authorisation", "out-of-corpus", "tools"] as Group[]).map((g) => {
            const inGroup = results.filter((r) => r.group === g);
            return [g, { cases: inGroup.length, passed: inGroup.filter((r) => r.pass).length }];
          }),
        ),
        cases_detail: results,
      },
      null,
      2,
    ) + "\n",
  );

  if (failed || reasoningLeaks > 0) process.exit(1);
}

main();
