import { parseFigure, rolls, settleFrame, ghostStart, clock } from "./numbers";

/**
 * The motion grammar. Every animation on the stage is one of eight verbs, and
 * each verb means one kind of truth, so a reader can tell a live measurement
 * from a historical figure from an outside check without being told.
 *
 * Durations and curves live only in `VERBS`; no component types a duration.
 * Each verb returns a paused GSAP timeline so a caller can play it on a scroll
 * beat, scrub it, or seek it for a still frame. Under reduced motion (the OS
 * setting or the page's own motion toggle) every verb returns a timeline that
 * lands on the final state at once: the content and its meaning survive, only
 * the movement is removed.
 *
 * The aliases at the bottom name the same verbs in the agent's own terms, so
 * chapter code reads as the graph it describes.
 */

type Gsap = typeof import("gsap").gsap;
export type Timeline = ReturnType<Gsap["timeline"]>;

export type VerbName = "condense" | "settle" | "pulse" | "stamp" | "print" | "dock" | "dissolve" | "flood";
export type Pitch = "base" | "minus3" | "plus3";

export const VERBS = {
  condense: { duration: 0.7, ease: "expo.out", meaning: "evidence retrieved from the corpus" },
  settle: { duration: 0.9, ease: "power3.out", meaning: "a historical measured figure" },
  pulse: { duration: 0.24, ease: "power2.out", meaning: "measured in this session" },
  stamp: { duration: 0.42, drop: 12, flash: 0.16, ease: "back.out(1.6)", meaning: "verified by an outside party" },
  print: { perLine: 0.018, cap: 2.4, ease: "none", meaning: "a document" },
  dock: { duration: 0.62, returnDuration: 0.5, shove: 4, ease: "expo.out", meaning: "a member of a measured set" },
  dissolve: { duration: 0.45, ease: "power2.in", meaning: "leaving" },
  flood: { duration: 1.1, ease: "power2.inOut", meaning: "context full, send" },
} as const;

/** Streaming rates for generated text (plan F.4). */
export const STREAM = { wordsPerSecond: 28, charsPerSecond: 90 } as const;

/** Exits run at this share of the matching entrance (plan 3.5). */
export const EXIT = 0.65;

/**
 * The page's own motion toggle wins over the OS setting in both directions.
 * Read from `data-motion-pref` because `data-motion` already means "the motion
 * bundle has loaded" (lib/motion.ts).
 */
export function reducedMotion() {
  if (typeof window === "undefined") return true;
  const own = document.documentElement.dataset.motionPref;
  if (own === "reduced") return true;
  // Full motion unless the reader chose otherwise in the dock; the OS setting
  // alone does not turn it off (FilmBoot.tsx defaults the choice to "allowed").
  return false;
}

export const VERB_EVENT = "stage:verb";
export type VerbDetail = { verb: VerbName; pitch: Pitch };

/**
 * Announces that a verb fired, for the sound engine and the field. Listeners
 * that do not exist yet simply never hear it; nothing waits on the event.
 */
export function emitVerb(verb: VerbName, pitch: Pitch = "base") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<VerbDetail>(VERB_EVENT, { detail: { verb, pitch } }));
}

/**
 * The reduced motion form: final state at once. The verb is still announced, so
 * a reader who switched sound on explicitly still hears it (plan 3.9); the sound
 * engine, not the verb, decides whether reduced motion silences it.
 */
function instant(gsap: Gsap, apply: () => void, verb: VerbName, pitch: Pitch = "base") {
  return gsap
    .timeline({ paused: true })
    .call(apply)
    .call(() => emitVerb(verb, pitch));
}

type Point = { x: number; y: number };

/** Element-relative transform origin for a screen point, so a condense grows from where the evidence was. */
function originFor(el: HTMLElement, point?: Point) {
  if (!point) return "50% 50%";
  const box = el.getBoundingClientRect();
  return `${point.x - box.left}px ${point.y - box.top}px`;
}

/* ---- condense / retrieve ------------------------------------------------ */

export type CondenseOptions = { origin?: Point; pitch?: Pitch };

/** The element gathers out of a point in the field: scale and clip open from the origin. */
export function condense(gsap: Gsap, el: HTMLElement, { origin, pitch = "base" }: CondenseOptions = {}) {
  const v = VERBS.condense;
  if (reducedMotion()) return instant(gsap, () => gsap.set(el, { clearProps: "opacity,scale,filter,transformOrigin" }), "condense", pitch);
  return gsap
    .timeline({ paused: true })
    .call(() => emitVerb("condense", pitch))
    .fromTo(
      el,
      { opacity: 0, scale: 0.94, filter: "blur(6px)", transformOrigin: originFor(el, origin) },
      { opacity: 1, scale: 1, filter: "blur(0px)", duration: v.duration, ease: v.ease, clearProps: "filter" },
    );
}

