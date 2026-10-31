import models from "@/content/models.json";
import Panel from "./Panel";
import styles from "./ModelChoice.module.css";
import { longDate } from "@/lib/typeset";

/**
 * Which model answers, and why that was not a guess.
 *
 * A hundred-odd models are reachable on one key. Picking one because it felt
 * fast is the decision this page exists to argue against, so five were measured
 * on the real pipeline -- same retrieval, same prompt, same cleaning -- and the
 * result is rendered from what `npm run bench:models` wrote rather than typed
 * in by hand.
 *
 * Rendered on paper rather than the console surface, for the same reason the
 * eval matrix is: this is a published result from a build-time run, not
 * something happening while a reader looks at it. The ground has to keep
 * meaning exactly one thing.
 *
 * The headline is the finding rather than the winner. Four of the five could
 * not be told apart, and a table that ranked them anyway would be presenting
 * noise as a result.
 */
type Row = (typeof models.results)[number];

const WIDEST = Math.max(...models.results.map((r) => r.p95));

/** Plain language first. A hiring manager reads one line and decides. */
function headline() {
  const chosen = models.results.find((r) => r.model === models.chosen);
  if (!chosen) return "";
  const seconds = (chosen.p50 / 1000).toFixed(1);
  return `Answers in about ${seconds} seconds, and gets every test question right.`;
}

export default function ModelChoice() {
  const chosen = models.results.find((r) => r.model === models.chosen);
  const tied = models.indistinguishable ?? [];

  return (
    <Panel
      label="which model answers"
      state="done"
      status={`${models.results.length} tested · ${models.observations} runs each`}
    >
      <p className={styles.headline}>{headline()}</p>

      <p className={styles.lede}>
        Five models were asked the same {models.cases} questions,{" "}
        {models.runs} times each, through the same pipeline that answers you above.
        {tied.length > 1 && (
          <>
            {" "}
            <b>{tied.length} of them were too close to call.</b> Their scores sit inside each
            other&rsquo;s margin of error, so ranking them would be reporting luck. Nothing
            here justified a change, so the model already in use stayed.
          </>
        )}
      </p>

      <ol className={styles.rows}>
        {models.results.map((r: Row) => {
          const isChosen = r.model === models.chosen;
          const weak = r.high < 0.8;
          return (
            <li
              key={r.model}
              className={styles.row}
              data-live={isChosen || undefined}
              data-failing={weak || undefined}
            >
              <span className={styles.name}>
                {r.model.split("/")[1] ?? r.model}
                {isChosen && <span className={styles.liveBadge}>answering now</span>}
              </span>

              <span className={styles.score}>
                {Math.round(r.rate * 100)}% right
                {/* A score without its uncertainty is the thing that makes
                    leaderboards misleading, so the range travels with it. */}
                <span className={styles.range}>
                  could be {Math.round(r.low * 100)}-{Math.round(r.high * 100)}%
                </span>
              </span>

              <span className={styles.bar} aria-hidden="true">
                <span className={styles.fill} style={{ "--w": `${(r.p95 / WIDEST) * 100}%` } as React.CSSProperties} />
              </span>

              <span className={styles.time}>
                {(r.p95 / 1000).toFixed(1)}s
                <span className={styles.range}>slowest 1 in 20</span>
              </span>
            </li>
          );
        })}
      </ol>

      <p className={styles.foot}>
        The bar is the slow case, not the average: one request in twenty takes at least that
        long, and that is the one a visitor notices. The fastest model here is also the least
        accurate, getting {Math.round((models.results.at(-1)?.rate ?? 0) * 100)}% right, which
        is what happens when a model is quick because it says less.
        {chosen && (
          <>
            {" "}
            Measured {longDate(models.measured)}. Re-run with <code>npm run bench:models</code>.
          </>
        )}
      </p>
    </Panel>
  );
}
