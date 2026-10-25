import styles from "./Compare.module.css";

export type Reading = { label: string; value: number; shown: string; lead?: boolean };

/**
 * Readings on one labelled scale, so a difference is seen rather than computed.
 *
 * Bars start at zero, so their lengths are honest. A scale that does not start
 * at zero draws dots instead: a bar cut off at 80% would make a three-point
 * gap look like a doubling, and a dot on a labelled axis cannot.
 */
export default function Compare({
  title,
  rows,
  min,
  max,
  ticks,
  unit = "",
  note,
}: {
  title: string;
  rows: Reading[];
  min: number;
  max: number;
  ticks: number[];
  unit?: string;
  note?: string;
}) {
  // A reading that failed to parse is left out rather than drawn as nothing,
  // and one past the scale stops at its edge rather than leaving the track.
  const shown = rows.filter((r) => Number.isFinite(r.value));
  if (max <= min || shown.length === 0) return null;
  const at = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const dots = min !== 0;
  const spoken = unit.trim() === "s" ? " seconds" : unit;

  return (
    <figure className={styles.compare}>
      <figcaption className={styles.title}>{title}</figcaption>
      {/* The axis is hidden from screen readers, so its type and bounds are said
          once here, with the unit spelled out. */}
      <p className={styles.srOnly}>
        {`${dots ? "Dot" : "Bar"} chart, ${min}${spoken} to ${max}${spoken}.`}
      </p>
      {/* A list, not a description list: every `main > section dl` on this page
          is a metrics strip and takes its figure typography. */}
      <ul className={styles.rows}>
        {shown.map((r) => (
          <li key={r.label} className={styles.row} data-lead={r.lead || undefined} data-wide>
            <span className={styles.label}>{r.label}</span>
            <span className={styles.cell}>
              <span className={styles.track} aria-hidden="true">
                {dots ? (
                  <span className={styles.dot} style={{ insetInlineStart: `${at(r.value)}%` }} />
                ) : (
                  <span className={styles.bar} style={{ inlineSize: `${at(r.value)}%` }} />
                )}
              </span>
              <span className={`${styles.value} tabular`}>{r.shown}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.axis} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ insetInlineStart: `${at(t)}%` }}>
            {t}
            {unit}
          </span>
        ))}
      </div>
      {note && <p className={styles.note}>{note}</p>}
    </figure>
  );
}
