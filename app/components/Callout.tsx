import styles from "./Callout.module.css";

/**
 * A detail callout, in the construction-drawing sense.
 *
 * The circle is split across the middle: what this is above the line, where it
 * is drawn below it. On a drawing set that pairing is what lets a reader leave
 * one sheet and arrive at the right place on another, which is the same job
 * every piece of evidence on this page has to do.
 *
 * It carries no information of its own. Both halves are passed in from the
 * object being marked, so a callout can never say something its subject does
 * not.
 */
export default function Callout({
  detail,
  sheet,
  anchorName,
}: {
  /** Above the line: which detail this is. */
  detail: string;
  /** Below the line: where it is drawn. */
  sheet: string;
  /**
   * Registers this mark as an anchor so a leader line can be drawn to it.
   *
   * A dashed custom identifier, e.g. `--proof-4925`. Only set where something
   * on the page actually points here; a name nothing references costs a style
   * recalculation and buys nothing.
   */
  anchorName?: string;
}) {
  return (
    <span
      className={styles.mark}
      aria-hidden="true"
      style={anchorName ? ({ anchorName } as React.CSSProperties) : undefined}
    >
      <span className={styles.detail}>{detail}</span>
      <span className={styles.sheet}>{sheet}</span>
    </span>
  );
}
