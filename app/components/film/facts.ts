import vitals from "@/lib/agent/vitals.json";
import prewarm from "@/lib/agent/prewarm.json";
import { index } from "@/lib/agent/corpus-index";
import { HISTORY_TURNS, HISTORY_ANSWER_CHARS, MEDIUM_ANSWER_TOKENS } from "@/lib/agent/limits";
import { SOURCES } from "./sources";

/**
 * The {slots} in content/film.json facts, each read from the file or constant
 * that decides it, so a card never states a number the system does not have.
 * Server only: the index is read here, never shipped to the browser.
 */
const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const e2e = vitals.endToEnd;

export const SLOTS: Record<string, string> = {
  searchP50: secs(vitals.retrieval.p50ms),
  answerP50: secs(e2e.p50ms),
  answerP95: secs(e2e.p95ms),
  citeShare: `${Math.round(e2e.citeCoverage * 100)}%`,
  evals: `${e2e.pass} of ${e2e.cases} passed`,
  passages: `${(index as { passages: unknown[] }).passages.length}`,
  stored: `${Object.keys(prewarm).length} starter questions`,
  historyTurns: `At most ${HISTORY_TURNS}`,
  historyChars: `First ${HISTORY_ANSWER_CHARS} characters`,
  answerCap: `${MEDIUM_ANSWER_TOKENS} word pieces`,
};

/** The tag a row carries: where its number comes from. */
export const TAGS = { measured: "Measured", site: "This site", typical: "Typical" } as const;

export type Fact = { id: string; label: string; text: string; kind: keyof typeof TAGS; source?: keyof typeof SOURCES };

/** A fact row's text with its slots filled; throws on a slot nobody fills, so the build fails rather than print a brace. */
export function fill(text: string): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in SLOTS)) throw new Error(`film fact slot {${k}} has no value (app/components/film/facts.ts)`);
    return SLOTS[k];
  });
}

/** When the measured rows were measured, for the tag's title. */
export const MEASURED_AT = e2e.at;
