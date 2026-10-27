import type { Citation } from "./agent/ground";

/** Citation coverage counts statements and distinct passages, not answer probability. */
export function summarizeEvidence(citations: Citation[] = []) {
  const sourced = citations.filter((c) => c.source && Number.isInteger(c.n) && c.n! > 0);
  return { sourced: sourced.length, total: citations.length, passages: new Set(sourced.map((c) => c.n)).size };
}

/**
 * How the conversation view reads an answer's citations and the reader's
 * scroll position. Pure, so the two rules the sources depend on are tested
 * without a browser.
 */

// Markdown, list markers at a line start, and whitespace are layout, not text.
const norm = (s: string) =>
  s.replace(/\*\*|`/g, "").replace(/(^|\n)\s*(?:\d+[.)]|[-*\u2022])\s+/g, "$1").replace(/\s+/g, " ").trim();

/**
 * The citation each sentence on the page completes, or undefined.
 *
 * The page splits an answer into paragraphs before sentences, and the stream
 * can open with a sentence the code wrote (`missing` in stream.ts) that
 * `cite()` never saw, so page sentence k is not citation k. Each citation's
 * text is consumed in order instead: a page sentence that starts or continues
 * it takes its share, the one that finishes it carries the marker, and a
 * sentence that is in no citation is skipped without losing the place.
 * A citation `cite()` could not match (no `n`) never shows a marker.
 */
export function alignCitations(sentences: string[], cites: Citation[]): (Citation | undefined)[] {
  let j = 0;
  let rest = "";
  return sentences.map((raw) => {
    const s = norm(raw);
    if (!s) return undefined;
    if (rest.startsWith(s)) {
      rest = rest.slice(s.length).trim();
      return rest ? undefined : finish();
    }
    for (let m = j; m < cites.length; m++) {
      const t = norm(cites[m].sentence);
      if (!t.startsWith(s)) continue;
      j = m;
      rest = t.slice(s.length).trim();
      return rest ? undefined : finish();
    }
    return undefined;
  });

  function finish() {
    const c = cites[j++];
    rest = "";
    return c?.n ? c : undefined;
  }
}

/**
 * The turn being read: the last one whose top has passed the reading line, a
 * third of the way down the view, and the last turn once the view is at its
 * end. A short turn fully in view does not win over the long one the reader
 * is in the middle of, which is what an intersection ratio picks.
 */
export function activeTurn(tops: number[], view: { top: number; height: number }, atEnd: boolean): number | null {
  if (!tops.length) return null;
  if (atEnd) return tops.length - 1;
  const line = view.top + view.height / 3;
  let at = 0;
  for (let i = 0; i < tops.length && tops[i] <= line; i++) at = i;
  return at;
}
