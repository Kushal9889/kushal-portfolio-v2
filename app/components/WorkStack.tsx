"use client";

import { useEffect } from "react";

/**
 * Reveals each role's identity in the Work rail as the reader reaches it.
 *
 * The rail itself is one sticky element holding all three identities in
 * normal flow (see .roleRail in page.module.css for why it is one element
 * and not three). That makes the stack arrive and leave as a single object,
 * but it also means every identity would be on screen from the first moment,
 * and the accumulation is the whole point: a reader scrolling Work should
 * watch the list grow from one title to three.
 *
 * So the reveal is driven from where each role's description actually sits.
 * An identity opens once its own content has risen to the sticky line, and
 * closes again on the way back up, so the rail always states exactly the
 * roles the reader has reached -- scrolling backwards is not a special case
 * that leaves a stale stack behind.
 */
export default function WorkStack() {
  useEffect(() => {
    const heads = Array.from(
      document.querySelectorAll<HTMLElement>("#work [data-role-head]"),
    );
    const bodies = Array.from(
      document.querySelectorAll<HTMLElement>("#work [data-role-content]"),
    );
    if (heads.length === 0 || heads.length !== bodies.length) return;

    let queued = 0;

    const apply = () => {
      /*
       * An identity opens when its description comes into sight, not when it
       * reaches the pin line.
       *
       * Measured against the pin line, the third title arrived at almost the
       * same scroll position the rail began to release at, so the complete
       * stack of three existed for a few dozen pixels and the reader never
       * really saw it. Growaza is the shortest role on the page, which is
       * what makes the last one the tightest case. Opening on sight gives
       * every title a run of screen where the full list is pinned and
       * readable.
       *
       * A third of the viewport, measured: at 0.7 the second role opened
       * before the reader had finished the first paragraph of the first, so
       * the list was already two deep on arrival and the growth it exists to
       * show never happened on screen.
       */
      const line = window.innerHeight * 0.35;
      bodies.forEach((body, i) => {
        const reached = body.getBoundingClientRect().top <= line;
        heads[i].dataset.revealed = reached ? "yes" : "no";
      });

      /*
       * Which role the reader is actually inside, marked in the rail.
       *
       * Revealing the titles was only half the problem. Once three are
       * stacked, nothing said which one the metrics and the stack beside them
       * belonged to -- "14 tools on one LangGraph agent" sat level with a list
       * of three jobs and the reader had to infer the pairing from vertical
       * position, which the sticky stack has deliberately broken. The role
       * most recently reached is the one being read, so that is the one held
       * at full strength while the others step back.
       *
       * Deliberately the same threshold that drives the reveal above, rather
       * than a second line of its own. Measured with a separate one at 0.45:
       * the descriptions are short now that they open collapsed, so a role
       * crossed the active line before it crossed the reveal line and the rail
       * highlighted a title it was still hiding.
       */
      const deepest = heads.reduce(
        (found, head, i) => (head.dataset.revealed === "yes" ? i : found),
        -1,
      );
      heads.forEach((head, i) => {
        head.dataset.active = i === deepest ? "yes" : "no";
      });
    };

    const onScroll = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(queued);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return null;
}
