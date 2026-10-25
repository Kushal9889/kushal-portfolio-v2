/**
 * The evaluation suite's cases, in one place.
 *
 * `scripts/run-evals.ts` owns running them and the agent's `run_eval` tool owns
 * showing one to a reader who does not believe the number on the page. Both
 * need the same list, and the script executes on import, so the list cannot
 * live there: importing it to read one case would run all twenty-two.
 *
 * A second copy would be worse. The page publishes a pass rate and the tool
 * demonstrates a case; if those ever described different suites, the
 * demonstration would be theatre.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "../content";

export type Group = "grounding" | "policy" | "authorisation" | "out-of-corpus" | "tools";

export type Case = {
  question: string;
  /** What this case is actually testing. 16/16 is one number hiding four
   *  different claims, and the strongest of them -- that a prompt override never
   *  reaches the model -- is invisible inside the total. */
  group: Group;
  /** Route the policy layer must select. */
  route: string;
  /** Every one of these must appear. Catches quiet omission of the real answer. */
  expect?: string[];
  /** At least one must appear. For answers where summarising may fairly pick
   *  between several correct figures, so requiring a specific one would be
   *  testing the model's choice rather than its grounding. */
  expectAny?: string[];
  /** None of these may appear. Catches invention and policy leaks. */
  reject?: string[];
  /**
   * Floor on the answer's length.
   *
   * One case needs it. Asked "Does he know PyTorch?" the agent answered "No."
   * and stopped -- three characters, entirely honest, and useless to the person
   * asking, who now knows one thing he cannot do and nothing he can. A
   * substring assertion cannot catch that, because every term it looks for is
   * present in the word it is missing.
   */
  minChars?: number;
};

// The cases name one person's facts, so they live with that corpus
// (`<corpus>/eval-cases.json`), not here: a corpus without the file has no
// cases and run_eval says so, instead of asking another person's questions.
const file = join(CONTENT_DIR, "eval-cases.json");
const data = (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}) as { cases?: Case[]; groundTruth?: Record<string, string> };

export const CASES: Case[] = data.cases ?? [];

/**
 * Which section has to be retrieved for a question to be answerable.
 *
 * Retrieval and generation fail for different reasons and were being scored as
 * one number. When "Tell me about Growaza" came back without the 30 percent,
 * nothing here could say whether the retriever missed the section or the model
 * had it and summarised it away. Measured separately: recall@k is 1.00 and
 * precision@1 is 0.80, so retrieval was never the problem and every hour spent
 * tuning it would have been spent on the wrong half.
 *
 * Only the cases with one obviously correct section are listed. A deflection
 * has no ground truth because nothing should be retrieved at all.
 */
export const GROUND_TRUTH: Record<string, string> = data.groundTruth ?? {};

/**
 * Why a run failed, not just that it did.
 *
 * A pass rate says how often; this says what to fix. The four modes need
 * different work: a route failure is the classifier, an omission is the
 * context, a leak is the cleaner, an invention is the prompt.
 */
export type Mode = "route" | "omission" | "leak" | "invention";

/**
 * How many times each case runs.
 *
 * The model is not deterministic and this suite used to run every case once,
 * so the result moved between 14, 15 and 16 out of 16 across consecutive runs
 * with no code change in between. Decisions were being made on a sample of one.
 * A pass rate over several runs is the honest number, and "sixteen cases, five
 * runs each, 78 of 80" is a stronger claim than a ratio that happened to land
 * on a good afternoon.
 */
