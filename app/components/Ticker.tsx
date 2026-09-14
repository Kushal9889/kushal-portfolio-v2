import type { Metric } from "@/lib/content";
import styles from "./Ticker.module.css";

/**
 * The measured values, running along the turn.
 *
 * Every figure here is already rendered somewhere below in full context. This is
 * not a second source: it is handed the same parsed `Metric` objects the
 * sections use, so a number cannot appear on this strip that is not in
 * `content/facts.md`, and `verify:facts` guards it exactly as it guards the rest.
 *
 * It moves on scroll, not on a clock, and that is an accessibility decision
 * rather than a stylistic one. WCAG 2.2.2 requires that anything moving
 * automatically for more than five seconds can be paused, stopped or hidden, and
 * the usual answer is to bolt a pause button onto a marquee. Content driven by
 * the scroller is not moving automatically at all: it moves exactly as much as
 * the reader moves it and stops when they stop, so the criterion does not apply
 * and no control has to be invented.
 *
 * `aria-hidden`, because it is a repetition. A screen reader meeting these
 * figures here would hear the page's numbers twice, out of the context that
 * makes them mean anything.
 */
export default function Ticker({ items }: { items: Metric[] }) {
  if (items.length === 0) return null;

  // Two passes of the same row. The strip translates by exactly half its width,
  // so the second pass is under the cursor at the moment the first leaves and
  // the seam never shows.
  const run = [...items, ...items];

  return (
    <div className={styles.strip} aria-hidden="true">
      <div className={styles.track}>
        {run.map((m, i) => (
          <span className={styles.cell} key={`${m.label}-${i}`}>
            <span className={`${styles.value} tabular`}>{m.value}</span>
            <span className={styles.label}>{m.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
