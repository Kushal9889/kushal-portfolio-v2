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
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let face: HTMLElement | null = null;
    let lit: HTMLElement | null = null;
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      face?.style.removeProperty("--rx");
      face?.style.removeProperty("--ry");
      for (const name of ["--mx", "--my", "--lens"]) lit?.style.removeProperty(name);
      face = null;
      lit = null;
    };
    const later = (fn: () => void) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fn);
    };
    // Delegation also covers panels that arrive after hydration.
    const move = (e: PointerEvent) => {
      if (!pointer.matches || reducedMotion() || e.pointerType === "touch") return reset();
      const target = e.target instanceof Element ? e.target : null;
      const plate = target?.closest<HTMLElement>("#proof [data-issuer]");
      const nextFace = plate?.querySelector<HTMLElement>(":scope > button") ?? null;
      const lens = target?.closest<HTMLElement>('#research [data-surface="console"]') ?? null;
      if (face !== nextFace || lit !== lens) reset();
      face = nextFace;
      lit = lens;
      const plateBox = plate?.getBoundingClientRect();
      const lensBox = lens?.getBoundingClientRect();
      later(() => {
        if (nextFace && plateBox?.width && plateBox.height) {
          const x = Math.max(-0.5, Math.min(0.5, (e.clientX - plateBox.left) / plateBox.width - 0.5));
          const y = Math.max(-0.5, Math.min(0.5, (e.clientY - plateBox.top) / plateBox.height - 0.5));
          nextFace.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
          nextFace.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
        }
        if (lens && lensBox) {
          lens.style.setProperty("--mx", `${e.clientX - lensBox.left}px`);
          lens.style.setProperty("--my", `${e.clientY - lensBox.top}px`);
          lens.style.setProperty("--lens", "1");
        }
      });
    };
    const leave = (e: PointerEvent) => { if (!e.relatedTarget) reset(); };
    const preference = new MutationObserver(reset);
    preference.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion-pref"] });
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave);
    window.addEventListener("blur", reset);
    pointer.addEventListener("change", reset);
    motion.addEventListener("change", reset);

    return () => {
      reset();
      preference.disconnect();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      window.removeEventListener("blur", reset);
      pointer.removeEventListener("change", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);

  return null;
}
