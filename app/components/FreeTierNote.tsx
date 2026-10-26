"use client";

import { useEffect, useState } from "react";
import Glyph from "./stage/Glyph";
import styles from "./FreeTierNote.module.css";

type Health = {
  providers: { name: string; coolingOffFor: number }[];
  cooldown?: { rateLimitedMs: number; transientMs: number };
};

const KEY = "note:free-tier:closed";

/**
 * The agent runs on free model tiers, so a visitor should know up front why an
 * answer can take a moment and what the system does when a provider refuses.
 * Every number here is read from /api/health, never written in. On a wide
 * screen the note slides in once; on a phone it waits as a dot until tapped.
 * Closing it is remembered in this browser only.
 */
export default function FreeTierNote() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<"hidden" | "dot" | "open">("hidden");

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
      <p className={styles.lede}>A few seconds is normal. A slow or retried answer is a provider at its limit, and the agent moves on to the next one.</p>

      <ul className={styles.board} aria-label="Providers right now">
        {health.providers.map((p) => (
          <li key={p.name} data-state={p.coolingOffFor ? "resting" : "ready"}>
            <span className={styles.pip} />
            <b>{p.name}</b>
            <span>{p.coolingOffFor ? `rests ${Math.ceil(p.coolingOffFor / 60)} min` : "ready"}</span>
          </li>
        ))}
      </ul>

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
          <dd>If a provider is out, the answer says which ones were resting.</dd>
        </div>
      </dl>
      <p className={styles.foot}>You can close this.</p>
    </aside>
  );
}
