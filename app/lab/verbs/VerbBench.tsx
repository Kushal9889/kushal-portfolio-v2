"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  condense,
  settle,
  pulse,
  stamp,
  print,
  dock,
  dissolve,
  flood,
  corners,
  VERBS,
  VERB_EVENT,
  type VerbDetail,
  type Timeline,
} from "@/lib/verbs";
import { segmentsFor } from "@/lib/numbers";
import styles from "./bench.module.css";

type Props = {
  condense: { title: string };
  settle: { hours: string; hoursLabel: string; schema: string; schemaBefore: string; schemaLabel: string; runs: string };
  pulse: { available: string };
  stamp: { name: string; issuer: string; earned: number; total: number };
  print: { lines: string[]; machine: string; sentence: string };
  dock: { cases: { name: string; runs: number; passes: number }[] };
};

const ALIAS: Record<keyof typeof VERBS, string> = {
  condense: "retrieve",
  settle: "persist",
  pulse: "observe",
  stamp: "verify",
  print: "generate",
  dock: "evaluate",
  dissolve: "evict",
  flood: "act",
};

/** Seven-segment geometry in a 12 x 20 box: segment, x, y, width, height. */
const SEG_RECTS: [string, number, number, number, number][] = [
  ["a", 2, 0, 8, 2],
  ["b", 10, 2, 2, 7],
  ["c", 10, 11, 2, 7],
  ["d", 2, 18, 8, 2],
  ["e", 0, 11, 2, 7],
  ["f", 0, 2, 2, 7],
  ["g", 2, 9, 8, 2],
];

function monthsUntil(available: string) {
  const m = available.match(/^([A-Z][a-z]+) (\d{4})/);
  if (!m) return null;
  const target = new Date(`${m[1]} 1, ${m[2]}`);
  const now = new Date();
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return months > 0 ? months : null;
}

