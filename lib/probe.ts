/**
 * One helper for every network read the page makes from the reader's browser.
 *
 * Every request is abandoned at 1.2s. A request that fails or times out returns
 * null, and the caller shows the value `content/build-cache.json` recorded at
 * build, with that date. Nothing built on this ever renders "down" or 0 for a
 * request that did not answer: not being able to check is not a finding.
 */

export const PROBE_TIMEOUT_MS = 1200;

async function timed<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether this browser reached a URL, and how long it took. The request is
 * cross-origin and opaque, so success means "reached", never "responded 200".
 */
export function reach(url: string): Promise<{ ms: number; at: Date } | null> {
  return timed(async (signal) => {
    const started = performance.now();
    await fetch(url, { mode: "no-cors", cache: "no-store", signal });
    return { ms: Math.round(performance.now() - started), at: new Date() };
  });
}

/** A JSON read, or null on any failure, a non-2xx status or the timeout. */
export function readJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  return timed(async (signal) => {
    const res = await fetch(url, { headers, signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  });
}

/** Median of a list of numbers, for repeated probes. */
export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
