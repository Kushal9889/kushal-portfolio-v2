"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { chipOf, getRequest, subscribe, type RequestState } from "./request";
import styles from "./FilmTransit.module.css";

export type LiveKey = "sources" | "tokensIn" | "tokensOut" | "blocks";
export type CardProps = {
  stage: number;
  stages: number;
  title: string;
  line: string;
  /** T3's three acts; the one on screen follows html[data-film-act]. */
  acts?: { title: string; line: string }[];
  /** Fixed rows: this site's measured or coded facts, then typical sizes (content/film.json). */
  rows: { label: string; text: string; tag: string; note?: string }[];
  /** The line as a small drawing (FilmSketch.tsx). */
  sketch?: React.ReactNode;
  /** Values from the request the orange light is drawing. */
  live: { key: LiveKey; label: string }[];
};

const NONE: RequestState = { provenance: { kind: "none" }, sentAt: -1, question: null };

/** A live value, or undefined while no answer has settled. KV blocks hold 16 tokens each, at most 40 drawn. */
function valueOf(r: RequestState, key: LiveKey) {
  if (key === "blocks") return r.tokens ? Math.min(40, Math.ceil(r.tokens / 16)) : undefined;
  return r[key];
}

/**
 * The transit window's card (plan C5.3): what the film is showing, in one
 * plain line, and the numbers behind it, each with where it comes from.
 * Arrives when its window is a third on screen and leaves at 0.6x the speed
 * it came (C5.7); the ceremony is CSS, keyed on data-state.
 */
export default function FilmCard({ stage, stages, title, line, acts, rows: fixed, live, sketch }: CardProps) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "in" | "out">("idle");
  const request = useSyncExternalStore(subscribe, getRequest, () => NONE);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const io = new IntersectionObserver(
      ([e]) => setState((s) => (e.isIntersecting ? "in" : s === "idle" ? "idle" : "out")),
      // In while the window covers the band from 50% to 67% down the screen:
      // it arrives once the window is a third up, and leaves once the window's
      // end, which carries the card, passes the middle.
      { rootMargin: "-50% 0px -33% 0px" },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  // A running request still shows the last settled numbers under their own
  // provenance, so the tag never claims a run that has not finished.
  const settled = request.provenance.kind !== "none" && request.provenance.kind !== "running";
  const tag = settled ? (chipOf(request.provenance)?.text.split(" · ")[0] ?? "") : "";
  const rows = [
    ...live.flatMap(({ key, label }) => {
      const v = settled ? valueOf(request, key) : undefined;
      return typeof v === "number" ? [{ label, value: String(v), text: v.toLocaleString("en-US"), tag, note: undefined as string | undefined }] : [];
    }),
    ...fixed.map((s) => ({ label: s.label, value: s.text, text: s.text, tag: s.tag, note: s.note })),
  ];

  return (
    <aside ref={ref} className={styles.card} data-state={state} aria-label={`Film stage ${stage} of ${stages}: ${title}`}>
      <div className={styles.head}>
        {/* Where this window sits on the route: one tick per transit, this one filled. */}
        <ol className={styles.ticks} aria-label={`Stage ${stage} of ${stages}`}>
          {Array.from({ length: stages }, (_, i) => (
            <li key={i} data-at={i + 1 < stage ? "past" : i + 1 === stage ? "here" : "ahead"} />
          ))}
        </ol>
        <span className={styles.chip}>Illustration</span>
      </div>
      <div className={styles.body}>
        {acts ? (
          acts.map((a, k) => (
            <div key={a.title} className={styles.act} data-act={k}>
              <p className={styles.title}>{a.title}</p>
              <p className={styles.line}>{a.line}</p>
            </div>
          ))
        ) : (
          <div>
            <p className={styles.title}>{title}</p>
            <p className={styles.line}>{line}</p>
          </div>
        )}
        {sketch}
      </div>
      {rows.length > 0 && (
        <dl className={styles.values}>
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>
                <data value={r.value}>{r.text}</data>
                <span className={styles.tag} title={r.note}>{r.tag}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