export default function VerbBench(props: Props) {
  const [reduced, setReduced] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const flashRef = useRef<HTMLDivElement>(null);
  const refs = {
    condense: useRef<HTMLHeadingElement>(null),
    hours: useRef<HTMLSpanElement>(null),
    schema: useRef<HTMLSpanElement>(null),
    ghost: useRef<HTMLSpanElement>(null),
    runs: useRef<HTMLSpanElement>(null),
    pulse: useRef<HTMLSpanElement>(null),
    pulseTime: useRef<HTMLTimeElement>(null),
    plate: useRef<HTMLElement>(null),
    lines: useRef<HTMLPreElement>(null),
    machine: useRef<HTMLParagraphElement>(null),
    sentence: useRef<HTMLParagraphElement>(null),
    grid: useRef<HTMLDivElement>(null),
    leaving: useRef<HTMLParagraphElement>(null),
    disc: useRef<HTMLDivElement>(null),
    send: useRef<HTMLButtonElement>(null),
  };

  // The bench's reduced toggle is the page motion preference the stage uses.
  useEffect(() => {
    document.documentElement.dataset.motionPref = reduced ? "reduced" : "allowed";
    return () => {
      delete document.documentElement.dataset.motionPref;
    };
  }, [reduced]);

  // Every verb announces itself; the log proves the event fires for the sound engine.
  useEffect(() => {
    const onVerb = (e: Event) => {
      const { verb, pitch } = (e as CustomEvent<VerbDetail>).detail;
      setLog((l) => [`${verb} (${pitch})`, ...l].slice(0, 8));
    };
    window.addEventListener(VERB_EVENT, onVerb);
    return () => window.removeEventListener(VERB_EVENT, onVerb);
  }, []);

  const run = (make: () => Timeline | Timeline[]) => {
    const tls = [make()].flat();
    tls.forEach((tl) => tl.restart());
  };

  const months = monthsUntil(props.pulse.available);

  const play = {
    condense: () => {
      const el = refs.condense.current!;
      const box = el.getBoundingClientRect();
      run(() => condense(gsap, el, { origin: { x: box.left - 120, y: box.top + box.height / 2 } }));
    },
    settle: () =>
      run(() => [
        settle(gsap, refs.hours.current!, props.settle.hours, { pitch: "minus3" }),
        settle(gsap, refs.schema.current!, props.settle.schema, { ghost: refs.ghost.current, ghostText: props.settle.schemaBefore }),
        settle(gsap, refs.runs.current!, props.settle.runs),
      ]),
    pulse: () =>
      run(() =>
        pulse(gsap, refs.pulse.current!, months === null ? "" : `available in ${months} ${months === 1 ? "month" : "months"}`, {
          timeEl: refs.pulseTime.current,
        }),
      ),
    stamp: () => {
      const plate = refs.plate.current!;
      corners(plate, false);
      const segs = Array.from(plate.querySelectorAll<HTMLElement>("[data-earned]"));
      run(() => {
        const tl = stamp(gsap, plate, { flash: flashRef.current });
        segs.forEach((s, i) => tl.add(stamp(gsap, s, { scale: 0.6, corners: false }).restart(), VERBS.stamp.duration + i * 0.06));
        return tl;
      });
    },
    print: () =>
      run(() => [
        print(gsap, refs.lines.current!, { unit: "line" }),
        print(gsap, refs.machine.current!, { unit: "char" }),
        print(gsap, refs.sentence.current!, { unit: "word" }),
      ]),
    dock: () => {
      const grid = refs.grid.current!;
      const cols = Array.from(grid.children) as HTMLElement[];
      run(() => {
        const tl = gsap.timeline({ paused: true });
        cols.forEach((c, i) => tl.add(dock(gsap, c, { neighbours: cols.slice(0, i), sound: i === 0 }).restart(), i * 0.012));
        return tl;
      });
    },
    dissolve: () => {
      const el = refs.leaving.current!;
      gsap.set(el, { clearProps: "all" });
      const tl = dissolve(gsap, el, { toward: { x: window.innerWidth, y: 0 } });
      tl.eventCallback("onComplete", () => gsap.delayedCall(0.6, () => gsap.set(el, { clearProps: "all" })));
      tl.restart();
    },
    flood: () => {
      const disc = refs.disc.current!;
      const send = refs.send.current!.getBoundingClientRect();
      const tl = flood(gsap, disc, { origin: { x: send.left + send.width / 2, y: send.top + send.height / 2 } });
      tl.eventCallback("onComplete", () => gsap.delayedCall(0.8, () => gsap.set(disc, { scale: 0 })));
      tl.restart();
    },
  };

  // A plain function, not a component: a component defined in render would
  // remount its children on every log update and orphan running tweens.
  const row = (verb: keyof typeof VERBS, children: React.ReactNode) => (
    <section className={styles.row} data-verb={verb}>
      <header className={styles.rowHead}>
        <h2>
          {verb} <code>{ALIAS[verb]}</code>
        </h2>
        <p>{VERBS[verb].meaning}</p>
        <button type="button" onClick={play[verb]} data-play={verb}>
          Play
        </button>
      </header>
      <div className={styles.stage}>{children}</div>
    </section>
  );

  return (
    <main className={styles.bench} data-stage>
      <div ref={flashRef} className={styles.flash} aria-hidden="true" />
      <header className={styles.top}>
        <h1>Motion grammar bench</h1>
        <label>
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} data-reduced-toggle />
          Reduced motion
        </label>
        <ol className={styles.log} aria-label="Verb events" data-log>
          {log.map((l, i) => (
            <li key={`${l}${i}`}>{l}</li>
          ))}
        </ol>
      </header>

      {row("condense", <>
        <h3 ref={refs.condense} className={styles.title}>
          {props.condense.title}
        </h3>
      </>)}

      {row("settle", <>
        <p className={styles.figures}>
          <span className={styles.big} ref={refs.hours} data-settle-target={props.settle.hours}>
            {props.settle.hours}
          </span>
          <span className={styles.label}>{props.settle.hoursLabel}</span>
        </p>
        <p className={styles.figures}>
          <span className={styles.ghost} ref={refs.ghost}>
            {props.settle.schemaBefore}
          </span>
          <span className={styles.big} ref={refs.schema} data-settle-target={props.settle.schema}>
            {props.settle.schema}
          </span>
          <span className={styles.label}>{props.settle.schemaLabel}</span>
        </p>
        <p className={styles.figures}>
          <span className={styles.big} ref={refs.runs} data-settle-target={props.settle.runs}>
            {props.settle.runs}
          </span>
          <span className={styles.label}>runs passing</span>
        </p>
      </>)}

      {row("pulse", <>
        <p className={styles.pulse}>
          <span ref={refs.pulse} className={styles.sweep}>
            {months === null ? "" : `available in ${months} ${months === 1 ? "month" : "months"}`}
          </span>{" "}
          <time ref={refs.pulseTime} className={styles.time} />
        </p>
      </>)}

      {row("stamp", <>
        <article ref={refs.plate} className={styles.plate}>
          <p className={styles.issuer}>{props.stamp.issuer}</p>
          <h3>{props.stamp.name}</h3>
          <p className={styles.segments} aria-label={`${props.stamp.earned} of ${props.stamp.total} courses earned`}>
            {Array.from({ length: props.stamp.total }, (_, i) => (
              <span key={i} data-earned={i < props.stamp.earned ? "" : undefined} />
            ))}
          </p>
          <p className={styles.seven} aria-hidden="true">
            {`${props.stamp.earned}${props.stamp.total}`.split("").map((d, i) => (
              <svg key={i} viewBox="0 0 12 20" data-segments={segmentsFor(d)}>
                {SEG_RECTS.map(([s, x, y, w, h]) => (
                  <rect key={s} x={x} y={y} width={w} height={h} data-on={segmentsFor(d).includes(s) ? "" : undefined} />
                ))}
              </svg>
            ))}
          </p>
        </article>
      </>)}

      {row("print", <>
        <pre ref={refs.lines} className={styles.code}>
          {props.print.lines.map((l, i) => (
            <code key={i}>{l || " "}</code>
          ))}
        </pre>
        <p ref={refs.machine} className={styles.machine}>
          {props.print.machine}
        </p>
        <p ref={refs.sentence} className={styles.sentence}>
          {props.print.sentence}
        </p>
      </>)}

      {row("dock", <>
        <div ref={refs.grid} className={styles.matrix} aria-label="Eval runs by case">
          {props.dock.cases.map((c) => (
            <span key={c.name} title={c.name}>
              {Array.from({ length: c.runs }, (_, r) => (
                <i key={r} data-miss={r >= c.passes ? "" : undefined} />
              ))}
            </span>
          ))}
        </div>
      </>)}

      {row("dissolve", <>
        <p ref={refs.leaving} className={styles.sentence}>
          {props.condense.title}
        </p>
      </>)}

      {row("flood", <>
        <div className={styles.floodBox}>
          <div ref={refs.disc} className={styles.disc} aria-hidden="true" />
          <button ref={refs.send} type="button" className={styles.send}>
            Email him
          </button>
        </div>
      </>)}
    </main>
  );
}
