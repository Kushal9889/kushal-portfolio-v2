"use client";

import { useEffect } from "react";

/**
 * Field-data beacon (ADR-004). Mounted only when NEXT_PUBLIC_RUM is "1".
 * Samples 10 percent of visits, decided once per session, never on a
 * reduced-motion or save-data visit. Sends one beacon at pagehide.
 *
 * web-vitals is not a dependency, so INP here is the worst interaction
 * duration seen (PerformanceObserver "event" entries), which is at or above the
 * 98th-percentile figure web-vitals reports and so errs towards the alert.
 */
type Entry = PerformanceEntry & { interactionId?: number; scripts?: { sourceURL?: string; sourceFunctionName?: string; invokerType?: string; duration: number }[] };
type Conn = { effectiveType?: string; saveData?: boolean };

export default function Rum() {
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: Conn }).connection;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData) return;
    let sampled = false;
    try {
      const kept = sessionStorage.getItem("rum");
      sampled = kept ? kept === "1" : Math.random() < 0.1;
      sessionStorage.setItem("rum", sampled ? "1" : "0");
    } catch {
      sampled = Math.random() < 0.1;
    }
    if (!sampled) return;

    let inp: number | null = null;
    const scripts: { file: string; fn: string; invoker: string; ms: number }[] = [];
    const watch = (type: string, init: PerformanceObserverInit & { durationThreshold?: number }, on: (e: Entry) => void) => {
      try {
        const o = new PerformanceObserver((list) => (list.getEntries() as Entry[]).forEach(on));
        o.observe({ type, buffered: true, ...init });
        return o;
      } catch {
        return null; // entry type not supported in this browser
      }
    };
    const events = watch("event", { durationThreshold: 40 }, (e) => {
      if (e.interactionId) inp = Math.max(inp ?? 0, e.duration);
    });
    const frames = watch("long-animation-frame", {}, (e) =>
      e.scripts?.forEach((s) => scripts.push({ file: s.sourceURL ?? "", fn: s.sourceFunctionName ?? "", invoker: s.invokerType ?? "", ms: s.duration })),
    );

    const send = () => {
      const loaf = scripts.sort((a, b) => b.ms - a.ms).slice(0, 3);
      const body = JSON.stringify({
        inp,
        loaf,
        film: {},
        cores: navigator.hardwareConcurrency,
        net: conn?.effectiveType,
        viewport: innerWidth < 768 ? "phone" : "desktop",
      });
      navigator.sendBeacon("/api/rum", body);
    };
    addEventListener("pagehide", send, { once: true });
    return () => {
      removeEventListener("pagehide", send);
      events?.disconnect();
      frames?.disconnect();
    };
  }, []);
  return null;
}
