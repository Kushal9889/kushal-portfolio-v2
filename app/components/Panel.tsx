import styles from "./Panel.module.css";

/**
 * One instrument.
 *
 * Every live thing on this page is a panel: a header strip saying what it is on
 * the left and what it is doing on the right, then the instrument itself. The
 * hero's agent block established the shape; this is that shape extracted so the
 * topology graph, the rank fusion figure and the trace are not three
 * hand-authored approximations of it.
 *
 * The ground carries the meaning. `console` is dark and means this runs; paper
 * is light and means this was written. A panel that renders on the console
 * ground has to contain something that actually changes at runtime, which
 * `scripts/audit.ts` check 13.2 enforces, because a dark box chosen for looks
 * would cost the ground its meaning everywhere else.
 */
export type PanelState = "idle" | "running" | "done" | "degraded";

/**
 * What shape of thing is inside, which decides how the enclosure is built.
 *
 * Four of the twenty-five blocks on this page had an enclosure and the rest sat
 * loose on the ground, so the page read as rules and gaps. Putting the same
 * enclosure around all of them would trade that for twenty identical boxes,
 * which is the other failure. These are the four shapes the content actually
 * comes in, and each one wants a different enclosure:
 *
 *   instrument  a figure that changes. Header strip, corner marks, inset body.
 *   record      rows a reader opens. Body runs to the frame so the rows are
 *               full-width targets; no corner marks, because a list in a frame
 *               is not a machine.
 *   readout     measured values. No header fill, so the figures are the only
 *               thing with weight inside the frame.
 *   rack        one unit in a stack of like units. Taller strip, and an edge
 *               that marks which unit the reader is level with.
 */
export type PanelKind = "instrument" | "record" | "readout" | "rack";

export default function Panel({
  label,
  state = "idle",
  status,
  surface = "console",
  kind = "instrument",
  heading,
  children,
  className,
}: {
  /** What the instrument is. Set in caps at label scale, left of the strip. */
  label: React.ReactNode;
  /** What it is doing. Drives the dot and is read by assistive tech. */
  state?: PanelState;
  /** The measured value or condition, right of the strip. Omitted when idle. */
  status?: React.ReactNode;
  surface?: "console" | "paper";
  kind?: PanelKind;
  /**
   * Render the label as a real heading at this level.
   *
   * A `section` with no heading is a landmark with no name, and this page is
   * about to gain a lot of them. Where a panel replaces a block that already
   * carried an `h3`, it takes the `h3` with it rather than demoting it to a
   * span and losing that rung of the outline.
   */
  heading?: 3;
  children: React.ReactNode;
  className?: string;
}) {
  const Label = heading === 3 ? "h3" : "span";

  return (
    <section
      className={className ? `${styles.panel} ${className}` : styles.panel}
      data-surface={surface}
      data-state={state}
      /* An instrument is an enclosure, not a rule between two things. The frame,
         the caught edge and the corner marks come from the ladder in
         globals.css so every housing on the page is the same object. */
      data-tier="housing"
      data-kind={kind}
      /* This panel animates itself in, via @starting-style in its own
         stylesheet, because it mounts after first paint and there is no class
         to toggle. PageMotion has to leave it alone: two systems owning opacity
         on one element is how a panel ends up stranded at zero. */
      data-entrance="self"
    >
      <header className={styles.head}>
        <Label className={styles.label}>{label}</Label>
        {status !== undefined && (
          <span className={styles.status}>
            {/* Only a running instrument gets the pulse. A dot that always
                breathes is decoration; this one means a request is in flight. */}
            <span className="live-dot" data-state={state === "running" ? "running" : undefined} />
            {status}
          </span>
        )}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
