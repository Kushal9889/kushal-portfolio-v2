/**
 * The number grammar: how a figure is allowed to move is decided by what kind of
 * truth it is, never by where it sits on the page.
 *
 *   settle  a historical figure (résumé, paper, eval run). Rolls from true zero
 *           to its value once and then stays still.
 *   pulse   a value measured in this session (a probe, the reader's own answer).
 *           Updates in place with a timestamp; never rolls.
 *   stamp   a count verified by an outside party (3 of 10 courses). Segments
 *           fill; the digits do not roll.
 *
 * Everything here is pure so the rules can be tested without a browser: a frame
 * of an odometer may only ever show a value between zero and the target, and the
 * last frame is exactly the string the corpus holds.
 */

export type FigureClass = "settle" | "pulse" | "stamp";

export type Figure = {
  /** The string exactly as the corpus writes it. */
  raw: string;
  /** Text printed before the digits and never animated: "+", "-", "$". */
  prefix: string;
  /** The numeric part, parsed. NaN when the figure has no number to roll. */
  value: number;
  /** Decimal places held for every frame, so 91.4 never shows as 91.39. */
  decimals: number;
  /** Whether the corpus groups thousands ("5,000"). */
  grouped: boolean;
  /** Text after the digits: "%", "+", " ms", "s". */
  suffix: string;
};

const FIGURE = /^([^\dA-Za-z]*?)(\d[\d,]*)(?:\.(\d+))?([^A-Za-z]*[^\d]*)$/;

/** Splits a corpus figure into the part that can roll and the parts that cannot. */
export function parseFigure(raw: string): Figure {
  const match = raw.match(FIGURE);
  if (!match) return { raw, prefix: "", value: Number.NaN, decimals: 0, grouped: false, suffix: raw };
  const [, prefix, whole, fraction = "", suffix] = match;
  const digits = whole.replace(/,/g, "");
  return {
    raw,
    prefix,
    value: Number(fraction ? `${digits}.${fraction}` : digits),
    decimals: fraction.length,
    grouped: whole.includes(","),
    suffix,
  };
}

/** True when the figure has a number worth rolling ("BM25 + vector" does not). */
export function rolls(figure: Figure) {
  return Number.isFinite(figure.value);
}

function group(n: string) {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The string shown at progress `t` (0 to 1) of a settle.
 *
 * `t` is clamped, the value is floored rather than rounded so a rising odometer
 * never shows a number it has not reached yet, and the final frame returns the
 * corpus string untouched.
 */
export function settleFrame(figure: Figure, t: number, from = 0) {
  if (!rolls(figure)) return figure.raw;
  const p = Math.min(Math.max(t, 0), 1);
  if (p >= 1) return figure.raw;
  const start = Math.min(Math.max(from, 0), figure.value);
  const scale = 10 ** figure.decimals;
  const current = Math.floor((start + (figure.value - start) * p) * scale) / scale;
  let digits = current.toFixed(figure.decimals);
  if (figure.grouped) {
    const [whole, fraction] = digits.split(".");
    digits = fraction ? `${group(whole)}.${fraction}` : group(whole);
  }
  return `${figure.prefix}${digits}${figure.suffix}`;
}

/** A before value written as a range ("75-78%") for the before and after ghost. */
export function parseRange(raw: string): { low: number; high: number; suffix: string } | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(%?)/);
  if (!match) return null;
  return { low: Number(match[1]), high: Number(match[2]), suffix: match[3] };
}

/**
 * Where a ghosted figure starts rolling: the top of its before range, so the roll
 * never implies a single baseline the corpus does not state.
 */
export function ghostStart(before: string) {
  return parseRange(before)?.high ?? 0;
}

/** Lit segments per digit for a seven-segment readout, in order a b c d e f g. */
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

export function segmentsFor(digit: string) {
  return SEGMENTS[digit] ?? "";
}

/** "3 minutes ago" style copy for a pulse timestamp, computed now. */
export function relativeTime(then: Date, now = new Date()) {
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const [size, unit] = seconds >= 86400 ? [86400, "day"] : seconds >= 3600 ? [3600, "hour"] : [60, "minute"];
  const n = Math.max(1, Math.floor(seconds / size));
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** Whole days between two instants, floored: "merged 54 days ago". */
export function daysSince(then: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

/** Local wall-clock time for a pulse, "21:52:04". */
export function clock(at: Date) {
  return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * The count of lit points when a share is drawn on a grid of `points`.
 * Floors, and reports the remainder as a partial point, so a data-art mapping
 * never rounds up into a better claim (plan G.2 R5).
 */
export function litPoints(share: number, points: number) {
  const exact = Math.max(0, Math.min(1, share)) * points;
  const full = Math.floor(exact);
  return { full, partial: Math.round((exact - full) * 100) / 100 };
}
