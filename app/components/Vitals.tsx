"use client";

import { useEffect, useState } from "react";
import Panel from "./Panel";
import styles from "./Vitals.module.css";

type Key = "LCP" | "CLS" | "INP";
/** Core Web Vitals thresholds (web.dev): good at or under the first, poor above the second. */
const LIMITS: Record<Key, [number, number]> = { LCP: [2500, 4000], CLS: [0.1, 0.25], INP: [200, 500] };
const LABEL: Record<Key, string> = { LCP: "Largest paint", CLS: "Layout shift", INP: "Slowest interaction" };

const grade = (k: Key, v: number) => (v <= LIMITS[k][0] ? "live" : v <= LIMITS[k][1] ? "warn" : "fail");
const text = (k: Key, v: number) => (k === "CLS" ? v.toFixed(3) : `${Math.round(v)} ms`);

/**
 * This page, measured in the reader's own browser as they read it: the three
 * Core Web Vitals from the browser's PerformanceObserver, no library. Colour
 * is the grade against the published thresholds; a value appears only once the
 * browser has reported it (interaction delay needs an interaction).
 */
export default function Vitals() {
  const [v, setV] = useState<Partial<Record<Key, number>>>({});

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const obs: PerformanceObserver[] = [];
    const watch = (type: string, on: (list: PerformanceObserverEntryList) => void, extra: Record<string, unknown> = {}) => {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
      const o = new PerformanceObserver(on);
      o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      obs.push(o);
    };
    watch("largest-contentful-paint", (l) => {
      const last = l.getEntries().at(-1);
      if (last) setV((s) => ({ ...s, LCP: last.startTime }));
    });
    let cls = 0;
    watch("layout-shift", (l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) cls += e.value;
      setV((s) => ({ ...s, CLS: cls }));
    });
    let inp = 0;
    watch(
      "event",
      (l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { interactionId?: number })[]) if (e.interactionId) inp = Math.max(inp, e.duration);
        if (inp) setV((s) => ({ ...s, INP: inp }));
      },
      { durationThreshold: 16 },
    );
    return () => obs.forEach((o) => o.disconnect());
  }, []);

  const keys = Object.keys(LIMITS) as Key[];
  const got = keys.filter((k) => v[k] !== undefined);
  return (
    <Panel label="This page, measured now" kind="readout" surface="console" heading={3} state={got.length ? "running" : "idle"} status={`${got.length} of 3 reported`}>
      <dl className={styles.grid}>
        {keys.map((k) => (
          <div key={k}>
            <dt>{LABEL[k]}</dt>
            <dd data-state={v[k] === undefined ? "idle" : grade(k, v[k]!)}>{v[k] === undefined ? (k === "INP" ? "after you click" : "measuring") : <data value={v[k]}>{text(k, v[k]!)}</data>}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>Core Web Vitals from your browser, graded against web.dev&apos;s thresholds. Nothing is sent anywhere.</p>
    </Panel>
  );
}
