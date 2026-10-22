"use client";

import { useState } from "react";
import evals from "@/content/evals.json";
import Panel from "./Panel";
import styles from "./EvalMatrix.module.css";
import { reducedMotion } from "@/lib/verbs";

/**
 * The eval suite, as sixteen objects rather than one score.
 *
 * "16/16 passed" is four different claims wearing one number, and the strongest
 * of them is the least visible: six of these cases are attempts to make the
 * agent misbehave, and passing means the model was never reached at all. A
 * reader who sees six deflections in a row has been told something a ratio
 * cannot say.
 *
 * Deliberately not a grid of green squares. That shape is a contribution
 * calendar, it restates the number printed directly above it, and it encodes
 * pass -- which is the baseline expectation -- rather than group, which is the
 * information. Colour here is the kind of case; the mark is the outcome.
 *
 * Every value is read from `content/evals.json`, written by `npm run test:evals`
 * from the run that produced it. Nothing here is authored.
 */
const GROUPS = [
  {
    key: "grounding",
    label: "grounding",
    says: "the answer reproduces a figure that exists in the corpus",
  },
  {
    key: "policy",
    label: "policy",
    says: "compensation, personal life and prompt overrides never reach a model",
  },
  {
    key: "authorisation",
    label: "authorisation",
    says: "asked, it answers exactly; unasked, it never raises the subject",
  },
  {
    key: "out-of-corpus",
    label: "out of corpus",
    says: "a question the corpus cannot answer produces no invention",
  },
] as const;

type Case = {
  name: string;
  group: string;
  asserts: string;
  pass: boolean;
  /** How often it passed across `runs`. The suite used to run each case once
   *  against a model that is not deterministic, so a single lucky afternoon
   *  published itself as certainty. */
  passRate?: number;
  runs?: number;
  /** Why it failed, when it failed: route, omission, leak or invention. */
  modes?: string[];
};

/**
 * Whether a provider was ever called for this case.
 *
 * Read from the assertion the runner wrote rather than stored separately: a
 * case asserting it routes to `deflect` or `authorisation` is one the policy
 * layer answered on its own. That is the strongest thing the suite proves and
 * a pass/fail ratio cannot say it.
 */
/**
 * Questions typed wrong on purpose: the suite checks that retrieval survives a
 * misspelt company or word (lib/agent/evals.ts). Shown as a typo on the page
 * they read as carelessness, so the detail and the label say so.
 */
const MISSPELT: Record<string, string> = {
  "Tell me about Growza": "Growaza",
  "What did he do at IMG Sytems?": "IMG Systems",
  "What certifcations does he have?": "certifications",
};

function reachedModel(c: Case) {
  return !/routes to (deflect|authorisation)/.test(c.asserts);
}

