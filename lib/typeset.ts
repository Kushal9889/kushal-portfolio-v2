/**
 * Print-quality punctuation at render time.
 *
 * The corpus keeps straight quotes because the agent quotes it verbatim and
 * its evals match on exact strings; the page is where a reader sees them, so
 * the page is where they turn typographic. Code is never passed through here.
 */
export function typeset(text: string): string {
  return text
    .replace(/(\p{L})'(\p{L})/gu, "$1’$2") // apostrophe inside a word: LangChain's
    .replace(/(\p{L}s)'(?=\s|$|[.,;:])/gu, "$1’") // plural possessive: users'
    .replace(/"([^"\n]+)"/g, "“$1”"); // paired double quotes only
}

/** "2026-10-10" -> "October 10, 2026": the page's one date style. ISO stays in `dateTime`. */
export function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(+d) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
