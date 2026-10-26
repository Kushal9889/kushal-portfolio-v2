"use client";

import { useEffect, useState } from "react";
import Glyph from "./stage/Glyph";
import { TELEMETRY_EVENT, type TelemetryPing } from "@/lib/agent/events";
import styles from "./FreeTierNote.module.css";

type Health = {
  providers: { name: string; coolingOffFor: number }[];
  cooldown?: { rateLimitedMs: number; transientMs: number };
  passages?: number;
  store?: string;
  prompt?: string;
  limits?: { answerMs: number; embedMs: number; storeMs: number; loadCacheMs: number };
  measured?: {
    endToEnd: { at: string; cases: number; pass: number; p50ms: number; p95ms: number; groundedness: number | null; citeCoverage: number | null };
    outage: { at: string; cases: number; pass: number; degraded: number | null; p95ms: number } | null;
    retrieval: { p50ms: number; p95ms: number } | null;
  };
};

const secs = (n: number) => (n < 1000 ? `${n} ms` : `${+(n / 1000).toFixed(1)} s`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

const KEY = "note:free-tier:closed";

/**
 * The agent runs on free model tiers, so a visitor should know up front why an
 * answer can take a moment and what the system does when a provider refuses.
 * Every number here is read from /api/health, never written in: the providers
 * live (re-read every 30 s while the note is open and the tab is visible), the
 * budgets from the constants the code enforces, the measured runs from the last
 * gate report, and the last answer on this page as it lands. On a wide screen
 * the note slides in once, short; "Worth knowing" opens the rest. On a phone it
 * waits as a dot until tapped. Closing it is remembered in this browser only.
 */
export default function FreeTierNote() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<"hidden" | "dot" | "open">("hidden");
  const [more, setMore] = useState(false);
  /** The last answer this page measured, as it landed. */
  const [lastRun, setLastRun] = useState<TelemetryPing | null>(null);

  useEffect(() => {
    const on = (e: Event) => setLastRun((e as CustomEvent<TelemetryPing>).detail);
    window.addEventListener(TELEMETRY_EVENT, on);
    return () => window.removeEventListener(TELEMETRY_EVENT, on);
  }, []);

  // Live while open: the provider board re-reads health, never on a hidden tab.
  useEffect(() => {
    if (state !== "open") return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/health")
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => {});
    }, 30_000);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    let closed = false;
    try {
      closed = localStorage.getItem(KEY) === "1";
    } catch {}
    if (closed) return;
    const c = new AbortController();
    fetch("/api/health", { signal: c.signal })
      .then((r) => r.json())
      .then((h: Health) => {
        setHealth(h);
        const phone = window.matchMedia("(max-width: 767px)").matches;
        // After first paint settles, so the note never competes with the headline.
        window.setTimeout(() => setState(phone ? "dot" : "open"), phone ? 600 : 1400);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);

  const dismiss = () => {
    setState("hidden");
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };

  if (state === "hidden" || !health) return null;

  if (state === "dot") {
    return (
      <div className={styles.dotBar}>
        <button type="button" className={styles.dot} onClick={() => setState("open")} aria-label="Why answers can take a moment">
          <span className="live-dot" />
          Free tier
        </button>
        <button type="button" className={styles.x} onClick={dismiss} aria-label="Dismiss">
          <Glyph name="X:regular" size={16} />
        </button>
      </div>
    );
  }

  const ready = health.providers.filter((p) => !p.coolingOffFor).length;
  const min = health.cooldown ? Math.round(health.cooldown.rateLimitedMs / 60_000) : null;
  const sec = health.cooldown ? Math.round(health.cooldown.transientMs / 1000) : null;
  const m = health.measured;
  const l = health.limits;

  return (
    <aside className={styles.note} aria-labelledby="free-tier-title" data-surface="console">
      <header className={styles.head}>
        {/* The bot's eyes report the providers: lime when all are ready, amber when one rests. */}
        <span className={styles.bot} data-state={ready === health.providers.length ? "ready" : "resting"} aria-hidden="true">
          <i className={styles.antenna} />
          <i className={styles.eye} />
          <i className={styles.eye} />
        </span>
        <p className={styles.kicker}>Free tier, on purpose</p>
        <button type="button" className={styles.x} onClick={dismiss} aria-label="Close">
          <Glyph name="X:regular" size={16} />
        </button>
      </header>
      <h2 id="free-tier-title" className={styles.title}>Answers run on free model tiers.</h2>
      <p className={styles.lede}>
        A few seconds is normal
        {m ? ` (median ${secs(m.endToEnd.p50ms)}, slowest 5% over ${secs(m.endToEnd.p95ms)})` : ""}. A slow or retried answer is a provider at its limit, and the agent moves on to the next one.
      </p>

      <ul className={styles.board} aria-label="Providers right now">
        {health.providers.map((p) => (
          <li key={p.name} data-state={p.coolingOffFor ? "resting" : "ready"}>
            <span className={styles.pip} />
            <b>{p.name}</b>
            <span>{p.coolingOffFor ? `rests ${Math.ceil(p.coolingOffFor / 60)} min` : "ready"}</span>
          </li>
        ))}
      </ul>

      <p className={styles.liveLine} aria-live="polite">
        <span className="live-dot" data-state={lastRun ? undefined : "running"} />
        {lastRun
          ? `Last answer on this page: ${secs(lastRun.ms)}${lastRun.provider ? ` from ${lastRun.provider}` : ""}${lastRun.tokens ? `, ${lastRun.tokens} tokens` : ""}${lastRun.warm ? ", cached" : ""}.`
          : "Waiting for the first answer on this page."}
      </p>

      <button type="button" className={styles.more} aria-expanded={more} aria-controls="free-tier-more" onClick={() => setMore((o) => !o)}>
        {more ? "Show less" : "Worth knowing"}
        <Glyph name="CaretDown:regular" size={14} />
      </button>

      {more && (
      <div id="free-tier-more">
      <dl className={styles.terms}>
        <div>
          <dt><Glyph name="FlowArrow:regular" size={16} /> Failover</dt>
          <dd>
            {ready} of {health.providers.length} ready, tried in order.
            {min !== null && sec !== null && ` One that hits its limit rests ${min} min, a blip ${sec} s.`}
          </dd>
        </div>
        <div>
          <dt><Glyph name="Timer:regular" size={16} /> Latency</dt>
          <dd>Every answer shows its first-word and total time.</dd>
        </div>
        <div>
          <dt><Glyph name="ArrowCounterClockwise:regular" size={16} /> Cache</dt>
          <dd>A question asked again in this tab answers at once.</dd>
        </div>
        <div>
          <dt><Glyph name="ShieldCheck:regular" size={16} /> Degrade</dt>
          <dd>
            If a provider is out, the answer says which ones were resting.
            {m?.outage && ` With every model switched off, the record alone still answered ${m.outage.pass} of ${m.outage.cases} held-out questions (${m.outage.at}).`}
          </dd>
        </div>
      </dl>

      {m && (
        <>
          <h3 className={styles.sub}>Measured, last gate run {m.endToEnd.at}</h3>
          <dl className={styles.facts}>
            <div><dt>Held-out questions</dt><dd className="tabular">{m.endToEnd.pass}/{m.endToEnd.cases} pass</dd></div>
            <div><dt>Answer time</dt><dd className="tabular">p50 {secs(m.endToEnd.p50ms)} · p95 {secs(m.endToEnd.p95ms)}</dd></div>
            {m.retrieval && <div><dt>Search alone</dt><dd className="tabular">p50 {secs(m.retrieval.p50ms)} · p95 {secs(m.retrieval.p95ms)}</dd></div>}
            {m.endToEnd.groundedness !== null && <div><dt>Figures found in sources</dt><dd className="tabular">{pct(m.endToEnd.groundedness)}</dd></div>}
            {m.endToEnd.citeCoverage !== null && <div><dt>Sentences with a source</dt><dd className="tabular">{pct(m.endToEnd.citeCoverage)}</dd></div>}
          </dl>
        </>
      )}
      {l && (
        <>
          <h3 className={styles.sub}>Budgets the code enforces</h3>
          <dl className={styles.facts}>
            <div><dt>One provider</dt><dd className="tabular">{secs(l.answerMs)}, then the next</dd></div>
            <div><dt>Query embedding</dt><dd className="tabular">{secs(l.embedMs)}</dd></div>
            <div><dt>Vector database</dt><dd className="tabular">{secs(l.storeMs)}, then the bundled index</dd></div>
            <div><dt>Load answer reused</dt><dd className="tabular">{secs(l.loadCacheMs)}</dd></div>
            {health.passages && <div><dt>Index</dt><dd className="tabular">{health.passages} passages{health.store ? ` · ${health.store}` : ""}{health.prompt ? ` · prompt ${health.prompt}` : ""}</dd></div>}
          </dl>
        </>
      )}
      </div>
      )}
      <p className={styles.foot}>You can close this.</p>
    </aside>
  );
}
