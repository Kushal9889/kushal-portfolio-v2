"use client";

import { useEffect, useState } from "react";
import evals from "@/content/evals.json";
import { TELEMETRY_EVENT, type TelemetryPing } from "./Agent";
import Panel from "./Panel";
import styles from "./Telemetry.module.css";

/**
 * What this page has actually done since you opened it.
 *
 * Every bar is one real request. The first arrives from the demo the hero runs
 * on load; each question adds another. Nothing here is on a timer and nothing
 * loops, which is the whole point: a sparkline that animates on its own is
 * decoration wearing the costume of telemetry, and this page cannot afford to
 * fake the one thing it is claiming.
 *
 * The measured p50 and p95 from the eval run are drawn behind the session as
 * reference lines. That solves the honest problem with plotting real data --
 * one request is not a chart -- and it says more than either half alone: a
 * visitor can see how the request they just made compares to sixteen runs
 * measured against a known corpus, rather than being told a number.
 */
type Sample = { ms: number; tokens: number; cost: number; provider: string | null };

const BASE_P50 = evals.p50 ?? 0;
const BASE_P95 = evals.p95 ?? 0;

export default function Telemetry() {
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    const onPing = (e: Event) => {
      const d = (e as CustomEvent<TelemetryPing>).detail;
      setSamples((prev) =>
        // Bounded. A long session should not grow an unbounded array, and
        // beyond about twenty bars the strip stops being readable anyway.
        [...prev, { ms: d.ms, tokens: d.tokens, cost: d.cost, provider: d.provider }].slice(-20),
      );
    };
    window.addEventListener(TELEMETRY_EVENT, onPing);
    return () => window.removeEventListener(TELEMETRY_EVENT, onPing);
  }, []);

  const tokens = samples.reduce((t, s) => t + s.tokens, 0);
  const cost = samples.reduce((t, s) => t + s.cost, 0);
  const provider = [...samples].reverse().find((s) => s.provider)?.provider ?? null;

  // Scaled against the slower of the measured tail and this session, so a fast
  // session does not stretch its own bars to look slow.
  const ceiling = Math.max(BASE_P95, ...samples.map((s) => s.ms), 1);

  return (
    /* Console, and it earns it: every bar here arrived while the reader was
       looking at the page. This is the one block in the section that is not a
       published result from a build-time run, which is exactly the distinction
       the ground is for. */
    <Panel
      kind="instrument"
      surface="console"
      label="this session"
      state={samples.length === 0 ? "idle" : "done"}
      status={samples.length === 0 ? "waiting" : `${samples.length} served`}
    >
      <div className={styles.chart} role="img" aria-label={
        samples.length === 0
          ? `No requests yet this session. The measured median is ${BASE_P50} milliseconds.`
          : `${samples.length} request${samples.length === 1 ? "" : "s"} this session, ${
              samples[samples.length - 1].ms
            } milliseconds most recently, against a measured median of ${BASE_P50}.`
      }>
        {/* The measured baseline, behind the live bars. */}
        <span className={styles.ref} style={{ "--y": `${(BASE_P50 / ceiling) * 100}%` } as React.CSSProperties}>
          <span className={styles.refLabel}>p50 {BASE_P50}ms</span>
        </span>

        <ol className={styles.bars}>
          {samples.map((s, i) => (
            <li
              key={i}
              className={styles.bar}
              data-health={s.ms <= BASE_P50 ? "good" : undefined}
              style={{ "--h": `${Math.max(2, (s.ms / ceiling) * 100)}%` } as React.CSSProperties}
              title={`${s.ms}ms`}
            />
          ))}
        </ol>
      </div>

      <dl className={styles.readouts}>
        <div className={styles.readout}>
          <dt>requests</dt>
          <dd className="tabular">{samples.length}</dd>
        </div>
        <div className={styles.readout}>
          <dt>tokens</dt>
          <dd className="tabular">{tokens.toLocaleString("en-US")}</dd>
        </div>
        <div className={styles.readout}>
          <dt>list cost</dt>
          {/* Billed is zero on a free tier, which says nothing. What the same
              traffic costs at the model's published rate is the number that
              makes the free tier a decision rather than an absence. */}
          <dd className="tabular">{cost > 0 ? `$${cost.toFixed(5)}` : "$0.00000"}</dd>
        </div>
        <div className={styles.readout}>
          <dt>served by</dt>
          <dd>{provider ?? "—"}</dd>
        </div>
      </dl>
    </Panel>
  );
}
