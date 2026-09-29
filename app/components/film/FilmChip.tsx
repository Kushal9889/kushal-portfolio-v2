"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { chipOf, getRequest, subscribe } from "./request";
import styles from "./FilmChip.module.css";

const none = () => null;

/**
 * The provenance chip. The visible line ticks its age once a second while the
 * tab is visible; the spoken line changes only when the claim does, so a
 * screen reader hears "recorded" once rather than every second.
 */
export default function FilmChip() {
  const state = useSyncExternalStore(subscribe, getRequest, none);
  const [now, setNow] = useState(() => Date.now());
  const recorded = state?.provenance.kind === "recorded";

  useEffect(() => {
    if (!recorded) return;
    const tick = () => document.visibilityState === "visible" && setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [recorded]);

  const chip = state ? chipOf(state.provenance, now) : null;
  const age = state?.provenance.kind === "recorded" ? Math.round((now - state.provenance.ranAt) / 1000) : null;

  return (
    <p className={styles.chip} data-kind={chip ? state?.provenance.kind : undefined} data-marker={chip?.marker ?? undefined} aria-hidden={!chip}>
      {chip?.marker && <span className={styles.marker} />}
      <span aria-hidden="true">
        {age === null ? chip?.text : <data value={age}>{chip?.text}</data>}
      </span>
      <span className={styles.spoken} role="status" aria-live="polite">
        {chip?.spoken ?? ""}
      </span>
    </p>
  );
}
