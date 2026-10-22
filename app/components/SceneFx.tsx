"use client";

import { useEffect } from "react";
import { reducedMotion } from "@/lib/verbs";

/**
 * Pointer-driven scene effects for /classic, written as CSS variables so React
 * never re-renders on pointer movement (styles in app/scenes.css):
 * - credential plates tilt toward the pointer (--rx, --ry)
 * - the research console carries a lens that follows it (--mx, --my, --lens)
 * Touch and reduced motion get the static plates and no lens.
 */
export default function SceneFx() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (reducedMotion()) return;

    const off: (() => void)[] = [];
    let frame = 0;
    const later = (fn: () => void) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fn);
    };
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn);
      off.push(() => el.removeEventListener(type, fn));
    };

    for (const plate of document.querySelectorAll<HTMLElement>("#proof [data-issuer]")) {
      const face = plate.querySelector<HTMLElement>(":scope > button");
      if (!face) continue;
      on(plate, "pointermove", (e) => {
        const r = plate.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        later(() => {
          face.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
          face.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
        });
      });
      on(plate, "pointerleave", () =>
        later(() => {
          face.style.removeProperty("--rx");
          face.style.removeProperty("--ry");
        }),
      );
    }

    // Delegated from the document: the research console renders after this
    // effect runs, so a listener bound to it at mount found nothing.
    let lit: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      const lens = (e.target as Element | null)?.closest<HTMLElement>('#research [data-surface="console"]') ?? null;
      if (lit && lit !== lens) {
        const was = lit;
        later(() => was.style.setProperty("--lens", "0"));
      }
      lit = lens;
      if (!lens) return;
      const r = lens.getBoundingClientRect();
      later(() => {
        lens.style.setProperty("--mx", `${e.clientX - r.left}px`);
        lens.style.setProperty("--my", `${e.clientY - r.top}px`);
        lens.style.setProperty("--lens", "1");
      });
    };
    document.addEventListener("pointermove", move, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", move);
      for (const fn of off) fn();
    };
  }, []);

  return null;
}
