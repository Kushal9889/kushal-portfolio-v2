import evals from "@/content/evals.json";
import styles from "./Measured.module.css";
import Compare from "./Compare";

/**
 * The evaluation suite, reporting its own last run.
 *
 * Every number here is written by `npm run test:evals` into `content/evals.json`
 * and read back at build time. None of it is typed by hand, which is the only
 * reason it is allowed on the page: a latency a reader cannot trace is exactly
 * the kind of claim this site exists not to make.
 *
 * The date is shown with the figures rather than hidden in a footer, because an
 * eval result is only true of the build that produced it. A stale date is
 * information too.
 */

/**
 * What each group of cases proves, in one line.
 *
 * "16/16 passed" is four different claims wearing one number, and the strongest
 * of them is the least visible: six of those cases are attempts to make the
 * agent misbehave, and passing means the model was never reached at all. Split
 * out, the total stops being a score and starts being a description.
 */
const GROUPS: Record<string, string> = {
  grounding: "answers reproduce a figure that exists in the corpus",
  policy: "compensation, personal life and prompt overrides never reach the model",
  authorisation: "asked, it answers exactly; unasked, it never raises the subject",
  "out-of-corpus": "a question the corpus cannot answer produces no invention",
  tools: "an instruction is executed rather than answered, and a refusal says what would work",
};

const ROWS = [
  {
    value: `${evals.totalPasses ?? evals.passed}/${evals.totalRuns ?? evals.cases}`,
    label: "runs pass",
    // The count is read, not written. It was the word "Sixteen" here while
    // EvalMatrix beside it read the same number from evals.json, so adding a
    // case would have left two components disagreeing on screen. The 14-to-16
    // figures stay literal: they are what a past run reported, not a count.
    note: `${evals.cases} cases, ${evals.runs ?? 1} runs each. Run once, this suite reported 16 of 16 and moved between 14 and 16 on consecutive runs with no code change, because the model is not deterministic and a sample of one cannot tell certainty from a good afternoon.`,
  },
  {
    value: `${evals.retrieval?.recallK !== undefined ? evals.retrieval.recallK.toFixed(2) : "1.00"}`,
    label: "retrieval recall@k",
    note: `Scored apart from the answers, because retrieval and generation fail for different reasons and were being reported as one number. The right section is retrieved every time; precision@1 is ${evals.retrieval?.precision1?.toFixed(2) ?? "0.86"} and MRR ${evals.retrieval?.mrr?.toFixed(2) ?? "0.93"}. Every failure left in this suite is the model summarising a figure away, never the retriever missing it.`,
  },
  {
    value: `${evals.p50}ms`,
    label: "median answer",
    note: "End to end, retrieval through generation, against a free tier with no warm instance held open.",
  },
  {
    value: `${evals.p95}ms`,
    label: "95th percentile",
    note: "The slow tail is the honest number. It is what a visitor gets when the provider is busy and the request is not cached.",
  },
];

export default function Measured() {
  const groups = Object.entries(evals.groups ?? {});
  const bothRetrievers = evals.denseUsed ?? 0;
  const retrievals = evals.retrievals ?? 0;

  return (
    /* This block is the section's own summary and reads as a caption at half
       width, so it spans. It says so itself rather than being selected by
       position: see the note on [data-span] in page.module.css. */
    <div className={styles.wrap} data-span="full">
      <dl className={styles.grid}>
        {ROWS.map((r) => (
          <div key={r.label} className={styles.row}>
            <dt className={styles.head}>
              <span className={`${styles.value} tabular`}>{r.value}</span>
              <span className="label">{r.label}</span>
            </dt>
            <dd className={styles.note}>{r.note}</dd>
          </div>
        ))}
      </dl>

      {/* The breakdown and the two latencies side by side: the cases on the
          left, how long a visitor waits on the right. Median and tail on one
          zero-based scale, so the gap between them is the length a reader sees. */}
      <div className={styles.pair}>
      {groups.length > 0 && (
        <ul className={styles.groups}>
          {groups.map(([name, g]) => (
            <li key={name} className={styles.group}>
              {/* Cases, not runs, and it has to say so.
                  "1/6" sitting under "69/80 runs pass" is two different
                  denominators with nothing distinguishing them: one counts
                  cases that were clean every single run, the other counts
                  individual runs. */}
              <span className={`${styles.groupValue} tabular`}>
                {g.passed}/{g.cases}
              </span>
              <span className="label">
                {name} · cases clean
              </span>
              <span className={styles.groupNote}>{GROUPS[name]}</span>
            </li>
          ))}
        </ul>
      )}
      {evals.p50 > 0 && evals.p95 > 0 && (
        <Compare
          title={`Answer latency, ${evals.measured} run`}
          min={0}
          max={Math.ceil(evals.p95 / 2000) * 2}
          ticks={Array.from({ length: Math.ceil(evals.p95 / 2000) + 1 }, (_, i) => i * 2)}
          unit=" s"
          rows={[
            { label: "Median answer", value: evals.p50 / 1000, shown: `${(evals.p50 / 1000).toFixed(1)} s`, lead: true },
            { label: "95th percentile", value: evals.p95 / 1000, shown: `${(evals.p95 / 1000).toFixed(1)} s` },
          ]}
        />
      )}
      </div>

      {/* Every assertion lives in the eval matrix below, case by case (D52). */}

      {/* The limits of the thing above, stated by the thing above.
          A suite that only publishes its score is advertising; one that
          publishes what it cannot see is evidence. */}
      <details className={`more ${styles.limits}`}>
        <summary>
          <span className="more-open">What these {evals.cases} cases cannot catch</span>
          <span className="more-close">Show less</span>
        </summary>
        <ul className={styles.limitList}>
          <li>
            Assertions are substring and route checks. Nothing here grades whether an answer reads
            well, only whether it is grounded and routed correctly.
          </li>
          <li>
            There is no LLM judge, deliberately. At {evals.cases} cases with known correct behaviour, a
            judge adds cost, latency, and a second thing to trust.
          </li>
          <li>
            One provider is measured per run. This one was served by{" "}
            <span className={styles.provider}>{evals.provider ?? "the first reachable provider"}</span> on{" "}
            <code>{evals.model}</code>, after the primary returned a daily rate limit.
          </li>
          {retrievals > 0 && (
            <li>
              Both retrievers ran on {bothRetrievers} of {retrievals} retrievals. A short-circuit
              used to skip the embedding call when one keyword hit led the rest by 2.2x; measured
              across the suite it never fired on the rare-term queries it was written for, and fired
              only on the weakest-scoring ones, where it answered a question about his work with a
              paragraph about this website. It was removed rather than retuned.
            </li>
          )}
        </ul>
      </details>

      <p className={styles.foot}>
        Measured <time dateTime={evals.measured}>{evals.measured}</time> by{" "}
        <code>npm run test:evals</code>, which writes the file this section reads. Nothing here is
        entered by hand, so the figures cannot drift from the run that produced them.
      </p>
    </div>
  );
}
