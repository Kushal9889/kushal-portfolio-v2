"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/verbs";

/**
 * Drifts a horizontally scrolling row to and fro so its overflow is visible
 * without a swipe. Pauses on any touch, hover or focus and resumes after three
 * seconds; never runs under reduced motion or while the row is off screen.
 * Writes scrollLeft directly, not React state, so it costs no renders.
 */
export default function DockDrift({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const events = ["pointerdown", "pointerenter", "focusin", "touchstart", "wheel"];
    let raf = 0;
    let dir = 1;
    let held = false;
    let visible = false;
    let resume = 0;
    // The browser snaps scrollLeft to whole pixels, so the sub-pixel position is
    // kept here and written out; reading it back would stall at 0.35 a frame.
    let pos = el.scrollLeft;
    const hold = () => {
      held = true;
      window.clearTimeout(resume);
      resume = window.setTimeout(() => {
        pos = el.scrollLeft;
        held = false;
      }, 3000);
    };
    const step = () => {
      raf = requestAnimationFrame(step);
      if (held || !visible) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      pos = Math.min(max, Math.max(0, pos + dir * 0.35));
      el.scrollLeft = pos;
      if (pos >= max) dir = -1;
      if (pos <= 0) dir = 1;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    for (const ev of events) el.addEventListener(ev, hold, { passive: true });
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resume);
      io.disconnect();
      for (const ev of events) el.removeEventListener(ev, hold);
    };
  }, []);
  return (
    <ul ref={ref} className={className} aria-label={label}>
      {children}
    </ul>
  );
}
