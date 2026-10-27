/**
 * The page's spring vocabulary, in Motion's designer terms.
 *
 * Apple ships two parameters, damping ratio and response; Motion's `bounce` and
 * `visualDuration` are the same pair. Bounce stays at zero everywhere except
 * where the reader's own gesture carried momentum (Designing Fluid Interfaces,
 * WWDC 2018): overshoot on a control that was only clicked reads as wobble.
 *
 * Springs animate from the value on screen, so every one of these can be
 * interrupted mid-flight and reversed without a jump.
 */
export const spring = {
  /** Surfaces answering the pointer: hover lift, press depth. */
  touch: { type: "spring", bounce: 0, visualDuration: 0.22 },
  /** Things that change size: disclosures opening and closing. */
  size: { type: "spring", bounce: 0, visualDuration: 0.34 },
  /** Something travelling across the screen: a card plate to its viewer. */
  travel: { type: "spring", bounce: 0, visualDuration: 0.42 },
} as const;

/** The site's own switch: the reader's OS setting, overridden by Motion on/off. */
export { reducedMotion } from "@/lib/verbs";
