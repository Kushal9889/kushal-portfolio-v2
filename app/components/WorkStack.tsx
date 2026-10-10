"use client";

import { useEffect } from "react";

/**
 * Reveals each role's identity in the Work rail as the reader reaches it.
 *
 * The rail is one sticky element holding all three identities in normal flow
 * (see .roleRail in page.module.css), so the stack arrives and leaves as a
 * single object. That also means every identity would be on screen from the
 * first moment, and the accumulation is the point: a reader scrolling Work
 * should watch the list grow from one title to three.
 *
 * So the reveal is driven from where each role's description sits. An identity
 * opens once its own content has risen to the line and closes again on the way
 * back up, so the rail always states exactly the roles the reader has reached.
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

    const apply = () => {
      /*
       * An identity opens when its description comes into sight, not when it
       * reaches the pin line. Measured against the pin line the third title
       * arrived where the rail was already releasing, so the complete stack
       * existed for a few dozen pixels. A third of the viewport: at 0.7 the
       * second role opened before the first paragraph had been read, so the
       * list was two deep on arrival and the growth never happened on screen.
       */
      const line = window.innerHeight * 0.35;
      bodies.forEach((body, i) => {
        const reached = body.getBoundingClientRect().top <= line;
        heads[i].dataset.revealed = reached ? "yes" : "no";
      });

      /*
       * Which role the reader is inside, marked in the rail. Once three are
       * stacked, nothing said which one the metrics beside them belonged to;
       * the reader had to infer it from vertical position, which the sticky
       * stack has deliberately broken. Same threshold as the reveal, not a
       * second line: at 0.45 a role went active before it was revealed, so
       * the rail highlighted a title it was still hiding.
       */
      const deepest = heads.reduce(
        (found, head, i) => (head.dataset.revealed === "yes" ? i : found),
        -1,
      );
      heads.forEach((head, i) => {
        head.dataset.active = i === deepest ? "yes" : "no";
      });
    };

    /*
     * An observer, not a scroll listener.
     *
     * A scroll handler runs on every frame the page moves and reads layout in
     * all of them, which on this document is a few thousand forced reflows to
     * answer a question whose answer changes six times. The observation box is
     * the top 35% of the viewport -- the same line the maths above uses -- so
     * the callback fires exactly when a description crosses it, in either
     * direction, and the rects are only read then.
     */
    const io = new IntersectionObserver(apply, { rootMargin: "0px 0px -65% 0px" });
    for (const body of bodies) io.observe(body);
    window.addEventListener("resize", apply);
    apply();

    return () => {
      io.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  return null;
}