/* ---- settle / persist ---------------------------------------------------- */

export type SettleOptions = {
  /** Where the roll starts. Defaults to true zero. */
  from?: number;
  /** A before range to ghost behind the figure ("75-78%"). The roll starts at its top. */
  ghost?: HTMLElement | null;
  ghostText?: string;
  pitch?: Pitch;
};

/**
 * Rolls a historical figure from true zero to its corpus value once.
 *
 * The text is rewritten from `settleFrame`, which floors every frame, so the
 * odometer never shows a value above the target or below zero. Digits are not
 * rolled independently: a per-digit roll from 78 to 95 passes through 98, a
 * value the figure never held.
 */
export function settle(gsap: Gsap, el: HTMLElement, raw: string, options: SettleOptions = {}) {
  const v = VERBS.settle;
  const figure = parseFigure(raw);
  const { ghost, ghostText, pitch = "base" } = options;
  const from = ghostText ? ghostStart(ghostText) : (options.from ?? 0);
  const final = () => {
    el.textContent = raw;
    if (ghost) gsap.set(ghost, { opacity: 1, y: 12, "--strike": 1 });
  };
  if (reducedMotion() || !rolls(figure)) return instant(gsap, final, "settle", pitch);

  const state = { t: 0 };
  let last = "";
  const tl = gsap.timeline({ paused: true, onComplete: final });
  if (ghost) {
    tl.fromTo(ghost, { opacity: 0.4, y: 0 }, { opacity: 0.4, duration: 0.01 })
      .fromTo(ghost, { "--strike": 0 }, { "--strike": 1, duration: 0.24, ease: "power2.out" })
      .to(ghost, { y: 12, opacity: 1, duration: 0.3, ease: "power2.out" }, ">");
  }
  tl.call(() => emitVerb("settle", pitch)).fromTo(
    state,
    { t: 0 },
    {
      t: 1,
      duration: v.duration,
      ease: v.ease,
      onUpdate: () => {
        const text = settleFrame(figure, state.t, from);
        if (text === last) return;
        last = text;
        el.textContent = text;
      },
    },
  );
  return tl;
}

/* ---- pulse / observe ---------------------------------------------------- */

export type PulseOptions = { at?: Date; timeEl?: HTMLElement | null; pitch?: Pitch };

/**
 * A value measured now replaces the old one in place; a 1px underline sweeps
 * once and the timestamp refreshes. Never rolls: a live number that counts up
 * would pretend the counting was the measurement.
 */
export function pulse(gsap: Gsap, el: HTMLElement, text: string, { at = new Date(), timeEl, pitch = "base" }: PulseOptions = {}) {
  const v = VERBS.pulse;
  const apply = () => {
    el.textContent = text;
    if (timeEl) {
      timeEl.textContent = clock(at);
      timeEl.setAttribute("datetime", at.toISOString());
    }
  };
  if (reducedMotion()) return instant(gsap, apply, "pulse", pitch);
  return gsap
    .timeline({ paused: true })
    .call(() => {
      apply();
      emitVerb("pulse", pitch);
    })
    .fromTo(el, { "--sweep": 0 }, { "--sweep": 1, duration: v.duration, ease: v.ease })
    .set(el, { "--sweep": 0 }, "+=0.2");
}

/* ---- stamp / verify ----------------------------------------------------- */

export type StampOptions = {
  flash?: HTMLElement | null;
  /** 1 for a full stamp, 0.6 for the small verify marks inside a message. */
  scale?: number;
  corners?: boolean;
  cornerColour?: string;
  pitch?: Pitch;
};

export function stamp(gsap: Gsap, el: HTMLElement, { flash, scale = 1, corners: withCorners = true, cornerColour, pitch = "base" }: StampOptions = {}) {
  const v = VERBS.stamp;
  if (reducedMotion()) {
    return instant(gsap, () => {
      gsap.set(el, { clearProps: "y,scale,opacity" });
      if (withCorners) corners(el, true, cornerColour);
    }, "stamp", pitch);
  }
  const tl = gsap
    .timeline({ paused: true })
    .call(() => emitVerb("stamp", pitch))
    .fromTo(
      el,
      { y: -v.drop * scale, scale: 1 + 0.03 * scale, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: v.duration, ease: v.ease },
    );
  if (flash) tl.fromTo(flash, { opacity: 1 }, { opacity: 0, duration: v.flash, ease: "power1.out", immediateRender: false }, v.duration * 0.6);
  if (withCorners) tl.call(() => corners(el, true, cornerColour), [], v.duration * 0.6);
  return tl;
}

