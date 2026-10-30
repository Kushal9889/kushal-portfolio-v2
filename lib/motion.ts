"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "./verbs";

/**
 * Motion loads after the page has painted, never before it.
 *
 * The largest element on this page is text in the hero. If the bundle that
 * animates it also has to arrive before it can be read, the animation has cost
 * the thing it was decorating. So nothing here is imported statically: the
 * modules are fetched during the first idle period, which is after first paint
 * and usually before the visitor has scrolled far enough to need them.
 *
 * The consequence is a contract every caller has to honour. Elements are painted
 * and readable from the HTML, and setup functions move things that are already
 * visible: transforms, masks, clip paths, colour. Nothing is opacity zero
 * waiting for a script. A crawler, a blocked script, a failed chunk, or a slow
 * connection costs the visitor the motion and never the content.
 *
 * Under prefers-reduced-motion nothing loads at all. That is not a smaller
 * animation, it is no request.
 */

async function load() {
  const [core, scroll, split, flip] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
    import("gsap/SplitText"),
    import("gsap/Flip"),
  ]);

  const { gsap } = core;
  gsap.registerPlugin(scroll.ScrollTrigger, split.SplitText, flip.Flip);

  // Every duration and curve in this file resolves to the same two values the
  // stylesheet uses, so a tween and a CSS transition on the same element cannot
  // disagree about how fast the page moves.
  gsap.defaults({ ease: "power3.out", duration: 0.55 });

  // Nothing is handed out until the webfonts have laid the page out.
  //
  // Trigger positions are measured in pixels, and before the real faces land the
  // document is shorter than it will be. Every element below the fold therefore
  // measures as already past its start line, so ScrollTrigger reports it as
  // entering the instant the trigger is built and the entrance is spent on a
  // frame nobody is looking at. Refreshing afterwards does not undo that; the
  // animation has already run off-screen.
  //
  // Awaiting here rather than in each component means no consumer can forget it.
  await document.fonts?.ready;
  scroll.ScrollTrigger.refresh();

  // Re-measure whenever the document changes height, not only at startup.
  //
  // Trigger start and end positions are pixel offsets captured when the trigger
  // is built. The agent sits above the pinned section and grows every time it
  // answers: measured, one question added 251px and pushed the pinned diff down
  // 252px, while nothing re-measured. Every start and end below the agent was
  // then wrong by that amount, which is why the pinned card appeared to repeat
  // or jump while scrolling after asking something.
  //
  // A ResizeObserver on the body catches all of it: streaming answers, a
  // disclosure opening, a font swapping in, an image settling. Debounced to the
  // next frame because a streaming answer resizes on nearly every token, and
  // refresh() is a full layout pass.
  //
  // Suspended while an answer is streaming. A refresh is a full layout pass
  // over every trigger on the page, the observer fires on nearly every token,
  // and the result was a frame-by-frame relayout for the whole length of an
  // answer -- which is what made pressing a suggested question feel like the
  // page had seized rather than started. Nothing below the agent can be read
  // during those few seconds anyway, because the reader is watching the answer
  // arrive, so the measurements are simply deferred: `data-streaming` is set by
  // the agent while a request is in flight and cleared when it settles, and the
  // one refresh that matters runs on that clearing edge.
  //
  // Trailing by 200 ms, not one frame: a disclosure opening resizes the body on
  // every frame, and one refresh per frame cost 181-294 layouts per open at
  // 1440x900 2x. Waiting for it to settle measured 56-84.
  let queued: ReturnType<typeof setTimeout> | undefined;
  const remeasure = () => {
    clearTimeout(queued);
    queued = setTimeout(() => {
      if (document.documentElement.dataset.streaming === "yes") return;
      scroll.ScrollTrigger.refresh();
    }, 200);
  };
  new ResizeObserver(remeasure).observe(document.body);

  // The deferred re-measure, run once the answer has settled.
  new MutationObserver(() => {
    if (document.documentElement.dataset.streaming !== "yes") remeasure();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-streaming"],
  });

  // Lets the stylesheet stand down: the CSS scroll timelines are the floor for
  // visitors without this bundle, and running both would animate twice.
  document.documentElement.dataset.motion = "js";

  return {
    gsap,
    ScrollTrigger: scroll.ScrollTrigger,
    SplitText: split.SplitText,
    Flip: flip.Flip,
  };
}

type Kit = Awaited<ReturnType<typeof load>>;

let pending: ReturnType<typeof load> | null = null;

/** One fetch per page, shared by every component that asks. */
function motionKit() {
  return (pending ??= load());
}


function idle(fn: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    // The timeout is the ceiling, not the target. A busy main thread should
    // delay motion, but not indefinitely.
    return window.requestIdleCallback(fn, { timeout: 1200 });
  }
  return window.setTimeout(fn, 200);
}

function cancelIdle(id: number) {
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
  else window.clearTimeout(id);
}

/**
 * Attach a scoped animation to an element.
 *
 * `setup` runs inside a gsap context rooted at the returned ref, so every tween,
 * trigger and split it creates is reverted together when the component unmounts.
 * The callback is read from a ref rather than a dependency, because an inline
 * arrow function is a new value on every render and would otherwise tear the
 * whole animation down and rebuild it on each one.
 */
export function useMotion<T extends HTMLElement = HTMLDivElement>(
  setup: (kit: Kit, root: T) => void,
) {
  const ref = useRef<T>(null);
  const latest = useRef(setup);
  latest.current = setup;

  useEffect(() => {
    const root = ref.current;
    // The page's own toggle wins over the OS setting in both directions, so a
    // reader who asks for motion here gets the bundle even when their system
    // asks for less of it.
    if (!root || reducedMotion()) return;

    let live = true;
    let ctx: { revert: () => void } | undefined;
    let task = 0;

    const id = idle(() => {
      motionKit().then((kit) => {
        // Every component waiting on the kit resumes in the same microtask
        // checkpoint, so a page of pinned chapters would build all its triggers
        // in one long main-thread task. Each one gets its own task instead, still
        // in mount order, which is document order.
        task = window.setTimeout(() => {
          // React remounts effects in development, and an idle callback can land
          // after the element has already left the document.
          if (!live || !root.isConnected) return;
          ctx = kit.gsap.context(() => latest.current(kit, root), root);
        }, 0);
      });
    });

    return () => {
      live = false;
      cancelIdle(id);
      window.clearTimeout(task);
      ctx?.revert();
    };
  }, []);

  return ref;
}
