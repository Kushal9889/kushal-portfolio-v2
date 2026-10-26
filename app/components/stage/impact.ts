type Gsap = typeof import("gsap").gsap;
type Timeline = ReturnType<Gsap["timeline"]>;

/** Seconds from launch to the moment the element reaches the glass. */
export const IMPACT_ARRIVAL = 0.62;
export const IMPACT_SETTLE = 0.18;
/** Where in the arrival the hit reads: expo.out has covered ~95% of the distance here. */
export const IMPACT_HIT = IMPACT_ARRIVAL * 0.55;

export type ImpactOptions = {
  from?: "depth" | "left" | "top";
  strength?: number;
  /** Element that shakes on the hit. Never an ancestor of a pinned or fixed element. */
  shake?: HTMLElement | null;
  /** Full-viewport hairline frame that flashes on the hit. */
  flash?: HTMLElement | null;
  paused?: boolean;
};

/**
 * Something arrives from depth, overshoots the screen plane, and settles.
 * Returns a timeline so a caller can play it on enter, or seek it for a frame.
 */
export function impact(
  gsap: Gsap,
  el: HTMLElement,
  { from = "depth", strength = 1, shake, flash, paused = true }: ImpactOptions = {},
): Timeline {
  const start =
    from === "left"
      ? { x: "-60vw", opacity: 0 }
      : from === "top"
        ? { y: "-60vh", opacity: 0 }
        : { z: -1400 * strength, scale: 0.7, opacity: 0 };
  const overshoot =
    from === "left"
      ? { x: 12 * strength }
      : from === "top"
        ? { y: 12 * strength }
        : { z: 30 * strength, scale: 1.03 };
  const rest = from === "depth" ? { z: 0, scale: 1 } : { x: 0, y: 0 };

  // A paused timeline does not reliably render a from-state until it first
  // plays, so the element is put at its start explicitly: nothing that is about
  // to arrive is visible early.
  if (paused) gsap.set(el, { transformPerspective: 900, ...start });

  const tl = gsap.timeline({ paused });
  tl.set(el, { transformPerspective: 900, willChange: "transform, opacity" })
    .fromTo(el, start, { ...overshoot, opacity: 1, duration: IMPACT_ARRIVAL, ease: "expo.out" })
    .to(el, { ...rest, duration: IMPACT_SETTLE, ease: "back.out(2)" })
    .set(el, { willChange: "auto" });

  if (shake) {
    tl.fromTo(
      shake,
      { x: 0 },
      { x: 2 * strength, duration: 0.03, repeat: 3, yoyo: true, ease: "none", immediateRender: false },
      IMPACT_HIT,
    );
  }
  if (flash) {
    tl.fromTo(flash, { opacity: 1 }, { opacity: 0, duration: 0.16, ease: "power1.out", immediateRender: false }, IMPACT_HIT);
  }
  return tl;
}

/** The docked card pushes its neighbours away from its centre, then they spring back. */
export function collide(gsap: Gsap, docked: HTMLElement, cards: HTMLElement[], strength = 1) {
  const a = docked.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  for (const n of cards) {
    if (n === docked) continue;
    const b = n.getBoundingClientRect();
    let dx = b.left + b.width / 2 - ax;
    let dy = b.top + b.height / 2 - ay;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    gsap
      .timeline()
      .to(n, { x: dx * 6 * strength, y: dy * 6 * strength, duration: 0.08, ease: "power2.out" })
      .to(n, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.45)" });
  }
}
