"use client";

import { useMotion } from "@/lib/motion";
import styles from "./Film.module.css";

/** Devices that get stills instead of the live film. */
function canRun() {
  if (window.innerWidth < 768) return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) <= 4 && (navigator.hardwareConcurrency ?? 8) <= 4) return false;
  const probe = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
  if (!probe) return false;
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
    if (!canRun()) return;
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
