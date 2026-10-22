import styles from "./Timeline.module.css";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const NAME = MONTHS.join("|");
const RANGE = new RegExp(`(${NAME}) (\\d{4}) to (?:(${NAME}) (\\d{4})|present)`, "i");

const month = (name: string, year: string) => Number(year) * 12 + MONTHS.indexOf(name.toLowerCase());

/**
 * The first "Month YYYY to Month YYYY" (or "to present") in a string, as month
 * numbers. The dates come from the corpus sentence that states them, so the
 * drawing cannot disagree with the text beside it.
 */
export function range(text: string) {
  const m = text.replace(/\s+/g, " ").match(RANGE);
  if (!m) return null;
  return { start: month(m[1], m[2]), end: m[3] ? month(m[3], m[4]) : null, text: m[0] };
}

/** "from January 2027" anywhere in a string, as the ISO date that month starts. */
export function startOf(text: string) {
  const m = text.replace(/\s+/g, " ").match(new RegExp(`from (${NAME}) (\\d{4})`, "i"));
  if (!m) return null;
  const mm = String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0");
  return { label: `${m[1]} ${m[2]}`, iso: `${m[2]}-${mm}-01` };
}

export type Span = { label: string; sub?: string; when: string; href?: string; tint?: string };

/**
 * Spans of time on one axis: what overlapped, what followed, what is still
 * running. A row per span, so two roles held at once read as two bars rather
 * than one bar drawn over another.
 *
 * Static on purpose. The bars are data a reader compares, and data being read
 * does not move for style. A span still running has no end to draw, so its
 * bar fades out at the edge of the axis instead of stopping at a date it has
 * not reached.
 */
export default function Timeline({ items, label }: { items: Span[]; label: string }) {
  const rows = items.flatMap((it) => {
    const r = range(it.when);
    return r ? [{ ...it, r }] : [];
  });
  if (rows.length === 0) return null;

  const lo = Math.floor(Math.min(...rows.map((x) => x.r.start)) / 12) * 12;
  const hi = Math.ceil((Math.max(...rows.map((x) => Math.max(x.r.start, x.r.end ?? 0))) + 1) / 12) * 12;
  const at = (m: number) => ((m - lo) / (hi - lo)) * 100;
  const years = Array.from({ length: (hi - lo) / 12 + 1 }, (_, i) => lo / 12 + i);

  return (
    <figure className={styles.timeline} aria-label={label}>
      {/* The year axis is hidden from screen readers; its span is said here. */}
      <p className={styles.srOnly}>{`${rows.length} spans on a timeline from ${lo / 12} to ${hi / 12}.`}</p>
      <ol className={styles.rows}>
        {rows.map((x) => {
          const end = x.r.end === null ? hi : x.r.end + 1;
          const body = (
            <>
              <span className={styles.label}>
                <span className={styles.name}>{x.label}</span>
                {x.sub && <span className={styles.sub}>{x.sub}</span>}
                <span className={styles.when}>{x.r.text}</span>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.bar}
                  data-open={x.r.end === null || undefined}
                  style={
                    {
                      insetInlineStart: `${at(x.r.start)}%`,
                      inlineSize: `${Math.max(at(end) - at(x.r.start), 1.5)}%`,
                      "--tint": x.tint,
                    } as React.CSSProperties
                  }
                />
              </span>
            </>
          );
          return (
            // data-wide: a row is a drawing, not a line of prose held to the measure.
            <li key={`${x.label}${x.r.start}`} data-wide>
              {x.href ? (
                <a className={styles.row} href={x.href}>
                  {body}
                </a>
              ) : (
                <div className={styles.row}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div className={styles.axis} aria-hidden="true">
        {years.map((y) => (
          <span key={y} style={{ insetInlineStart: `${at(y * 12)}%` }}>
            {y}
          </span>
        ))}
      </div>
    </figure>
  );
}
