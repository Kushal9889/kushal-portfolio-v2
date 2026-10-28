import { section } from "@/lib/content";
import styles from "./Defects.module.css";
import { typeset } from "@/lib/typeset";

/**
 * Failures this page shipped, each paired with the thing that now catches it.
 *
 * A portfolio that lists only what worked is describing a project that never
 * ran. These are real: they were live on this site or in its build, and every
 * one of them failed silently rather than throwing, which is the same class of
 * bug the published research is about. Read from the corpus, so the agent can
 * answer questions about them and the page cannot claim a guard that no longer
 * exists.
 */
/**
 * What kind of thing is holding this defect down.
 *
 * A guard that is a test fails in CI; a guard that is code cannot regress
 * without someone editing the line; a guard that is a gate fails the build.
 * They are different promises and the list read as one flat kind, so a reader
 * could not tell "there is a test for this" from "we were careful".
 *
 * Derived from the guard sentence rather than stored twice, for the same reason
 * every other number on this page is derived.
 */
function guardKind(guard: string): "test" | "gate" | "code" {
  if (/\btests?\b|asserted|eval suite|regression/i.test(guard)) return "test";
  if (/gate|fails the build|audit|linter|measured/i.test(guard)) return "gate";
  return "code";
}

export default function Defects() {
  const s = section("Defects this page shipped and then fixed");
  /* All of them.
   *
   * The heading counted every defect in the corpus and the list showed four,
   * so a section about not hiding failures was hiding eleven of them. They are
   * one line each; the honest version is not meaningfully longer. */
  const rows = s.defects;
  if (rows.length === 0) return null;

  return (
    <div className={styles.wrap}>
      {/* Closed by default. Fifteen rows of failure detail is evidence a reader
          reaches for, not a headline they scan past on the way to the next
          section -- same "detail stays in the markup" rule as Prose's
          Foldable, so a crawler, a printer or a reader with scripting off
          still gets the complete list. */}
      <details className="more">
        <summary>
          <span className={`more-open ${styles.head}`}>
            {s.defects.length} defects this page shipped, and what now stops each one
          </span>
          <span className="more-close">Show less</span>
        </summary>
        <dl className={styles.list}>
          {rows.map((d) => (
            <div key={d.symptom} className={styles.row} data-guard={guardKind(d.guard)}>
              <dt className={styles.symptom}>{typeset(d.symptom)}</dt>
              <dd className={styles.guard} data-guard={guardKind(d.guard)}>
                {typeset(d.guard)}
              </dd>
            </div>
          ))}
        </dl>
        <p className={styles.note}>
          None of these threw an exception. That is the point: a leaked monologue renders as text, a
          null token count renders as blank, and a missed pattern returns a confident answer to the
          wrong question.
        </p>
      </details>
    </div>
  );
}
