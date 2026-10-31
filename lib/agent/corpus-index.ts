import { readFileSync } from "node:fs";
import { join } from "node:path";
import bundled from "./index.json";
import bundledCalibration from "./calibration.json";
import { CONTENT_DIR } from "../content";

/**
 * The retrieval index for the active corpus.
 *
 * The site serves the bundled index. With `AGENT_CORPUS` set (scripts and the
 * fixture gate only), the index built next to that corpus is read instead, so
 * the same retrieval code runs over another person's facts unchanged.
 */
export const index: unknown = process.env.AGENT_CORPUS
  ? JSON.parse(readFileSync(join(CONTENT_DIR, "index.json"), "utf8"))
  : bundled;

export type Calibration = { floor: { cosine: number | null; lexical: number | null; logit: number | null }; max: { logit: number | null } };

/** Abstain floors for the same corpus (scripts/calibrate-null.ts); null when never calibrated. */
export const calibration: Calibration | null = (() => {
  const path = process.env.AGENT_CORPUS ? join(CONTENT_DIR, "calibration.json") : join(process.cwd(), "lib/agent/calibration.json");
  try {
    return process.env.AGENT_CORPUS ? JSON.parse(readFileSync(path, "utf8")) : bundledCalibration;
  } catch {
    return null;
  }
})();
