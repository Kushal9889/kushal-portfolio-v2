"use client";

import { useEffect, useState } from "react";
import Glyph from "./stage/Glyph";
import { TELEMETRY_EVENT, type TelemetryPing } from "@/lib/agent/events";
import styles from "./FreeTierNote.module.css";
import { longDate } from "@/lib/typeset";

type Health = {
  providers: { name: string; model?: string | null; coolingOffFor: number }[];
  checkedAt?: string;
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



/** Opens on each landing; visitors can close or reopen the passive status panel. */
export default function FreeTierNote() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<"hidden" | "dot" | "open">("open");
  const [healthError, setHealthError] = useState(false);
  const [more, setMore] = useState(false);
  /** The last answer this page measured, as it landed. */
  const [lastRun, setLastRun] = useState<TelemetryPing | null>(null);

  useEffect(() => {
    const on = (e: Event) => setLastRun((e as CustomEvent<TelemetryPing>).detail);
    window.addEventListener(TELEMETRY_EVENT, on);
    return () => window.removeEventListener(TELEMETRY_EVENT, on);
  }, []);

  // A passive snapshot, never a paid model probe. Abort on close/unmount.
  useEffect(() => {
    if (state !== "open") return;
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Health unavailable");
        const data: Health = await response.json();
        if (!Array.isArray(data.providers)) throw new Error("Invalid health snapshot");
        setHealth(data);
        setHealthError(false);
      } catch {
        if (!controller.signal.aborted) setHealthError(true);
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(TELEMETRY_EVENT, refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(TELEMETRY_EVENT, refresh);
    };
  }, [state]);

  const dismiss = () => setState("dot");

  if (state === "hidden") return null;

  if (state === "dot") {
    return (
      <div className={styles.dotBar}>
        <button type="button" className={styles.dot} onClick={() => setState("open")} aria-label="Open models and reliability">
          <span className="live-dot" />
          Models & reliability
        </button>
        <button type="button" className={styles.x} onClick={() => setState("hidden")} aria-label="Dismiss model status">
          <Glyph name="X:regular" size={16} />
        </button>
      </div>
    );
  }

  const providers = health?.providers ?? [];
  const ready = providers.filter((p) => !p.coolingOffFor).length;
  const min = health?.cooldown ? Math.round(health?.cooldown.rateLimitedMs / 60_000) : null;
  const sec = health?.cooldown ? Math.round(health?.cooldown.transientMs / 1000) : null;
  const m = health?.measured;
  const l = health?.limits;

  return (
    <aside className={styles.note} aria-labelledby="free-tier-title" data-surface="console">
      <header className={styles.head}>
        {/* The bot's eyes report the providers: lime when all are ready, amber when one rests. */}
        <span className={styles.bot} data-state={providers.length > 0 && !healthError && ready === providers.length ? "ready" : "resting"} aria-hidden="true">
          <i className={styles.antenna} />
          <i className={styles.eye} />
          <i className={styles.eye} />
        </span>
        <p className={styles.kicker}>Models & reliability</p>
        <button type="button" className={styles.x} onClick={dismiss} aria-label="Close models and reliability">
          <Glyph name="X:regular" size={16} />
        </button>
      </header>
      <h2 id="free-tier-title" className={styles.title}>When a model fails, the page keeps working.</h2>
      <p className={styles.lede}>
        One retry per model client, then automatic failover. {l ? `${secs(l.answerMs)} provider timeout. ` : ""}
        If generation fails, the page falls back to retrieved context; unsupported answers stay withheld.
      </p>
      <ul className={styles.board} aria-label="Configured models and cooldown status">
        {providers.map((p) => (
          <li key={p.name} data-state={healthError ? "unknown" : p.coolingOffFor ? "resting" : "ready"}>
            <span className={styles.pip} />
            <b>{p.name}</b>
            <code className={styles.model}>{p.model ?? "Model not reported"}</code>
            <span>{healthError ? "Status stale" : p.coolingOffFor ? `Cooldown · ${secs(p.coolingOffFor * 1000)}` : "Configured · not in cooldown"}</span>
          </li>
        ))}
      </ul>
      <p className={styles.foot} role="status">
        {healthError ? "Status check failed; retrying automatically." : !health ? "Checking runtime status…" : providers.length === 0 ? "No model configured. Retrieved-context fallback remains available." : `Checked ${health.checkedAt ? new Date(health.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "just now"}. Refreshes every 30 seconds.`}
        {" "}This server’s configuration and cooldowns; not a live provider probe.
      </p>
      {min !== null && sec !== null && <p className={styles.lede}>Rate limit: {min} min cooldown. Other errors: {sec} s. Cooling models move behind the other fallbacks.</p>}

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
            {ready} of {providers.length} configured models are outside cooldown.
            {min !== null && sec !== null && ` One that hits its limit rests ${min} min, a blip ${sec} s.`}
          </dd>
        </div>
        <div>
          <dt><Glyph name="Timer:regular" size={16} /> Latency</dt>
          <dd>Every answer shows its first-word and total time.</dd>
        </div>
        <div>
          <dt><Glyph name="ArrowCounterClockwise:regular" size={16} /> Cache</dt>
          <dd>Repeated questions can reuse a cached answer in this tab.</dd>
        </div>
        <div>
          <dt><Glyph name="ShieldCheck:regular" size={16} /> Degrade</dt>
          <dd>
            If generation fails, retrieved context is labeled separately from a generated answer.
            {m?.outage && ` With every model switched off, the record alone still answered ${m.outage.pass} of ${m.outage.cases} held-out questions (${longDate(m.outage.at)}).`}
          </dd>
        </div>
      </dl>

      {m && (
        <>
          <h3 className={styles.sub}>Measured, last gate run {longDate(m.endToEnd.at)}</h3>
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
            {health?.passages && <div><dt>Index</dt><dd className="tabular">{health.passages} passages{health.store ? ` · ${health.store}` : ""}{health.prompt ? ` · prompt ${health.prompt}` : ""}</dd></div>}
          </dl>
        </>
      )}
      </div>
      )}
      <p className={styles.foot}>Close to keep browsing. Reopen from “Models & reliability”.</p>
    </aside>
  );
}
