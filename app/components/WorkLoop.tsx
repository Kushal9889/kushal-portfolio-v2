"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/verbs";

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
    if (!v || reducedMotion()) return;
    const sync = () => {
      if (on && visible.current) {
        if (!v.src) {
          const file = window.innerWidth < 768 ? "/film/agent/loop-p.mp4" : "/film/agent/loop.mp4";
          // The media origin first, the app host if that origin ever fails.
          v.onerror = () => {
            v.onerror = null;
            v.src = file;
            if (on && visible.current) void v.play().catch(() => {});
          };
          v.src = `${(process.env.NEXT_PUBLIC_FILM_ORIGIN ?? "").replace(/\/$/, "")}${file}`;
        }
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