export default function EvalMatrix() {
  const cases = (evals.cases_detail ?? []) as Case[];
  const [open, setOpen] = useState<string | null>(null);
  if (cases.length === 0) return null;

  const partial = cases.filter((c) => (c.passRate ?? (c.pass ? 1 : 0)) < 1).length;
  const runs = evals.runs ?? 1;
  const totalRuns = evals.totalRuns ?? cases.length;
  const totalPasses = evals.totalPasses ?? evals.passed;

  return (
    /* Paper, not console.
     *
     * This is an instrument and it is interactive, which is enough to satisfy
     * the console check, and it would look better dark. It is still a published
     * result from a build-time run rather than something happening while a
     * reader looks at it, and the ground has to keep meaning exactly one thing
     * or it stops being information. Dark is the agent, the compiled graph and
     * the fusion figure, which change on the page in front of you. */
    <Panel
      label="eval suite"
      surface="console"
      state={partial ? "degraded" : "done"}
      status={`${evals.passed}/${evals.cases} · ${evals.measured}`}
    >
      {/* What the aggregate was hiding.
       *
       * Everything deterministic is perfect and everything that depends on the
       * model summarising is not, which is the single most useful thing this
       * suite has to say and the one thing a ratio cannot. */}
      <p className={styles.headline}>
        {cases.length} cases, {runs} runs each (the pass count is above, under How this is measured).
        Every policy and authorisation run passes because none of them reaches a model. The
        grounding cases are where a language model has to summarise without dropping the figure,
        and that is where the suite is honest about being probabilistic.
      </p>

      <div className={styles.groups}>
        {GROUPS.map((g) => {
          const inGroup = cases.filter((c) => c.group === g.key);
          if (inGroup.length === 0) return null;
          return (
            <div key={g.key} className={styles.group} data-group={g.key}>
              <div className={styles.groupHead}>
                <span className={styles.groupLabel}>{g.label}</span>
                <span className={`${styles.groupCount} tabular`}>
                  {inGroup.reduce((t, c) => t + Math.round((c.passRate ?? (c.pass ? 1 : 0)) * runs), 0)}
                  /{inGroup.length * runs}
                </span>
              </div>

              <ul className={styles.cells}>
                {inGroup.map((c, i) => (
                  <li key={c.name}>
                    <button
                      type="button"
                      className={styles.cell}
                      data-reliability={(c.passRate ?? (c.pass ? 1 : 0)) === 1 ? "pass" : "partial"}
                      data-reached-model={String(reachedModel(c))}
                      data-open={open === c.name || undefined}
                      style={{ "--i": i } as React.CSSProperties}
                      aria-expanded={open === c.name}
                      aria-label={`${c.name}.${MISSPELT[c.name] ? ` Misspelt on purpose for ${MISSPELT[c.name]}.` : ""} Asserts ${c.asserts}. Passed ${Math.round(
                        (c.passRate ?? (c.pass ? 1 : 0)) * runs,
                      )} of ${runs} runs.${reachedModel(c) ? "" : " No model was called."}`}
                      onClick={() => {
                        const next = open === c.name ? null : c.name;
                        /* The detail block is one region showing one case at a
                           time, so swapping it is a state transition rather
                           than a navigation, and the browser can cross-fade it
                           itself. Same-document view transitions are Baseline;
                           where they are not available the state still changes,
                           just without the fade. */
                        if (
                          typeof document.startViewTransition === "function" &&
                          !reducedMotion()
                        ) {
                          document.startViewTransition(() => setOpen(next));
                        } else {
                          setOpen(next);
                        }
                      }}
                    >
                      {/* Filled to the rate it actually passed at. A solid cell
                          is reliable, a part-filled one is flaky, and the eye
                          reads the difference without reading a number. Drawn as
                          an element rather than a colour stop because every
                          gradient function is banned in this stylesheet. */}
                      <span
                        className={styles.fill}
                        style={
                          { "--rate": `${(c.passRate ?? (c.pass ? 1 : 0)) * 100}%` } as React.CSSProperties
                        }
                      />
                    </button>
                  </li>
                ))}
              </ul>

              <p className={styles.says}>{g.says}</p>
            </div>
          );
        })}
      </div>

      {/* One case at a time, in place. A list of sixteen assertions is a wall on
          a page that has to be skimmable; a reader who wants one gets one. */}
      <div className={styles.detail} aria-live="polite">
        {open ? (
          <>
            <p className={styles.detailQ}>{open}</p>
            {MISSPELT[open] && (
              <p className={styles.detailA}>Misspelt on purpose: the answer must still find {MISSPELT[open]}.</p>
            )}
            <p className={styles.detailA}>{cases.find((c) => c.name === open)?.asserts}</p>
            {(() => {
              const c = cases.find((x) => x.name === open);
              if (!c || (c.passRate ?? 1) === 1) return null;
              return (
                <p className={styles.detailLimit}>
                  Passed {Math.round((c.passRate ?? 0) * runs)} of {runs} runs
                  {c.modes?.length ? ` · ${c.modes.join(", ")}` : ""}
                </p>
              );
            })()}
          </>
        ) : (
          <p className={styles.detailHint}>
            Every cell is one case, filled to the share of runs it passed. Open one to read the
            assertion the runner wrote for it.
          </p>
        )}
      </div>
    </Panel>
  );
}
