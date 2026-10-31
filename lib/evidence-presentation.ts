import type { Citation, Grounding } from "./agent/ground";

export type EvidencePresentation = {
  state: "pending" | "supported" | "withheld" | "retrieved" | "non-answer";
  reason: string;
  citations: Citation[];
  allowAnswer: boolean;
  allowAside: boolean;
  scoreAllowed: boolean;
};

const held = (reason: string, state: EvidencePresentation["state"] = "withheld"): EvidencePresentation => ({
  state, reason, citations: [], allowAnswer: false, allowAside: false, scoreAllowed: false,
});
const normalize = (text: string) => text
  .replace(/\*\*|`/g, "")
  .replace(/(^|\n)\s*(?:\d+[.)]|[-*\u2022])\s+/g, "$1")
  .replace(/\s+/g, " ").trim();
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function validGrounding(value: unknown): value is Grounding {
  if (!object(value)) return false;
  const { claims, found, g, unsupported } = value;
  return Number.isInteger(claims) && (claims as number) >= 0 &&
    Number.isInteger(found) && found === claims && g === 1 &&
    Array.isArray(unsupported) && unsupported.length === 0;
}

function validSources(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((source) => typeof source === "string" && !!source.trim());
}

function hasOwnRecordBody(record: unknown, source: string): record is Record<string, string> {
  return object(record) && Object.prototype.hasOwnProperty.call(record, source) && typeof record[source] === "string";
}

function matchesCurrentRecord(record: unknown, citations: Citation[]): boolean {
  return citations.every((citation) => {
    if (!hasOwnRecordBody(record, citation.source!)) return false;
    const quote = citation.text?.trim();
    return !quote || normalize(record[citation.source!]).includes(normalize(quote));
  });
}

function validCitations(value: unknown, answer: string, sources: string[]): value is Citation[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const citedSources = new Set(sources);
  const passages = new Map<number, { source: string; id?: string; text?: string }>();
  const citations: Citation[] = [];
  for (const raw of value) {
    if (!object(raw)) return false;
    const { sentence, source, id, n, text } = raw;
    if (typeof sentence !== "string" || !sentence.trim() || typeof source !== "string" || !source.trim() ||
        !citedSources.has(source) || !Number.isInteger(n) || (n as number) < 1 ||
        (id !== undefined && (typeof id !== "string" || !id.trim())) ||
        (text !== undefined && typeof text !== "string") || /\[\d+\]/.test(sentence)) return false;
    const prior = passages.get(n as number);
    const passageText = typeof text === "string" && text.trim() ? normalize(text) : undefined;
    if (prior && (prior.source !== source || (prior.id && id && prior.id !== id) ||
        (prior.text && passageText && prior.text !== passageText))) return false;
    passages.set(n as number, {
      source, id: prior?.id ?? (id as string | undefined),
      text: prior?.text ?? passageText,
    });
    citations.push(raw as unknown as Citation);
  }
  if ([...passages.values()].some((passage) => !passage.text)) return false;

  if (/\[\d+\]/.test(answer)) return false;
  const answerText = normalize(answer);
  return !!answerText && normalize(citations.map((citation) => citation.sentence).join(" ")) === answerText;
}

/**
 * Fail closed before answer markers, aside copy, or confidence UI is presented.
 * `supported` means only metadata-consistent and source-linked, not semantically
 * correct or fresh. A low temperature is not evidence of truth.
 */
export function evidencePresentation(result: unknown, pending = false, record?: Record<string, string>): EvidencePresentation {
  if (pending) return held("Answer is still being checked; evidence markers are withheld.", "pending");
  if (!object(result)) return held("Result is missing or malformed; evidence is withheld.");
  if (result.failed === true) return held("The response ended before verification; partial text is withheld.");

  const route = result.route;
  if (typeof route !== "string") return held("Route is missing; evidence is withheld.");
  if (["deflect", "handoff", "authorisation", "act"].includes(route)) {
    if (typeof result.answer !== "string" || !result.answer.trim()) return held("Non-answer text is missing; response is withheld.");
    return { state: "non-answer", reason: `This ${route} response is not a grounded profile answer.`, citations: [], allowAnswer: true, allowAside: false, scoreAllowed: false };
  }
  if (route !== "answer") return held("Route is not recognized; evidence is withheld.");

  if (result.degraded === true) {
    if (typeof result.answer !== "string" || !result.answer.trim() || !validSources(result.sources)) {
      return held("Retrieved text or its source is missing; response is withheld.");
    }
    if (record !== undefined && !result.sources.some((source) => hasOwnRecordBody(record, source) &&
        normalize(record[source]).includes(normalize(result.answer as string)))) {
      return held("Retrieved text does not match a current public source; response is withheld.");
    }
    return { state: "retrieved", reason: "Retrieved passage shown without a generated answer, score, aside, or claim highlighting.", citations: [], allowAnswer: true, allowAside: false, scoreAllowed: false };
  }

  if (typeof result.answer !== "string" || !result.answer.trim() || !validSources(result.sources)) {
    return held("Answer or source list is missing; evidence is withheld.");
  }
  if (!validGrounding(result.grounding)) return held("Grounding metadata is missing or inconsistent; evidence is withheld.");
  if (!validCitations(result.citations, result.answer, result.sources)) return held("Citations do not fully and consistently cover the answer; evidence is withheld.");
  if (record !== undefined && !matchesCurrentRecord(record, result.citations)) {
    return held("Cited passage does not match the current public source record; evidence is withheld.");
  }

  return {
    state: "supported",
    reason: "Every answer statement maps to the supplied source metadata; this does not verify semantic correctness or freshness.",
    citations: result.citations.map((citation) => ({ ...citation })),
    allowAnswer: true, allowAside: true, scoreAllowed: true,
  };
}