/* ---- print / generate ---------------------------------------------------- */

export type PrintOptions = {
  /** `line` typesets block children top to bottom; `word` and `char` stream text. */
  unit?: "line" | "word" | "char";
  pitch?: Pitch;
};

const SCRAMBLE = "0123456789abcdefghijklmnopqrstuvwxyz:_./#";

/**
 * A document types itself. Lines wipe in left to right with a clip mask, 18ms
 * apart and never longer than 2.4s in total; streamed text arrives word by word
 * at 28 per second, and machine lines character by character at 90 per second,
 * with unresolved characters shown from the identifier alphabet.
 */
export function print(gsap: Gsap, el: HTMLElement, { unit = "line", pitch = "base" }: PrintOptions = {}) {
  const v = VERBS.print;
  if (unit === "line") {
    const lines = Array.from(el.children) as HTMLElement[];
    const targets = lines.length ? lines : [el];
    if (reducedMotion()) return instant(gsap, () => gsap.set(targets, { clearProps: "clipPath" }), "print", pitch);
    const each = Math.min(v.perLine, v.cap / targets.length);
    return gsap
      .timeline({ paused: true })
      .call(() => emitVerb("print", pitch))
      .fromTo(
        targets,
        { clipPath: "inset(0 100% 0 0)" },
        { clipPath: "inset(0 0% 0 0)", duration: 0.12, stagger: each, ease: "power1.out", clearProps: "clipPath" },
      );
  }

  const text = el.dataset.text ?? el.textContent ?? "";
  el.dataset.text = text;
  const final = () => {
    el.textContent = text;
  };
  if (reducedMotion()) return instant(gsap, final, "print", pitch);

  const state = { t: 0 };
  if (unit === "word") {
    const words = text.split(/(\s+)/);
    const count = words.filter((w) => w.trim()).length;
    return gsap
      .timeline({ paused: true, onComplete: final })
      .call(() => emitVerb("print", pitch))
      .fromTo(
        state,
        { t: 0 },
        {
          t: 1,
          duration: count / 28,
          ease: "none",
          onUpdate: () => {
            const shown = Math.floor(state.t * count);
            let out = "";
            let seen = 0;
            for (const w of words) {
              if (w.trim()) {
                if (seen === shown) break;
                seen++;
              }
              out += w;
            }
            el.textContent = out.trimEnd();
          },
        },
      );
  }

  // unit === "char": resolved characters left to right, the rest scrambled.
  return gsap
    .timeline({ paused: true, onComplete: final })
    .call(() => emitVerb("print", pitch))
    .fromTo(
      state,
      { t: 0 },
      {
        t: 1,
        duration: text.length / 90,
        ease: "none",
        onUpdate: () => {
          const resolved = Math.floor(state.t * text.length);
          let out = text.slice(0, resolved);
          for (let i = resolved; i < Math.min(text.length, resolved + 3); i++) {
            out += text[i] === " " ? " " : SCRAMBLE[(i * 7 + Math.floor(state.t * 60)) % SCRAMBLE.length];
          }
          el.textContent = out;
        },
      },
    );
}

/* ---- dock / evaluate ---------------------------------------------------- */

export type DockOptions = {
  neighbours?: HTMLElement[];
  shake?: HTMLElement | null;
  flash?: HTMLElement | null;
  pitch?: Pitch;
  /** One thud per card, never per particle: members of a matrix dock silently. */
  sound?: boolean;
};

/** A member of a measured set arrives from depth, seats in its socket and shoves its seated neighbours 4px. */
export function dock(gsap: Gsap, el: HTMLElement, { neighbours = [], shake, flash, pitch = "base", sound = true }: DockOptions = {}) {
  const v = VERBS.dock;
  if (reducedMotion()) return sound ? instant(gsap, () => gsap.set(el, { clearProps: "y,scale,opacity" }), "dock", pitch) : gsap.timeline({ paused: true }).call(() => gsap.set(el, { clearProps: "y,scale,opacity" }));
  const tl = gsap
    .timeline({ paused: true })
    .call(() => {
      if (sound) emitVerb("dock", pitch);
    })
    .fromTo(el, { y: 24, scale: 0.92, opacity: 0 }, { y: -v.shove, scale: 1, opacity: 1, duration: v.duration * 0.8, ease: v.ease })
    .to(el, { y: 0, duration: v.duration * 0.2, ease: "power2.out" });
  const hit = v.duration * 0.8;
  tl.call(
    () => {
      const a = el.getBoundingClientRect();
      for (const n of neighbours) {
        if (n === el) continue;
        const b = n.getBoundingClientRect();
        const dx = Math.sign(b.left + b.width / 2 - (a.left + a.width / 2));
        const dy = Math.sign(b.top + b.height / 2 - (a.top + a.height / 2));
        gsap
          .timeline()
          .to(n, { x: dx * v.shove, y: dy * v.shove, duration: 0.08, ease: "power2.out" })
          .to(n, { x: 0, y: 0, duration: v.returnDuration, ease: "elastic.out(1, 0.45)" });
      }
    },
    [],
    hit,
  );
  if (shake) tl.fromTo(shake, { x: 0 }, { x: 2, duration: 0.03, repeat: 3, yoyo: true, ease: "none", immediateRender: false }, hit);
  if (flash) tl.fromTo(flash, { opacity: 1 }, { opacity: 0, duration: 0.16, immediateRender: false }, hit);
  return tl;
}

