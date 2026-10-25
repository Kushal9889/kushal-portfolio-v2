import type { Metric } from "@/lib/content";
import styles from "./Metrics.module.css";

/**
 * Quantified outcomes, set large enough to survive a scan.
 *
 * Sealed inside a paragraph these are invisible to a reader giving the page six
 * seconds, which is most of them. Pulled out and set at display size they become
 * the entry point: the eye lands on a number, and the prose underneath is there
 * for whoever wants the reasoning behind it.
 *
 * Emphasis comes from scale and weight, never colour. The accent means "live
 * right now" everywhere else on this page, and spending it on static text would
 * cost that word its meaning.
 */
/**
 * Where a figure sits on a scale that actually exists.
 *
 * Borrowed from a sector dial, the "railroad" instrument face: a graduated edge
 * with major marks at the decade and minor marks between, so a reading is placed
 * rather than merely printed. A percentage has a real domain, 0 to 100, and the
 * eye reads "-30%" against it without reading the digits.
 *
 * Returns null for everything else on purpose. `5,000+`, `16` and `BM25 + vector`
 * have no upper bound to be placed against, and inventing one would be a drawn
 * claim about a number the corpus never made. Those keep the graduated edge with
 * nothing marked on it, which is what an instrument face looks like where no
 * reading has been taken.
 */
function percentPosition(value: string): number | null {
  const m = /^([+-]?)(\d+(?:\.\d+)?)\s*%$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n) || n > 100) return null;
  return n;
}

/** `seal` marks the lead figure with a ranking it already carries elsewhere in the
 *  facts (the JEE badge's "Top 1%"), as a stamp beside the number. */
export default function Metrics({ items, seal }: { items: Metric[]; seal?: string }) {
  if (items.length === 0) return null;

  return (
    <dl className={styles.grid}>
      {items.map((m, i) => (
        <div
          key={m.label}
          className={styles.cell}
          data-sourced={m.source ? "" : undefined}
          data-scaled={percentPosition(m.value) !== null ? "" : undefined}
          style={
            percentPosition(m.value) !== null
              ? ({ "--at": `${percentPosition(m.value)}%` } as React.CSSProperties)
              : undefined
          }
        >
          {/* Figures get display size; longer values are phrases rather than
              numbers, and setting them equally large makes them shout over the
              thing actually worth reading. */}
          <dt
            className={
              m.value.length > 6
                ? `${styles.value} ${styles.phrase} tabular`
                : `${styles.value} tabular`
            }
            /* Length decides the size; content decides the voice. The two were
               one test, so `57 hours` counted as a phrase at eight characters
               and set in the interface face beside `14` in the data face. A
               reading is a reading at any length. */
            data-numeric={/^[+\-~$]?\d/.test(m.value) ? "" : undefined}
          >
            {m.value}
          </dt>
          <dd className={styles.label}>
            {i === 0 && seal && <span className={styles.seal}>{seal}</span>}
            {m.label}
            {/* Where the figure comes from, attached to the figure.
                A number on a portfolio is worth exactly as much as the reader's
                willingness to believe it, and "resume" is an honest answer for
                a figure whose only witness is a former employer. A URL is a
                better one, and it is the reason this is a link when it can be. */}
            {m.source && (
              <a
                className={styles.source}
                href={m.source === "resume" ? "/kushal-gaddamwar-resume.pdf" : m.source}
                target="_blank"
                rel="noreferrer"
                title={m.source === "resume" ? "His resume (PDF)" : m.source}
                aria-label={`${m.source === "resume" ? "resume" : "source"} for ${m.label}`}
              >
                {m.source === "resume" ? "resume" : "source"}
              </a>
            )}
          </dd>
          {percentPosition(m.value) !== null && (
            <span className={styles.scaleMark} aria-hidden="true" />
          )}
        </div>
      ))}
    </dl>
  );
}
