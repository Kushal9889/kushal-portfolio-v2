"use client";

import { useEffect, useState } from "react";
import styles from "./LiveStatus.module.css";
import { trackOnce } from "@/lib/analytics";

type State = { up: boolean; ms: number; at: Date } | "checking" | "unknown";

/**
 * Reachability check against the deployed BU Life AI system.
 *
 * The previous version of this site rendered a hardcoded `agents_active: 3` and
 * `cache_hit_rate: 67` as though they were live telemetry, which is the easiest
 * claim on a page like this to disprove and the most expensive one to be caught
 * on. This measures one real thing instead: whether the deployed system responds,
 * and how long it took.
 *
 * A failed check renders as unknown rather than as down. The request is
 * cross-origin and opaque, so a failure means this browser could not confirm it,
 * not that the service is offline, and saying otherwise would repeat the original
 * mistake in the opposite direction.
 */
export default function LiveStatus({ url, label, timed = false }: { url: string; label: string; timed?: boolean }) {
  const [state, setState] = useState<State>("checking");

  // Reaching this section means the visitor scrolled past the fold and the work
  // history, which is the point the funnel cares about.
  useEffect(() => {
    trackOnce("scroll_deep");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const started = performance.now();

    fetch(url, { mode: "no-cors", signal: controller.signal, cache: "no-store" })
      .then(() => setState({ up: true, ms: Math.round(performance.now() - started), at: new Date() }))
      .catch(() => setState("unknown"));

    return () => controller.abort();
  }, [url]);

  return (
    <p className={styles.status}>
      {state === "checking" && <span className="caption">checking {label}</span>}
      {state === "unknown" && (
        <span className="caption">{label} status could not be checked from here</span>
      )}
      {typeof state === "object" && (
        <>
          <span className="live-dot" />{" "}
          <span className="caption">
            {label} responded in <span className="tabular">{state.ms}ms</span>
            {timed && (
              <>
                {" "}
                at{" "}
                <time className="tabular" dateTime={state.at.toISOString()}>
                  {state.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
              </>
            )}
          </span>
        </>
      )}
    </p>
  );
}