/* ---- dissolve / evict --------------------------------------------------- */

export type DissolveOptions = { toward?: Point; pitch?: Pitch };

/** The element breaks up and drifts toward the next chapter's cluster; exits run faster than entrances. */
export function dissolve(gsap: Gsap, el: HTMLElement, { toward, pitch = "base" }: DissolveOptions = {}) {
  const v = VERBS.dissolve;
  if (reducedMotion()) return instant(gsap, () => gsap.set(el, { opacity: 0 }), "dissolve", pitch);
  const box = el.getBoundingClientRect();
  const dx = toward ? (toward.x - (box.left + box.width / 2)) * 0.08 : 0;
  const dy = toward ? (toward.y - (box.top + box.height / 2)) * 0.08 : -16;
  return gsap
    .timeline({ paused: true })
    .call(() => emitVerb("dissolve", pitch))
    .to(el, { opacity: 0, x: dx, y: dy, filter: "blur(8px)", duration: v.duration, ease: v.ease });
}

/* ---- flood / act -------------------------------------------------------- */

export type FloodOptions = { origin: Point; pitch?: Pitch };

/**
 * The send point grows into the ground. `disc` is a full-viewport element whose
 * scale is driven from 0 to 1 around the origin; the caller decides when the
 * ground itself changes colour (at 98%, where the disc covers the screen).
 */
export function flood(gsap: Gsap, disc: HTMLElement, { origin, pitch = "base" }: FloodOptions) {
  const v = VERBS.flood;
  const place = () =>
    gsap.set(disc, {
      x: origin.x - window.innerWidth / 2,
      y: origin.y - window.innerHeight / 2,
    });
  if (reducedMotion()) return instant(gsap, () => gsap.set(disc, { x: 0, y: 0, scale: 1 }), "flood", pitch);
  return gsap
    .timeline({ paused: true })
    .call(() => {
      place();
      emitVerb("flood", pitch);
    })
    .fromTo(disc, { scale: 0 }, { scale: 1, duration: v.duration, ease: v.ease });
}

/* ---- registration corners ---------------------------------------------- */

const CORNER_SIZE = 6;

/**
 * Four L-ticks that mark the one element holding reading focus. Drawn with
 * inline styles so any element can carry them without a stylesheet change.
 * Orange by default; a chapter whose data already holds the viewport's orange
 * passes `var(--ink)` (plan G.2 R1).
 */
export function corners(el: HTMLElement, on: boolean, colour = "var(--signal)") {
  const existing = el.querySelectorAll<HTMLElement>(":scope > [data-corner]");
  if (!on) {
    existing.forEach((c) => c.remove());
    return;
  }
  if (existing.length) {
    existing.forEach((c) => (c.style.borderColor = colour));
    return;
  }
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  for (const at of ["tl", "tr", "bl", "br"] as const) {
    const c = document.createElement("span");
    c.dataset.corner = at;
    c.setAttribute("aria-hidden", "true");
    const top = at[0] === "t";
    const left = at[1] === "l";
    Object.assign(c.style, {
      position: "absolute",
      width: `${CORNER_SIZE}px`,
      height: `${CORNER_SIZE}px`,
      [top ? "top" : "bottom"]: "-1px",
      [left ? "left" : "right"]: "-1px",
      borderColor: colour,
      borderStyle: "solid",
      borderWidth: `${top ? 1 : 0}px ${left ? 0 : 1}px ${top ? 0 : 1}px ${left ? 1 : 0}px`,
      pointerEvents: "none",
      transition: reducedMotion() ? "none" : "opacity 180ms linear",
    });
    el.appendChild(c);
  }
}

/* ---- agent aliases (plan F.9) ------------------------------------------- */

export const retrieve = condense;
export const persist = settle;
export const observe = pulse;
export const verify = stamp;
export const generate = print;
export const evaluate = dock;
export const evict = dissolve;
export const act = flood;
