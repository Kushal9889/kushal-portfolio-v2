"use client";

import { useEffect } from "react";
import { useMotion } from "@/lib/motion";
import styles from "./Film.module.css";

/**
 * "off" is the page without the film (an explicit ?film=off). "still" is a device
 * that cannot or should not run the live film (data saver, a slow link, a small
 * machine, no WebGL2, or ?film=still to look at it): it gets one still frame of the
 * racks behind the page instead of a plain ground. "gpu" is the still plus a note
 * that graphics acceleration is off.
 */
function canRun(): boolean | "gpu" | "still" {
  const mode = new URLSearchParams(location.search).get("film");
  if (mode === "off") return false;
  if (mode === "still") return "still";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  if (nav.connection?.saveData) return "still";
  // Phones load the small clip set, but not over a 2G or 3G link.
  if (window.innerWidth < 768 && /^(slow-2g|2g|3g)$/.test(nav.connection?.effectiveType ?? "")) return "still";
  if ((nav.deviceMemory ?? 8) <= 4 && (navigator.hardwareConcurrency ?? 8) <= 4) return "still";
  const probe = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
  if (!probe) return "gpu";
  probe.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

const setStill = (on: boolean) => {
  if (on) document.documentElement.dataset.film = "still";
  else if (document.documentElement.dataset.film === "still") delete document.documentElement.dataset.film;
};

/**
 * The background film. Mounted through useMotion, so it inherits the page's
 * gates: nothing is requested under reduced motion, and the renderer only loads
 * after first paint and the webfonts. Without it the page is exactly the
 * classic document.
 */
export default function Film() {
  const ref = useMotion<HTMLDivElement>(({ ScrollTrigger }, root) => {
    const ok = canRun();
    if (ok === "still") {
      setStill(true);
      return () => setStill(false);
    }
    if (ok === "gpu") {
      setStill(true);
      // Degrade, but say so: a browser with graphics acceleration off (or a
      // blocklisted GPU) would otherwise show the plain page with no reason.
      const note = document.createElement("p");
      note.className = styles.off;
      note.textContent = "The background film is off: this browser has graphics acceleration turned off.";
      document.body.append(note);
      return () => {
        note.remove();
        setStill(false);
      };
    }
    if (!ok) return;
    let stop: (() => void) | undefined;
    let live = true;
    let slow = false;
    // The engine measured a link too slow to carry the film: the still frame
    // takes over for the rest of the visit instead of a frozen picture.
    const toStill = () => {
      slow = true;
      stop?.();
      stop = undefined;
      setStill(true);
    };
    import("./engine").then((m) => {
      if (live) stop = m.start(root, ScrollTrigger, toStill);
    });
    return () => {
      live = false;
      stop?.();
      if (slow) setStill(false);
    };
  });

  // Reduced motion never starts the film, and a still frame is not motion: it is
  // the one thing those readers see of it.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("film") === "off") return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setStill(true);
    return () => setStill(false);
  }, []);

  return <div ref={ref} className={styles.layer} aria-hidden="true" data-film-layer />;
}
