import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Disk cache for the two network calls retrieval makes, for eval runs only
 * (docs/adr/adr-010-eval-loop-speed.md). On only with AGENT_EVAL_CACHE=1 and
 * never under AGENT_FAULT, so the site and the fault suite always call the
 * provider. The key is a hash of everything the provider sees (model, input
 * type, exact text), so a changed passage or model can only miss, never return
 * a stale result.
 */
const DIR = join(process.cwd(), ".cache/agent");
const on = () => process.env.AGENT_EVAL_CACHE === "1" && !process.env.AGENT_FAULT;

export async function cached<T>(parts: unknown[], live: () => Promise<T | null>): Promise<T | null> {
  if (!on()) return live();
  const file = join(DIR, `${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  const value = await live();
  // Failures are not cached: a timeout today must be retried tomorrow.
  if (value !== null) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }
  return value;
}
