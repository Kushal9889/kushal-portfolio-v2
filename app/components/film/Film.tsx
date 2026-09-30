"use client";

import { useMotion } from "@/lib/motion";
import styles from "./Film.module.css";

/** Devices that get stills instead of the live film; "gpu" when only the graphics check failed. */
function canRun(): boolean | "gpu" {
  // ?film=off is the page without the film, the baseline scripts/film-perf.py measures against.
  const mode = new URLSearchParams(location.search).get("film");
  if (mode === "off") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  if (nav.connection?.saveData) return false;
  // Phones load the small clip set, but not over a 2G or 3G link.
  if (window.innerWidth < 768 && /^(slow-2g|2g|3g)$/.test(nav.connection?.effectiveType ?? "")) return false;
  if ((nav.deviceMemory ?? 8) <= 4 && (navigator.hardwareConcurrency ?? 8) <= 4) return false;
  const probe = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
  if (!probe) return "gpu";
  probe.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

/**
 * The background film. Mounted through useMotion, so it inherits the page's
 * gates: nothing is requested under reduced motion, and the renderer only loads
 * after first paint and the webfonts. Without it the page is exactly the
 * classic document.
 */
export default function Film() {
  const ref = useMotion<HTMLDivElement>(({ ScrollTrigger }, root) => {
    const ok = canRun();
    if (ok === "gpu") {
      // Degrade, but say so: a browser with graphics acceleration off (or a
      // blocklisted GPU) would otherwise show the plain page with no reason.
      const note = document.createElement("p");
      note.className = styles.off;
      note.textContent = "The background film is off: this browser has graphics acceleration turned off.";
      document.body.append(note);
      return () => note.remove();
    }
    if (!ok) return;
    let stop: (() => void) | undefined;
    let live = true;
    import("./engine").then((m) => {
      if (live) stop = m.start(root, ScrollTrigger);
    });
    return () => {
      live = false;
      stop?.();
    };
  });

  return <div ref={ref} className={styles.layer} aria-hidden="true" data-film-layer />;
}
