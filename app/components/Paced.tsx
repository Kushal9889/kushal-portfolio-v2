"use client";

import { useEffect, useRef, useState } from "react";

const calm = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A streamed answer revealed at reading pace.
 *
 * Providers send tokens in bursts: forty words, a pause, ten more. Painted as
 * they arrive, that reads as a stall, then a jump. While the stream is live the
 * text is revealed at a steady 45 characters a second (faster when it falls
 * far behind, so it never lags the stream by more than about two seconds);
 * once the stream ends the text catches up and the timer stops.
 *
 * `once` is for an answer that already exists in full (the hero's, which
 * arrives as one response): it types from the first character at the same
 * pace, then stops. Under reduced motion every mode shows the whole text at
 * once; before this, a live answer under reduced motion stayed empty.
 */
export default function Paced({
  text,
  live,
  once = false,
  marks,
  markClass,
}: {
  text: string;
  live: boolean;
  once?: boolean;
  /** Substrings to mark once the text has settled (claims ground.ts could not find). */
  marks?: string[];
  markClass?: string;
}) {
  // Starts caught up, so answers already on screen never replay.
  const [shown, setShown] = useState(() => ((live || once) && !calm() ? 0 : text.length));
  const target = useRef(text.length);
  const isLive = useRef(live);
  const timer = useRef(0);
  useEffect(() => {
    target.current = text.length;
    isLive.current = live;
  }, [text, live]);

  useEffect(() => {
    if (!live && !once) return;
    if (calm()) {
      setShown(target.current);
      return;
    }
    // Ticks until the stream has ended and the text has caught up with it.
    const id = window.setInterval(() => {
      setShown((n) => {
        const behind = target.current - n;
        if (behind <= 0) {
          if (!isLive.current) window.clearInterval(id);
          return n;
        }
        return Math.min(target.current, n + Math.max(2, Math.round(Math.max(45, behind / 2) / 30)));
      });
    }, 33);
    timer.current = id;
  }, [live, once]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  // The reader of a screen reader gets the whole text; the typing is visual.
  // Not live means nothing more is coming: show it all. Mounted while not live
  // (no timer running), it froze on the first token ("The") for good.
  const settled = (!live && !once) || shown >= text.length;
  if (!settled) return <>{text.slice(0, shown)}</>;
  if (!marks?.length) return <>{text}</>;
  const escaped = marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(?<![\\w])(${escaped.join("|")})(?![\\w])`));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className={markClass} title="Not found in his facts">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
