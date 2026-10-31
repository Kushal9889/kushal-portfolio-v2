/**
 * Funnel events.
 *
 * Five events, no cookies, no third-party script, no identifiers. Enough to
 * answer whether the page converts and nothing more: without it there is no way
 * to tell a site that impresses people from one that impresses people who then
 * close the tab.
 *
 * Uses sendBeacon so a contact click still reports after the page starts
 * unloading, which is exactly the event most likely to be lost otherwise.
 */
export type Event =
  | "view"
  | "scroll_deep"
  | "agent_opened"
  | "agent_asked"
  | "voice_used"
  | "agent_feedback"
  | "ui"
  | "contact";

/**
 * A short, stable tag for a question, so votes on the same question group
 * together without the question itself leaving the browser. FNV-1a, 32 bits.
 */
export function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.trim().toLowerCase()) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(36);
}

export function track(event: Event, detail?: string) {
  if (typeof navigator === "undefined") return;

  const body = JSON.stringify({ event, detail, at: Date.now() });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/track", { method: "POST", body, keepalive: true });
    }
  } catch {
    // Analytics must never break the page it measures.
  }
}

/** Fires once per event name per page load. */
export function trackOnce(event: Event, detail?: string) {
  const seen = (trackOnce as unknown as { seen?: Set<string> }).seen ?? new Set<string>();
  (trackOnce as unknown as { seen?: Set<string> }).seen = seen;
  if (seen.has(event)) return;
  seen.add(event);
  track(event, detail);
}
