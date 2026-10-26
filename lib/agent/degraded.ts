/**
 * Degraded answers in the last 24 hours: runs where no model answered and the
 * visitor got a retrieved paragraph or the authored brief instead.
 *
 * Per warm instance, like the logs it mirrors: it says whether this instance is
 * serving people fallbacks right now, which is the question /api/health and the
 * post-deploy smoke check ask. The day-level total across instances is the
 * `degraded` line in the platform log (grep -c), not this counter.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const seen: number[] = [];

export function noteDegraded(at = Date.now()) {
  seen.push(at);
  if (seen.length > 10_000) seen.splice(0, seen.length - 10_000);
}

export function degradedLastDay(now = Date.now()): number {
  while (seen.length && now - seen[0] > DAY_MS) seen.shift();
  return seen.length;
}
