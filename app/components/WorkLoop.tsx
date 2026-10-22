"use client";

import { useEffect, useRef } from "react";

/**
 * The racks at work, behind an instrument. Plays while `on` and on screen,
 * never under reduced motion; the source loads only when it first has to play,
 * and the phone gets the portrait crop.
 */
export default function WorkLoop({ on, className }: { on: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sync = () => {
      if (on && visible.current) {
        if (!v.src) v.src = window.innerWidth < 768 ? "/film/agent/loop-p.mp4" : "/film/agent/loop.mp4";
        void v.play().catch(() => {});
      } else v.pause();
    };
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      sync();
    });
    io.observe(v);
    sync();
    return () => io.disconnect();
  }, [on]);

  return <video ref={ref} className={className} data-on={on || undefined} muted loop playsInline preload="none" aria-hidden="true" />;
}
