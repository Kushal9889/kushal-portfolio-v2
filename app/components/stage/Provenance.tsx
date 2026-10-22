import styles from "./Provenance.module.css";

export type ProvenanceRow = { term: string; value: string; href?: string; code?: boolean };

/**
 * Where a figure came from and when, one press away from the figure itself.
 *
 * The one pattern repeated across chapters on purpose: every other surface is
 * drawn for its own chapter, but the page's claim is that it cites itself, so
 * the way a number shows its source has to read the same everywhere.
 *
 * A native popover, so it opens, closes on Escape and on an outside press, and
 * returns focus with no script. Where CSS anchor positioning is supported it
 * sits beside the figure; elsewhere the browser centres it, which still works.
 */
export default function Provenance({ id, label, rows }: { id: string; label: string; rows: ProvenanceRow[] }) {
  const popover = `provenance-${id}`;
  const anchor = `--provenance-${id}`;
  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.chip}
        popoverTarget={popover}
        aria-label={`Where ${label} comes from`}
        style={{ anchorName: anchor } as React.CSSProperties}
      >
        source
      </button>
      <span
        id={popover}
        popover="auto"
        role="note"
        className={styles.pop}
        style={{ positionAnchor: anchor } as React.CSSProperties}
      >
        {rows.map((row) => (
          <span key={row.term} className={styles.row}>
            <span className={styles.term}>{row.term}</span>
            {row.href ? (
              <a className={styles.value} href={row.href}>
                {row.value}
              </a>
            ) : row.code ? (
              <code className={styles.value}>{row.value}</code>
            ) : (
              <span className={styles.value}>{row.value}</span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
