/**
 * Claim-level groundedness, checked without a model.
 *
 * The reranker's band says how well the retrieved sections match the question.
 * It says nothing about the answer the model then wrote, which can carry a
 * figure or a name that no retrieved section contains. This reads the answer
 * back against the context it was given.
 *
 *   claims C = every number (with its unit or %) and every proper noun
 *   G = |C found in context| / |C|, and G = 1 when there are no claims
 *
 * A number is found when the same value appears in the context ("5,000+" and
 * "5000" are one value). A proper noun is found when the context has the same
 * word on a word boundary, ignoring case. The question counts as context: a
 * name the visitor typed is not the agent's claim.
 *
 * Deterministic on purpose. A judge model would catch paraphrase this misses,
 * and would also add a second network call and a second thing that can be
 * wrong; a figure either is in his facts or it is not.
 */
export type Grounding = { claims: number; found: number; g: number; unsupported: string[] };

/** Capitalised words that start sentences and name nothing. */
const COMMON = new Set([
  "he", "his", "him", "i", "it", "its", "the", "a", "an", "this", "that", "these", "those", "there",
  "they", "their", "she", "her", "we", "you", "your", "in", "on", "at", "for", "from", "with", "by",
  "as", "and", "but", "or", "if", "when", "while", "after", "before", "during", "since", "both",
  "each", "every", "all", "some", "no", "not", "yes", "also", "then", "so", "to", "of", "what", "which",
  "who", "how", "why", "where", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "first", "second", "third", "role", "stack", "measured", "links", "source",
]);

const NUMBER = /(?<![\w.])\d[\d,]*(?:\.\d+)?/g;
const WORD = /[A-Za-z][A-Za-z0-9+#.-]*[A-Za-z0-9+#]|[A-Z]/g;

const value = (n: string) => Number(n.replace(/,/g, ""));

export function ground(answer: string, ...context: string[]): Grounding {
  const text = answer.replace(/\*\*|`/g, "");
  const haystack = context.join("\n").replace(/\*\*|`/g, "");
  const lower = haystack.toLowerCase();
  const known = new Set((haystack.match(NUMBER) ?? []).map(value));

  const claims = new Map<string, boolean>();

  // Numbers. A list marker ("1." at the start of a line) is layout, not a claim.
  for (const m of text.matchAll(NUMBER)) {
    const before = text.slice(0, m.index);
    if (/(^|\n)\s*$/.test(before) && /^[.)]\s/.test(text.slice(m.index! + m[0].length))) continue;
    const unit = text.slice(m.index! + m[0].length).match(/^(%|\+)?/)?.[0] ?? "";
    claims.set((m[0] + unit).trim(), known.has(value(m[0])));
  }

  // Proper nouns: capitalised, and either mid-sentence or shaped like a name
  // on their own (an inner capital or digit: "LangGraph", "NCP-AAI", "IEEE").
  for (const m of text.matchAll(WORD)) {
    const word = m[0].replace(/[.-]+$/, "").replace(/'s$/, "");
    if (!/^[A-Z]/.test(word) || COMMON.has(word.toLowerCase())) continue;
    const opensSentence = /(^|[.!?:]\s+|\n\s*[-*]?\s*)$/.test(text.slice(0, m.index));
    if (opensSentence && !/.[A-Z0-9]/.test(word)) continue;
    const at = new RegExp(`(^|[^a-z0-9])${word.toLowerCase().replace(/[.+#]/g, "\\$&")}($|[^a-z0-9])`);
    claims.set(word, at.test(lower));
  }

  const found = [...claims.values()].filter(Boolean).length;
  return {
    claims: claims.size,
    found,
    g: claims.size ? +(found / claims.size).toFixed(3) : 1,
    unsupported: [...claims].filter(([, ok]) => !ok).map(([c]) => c),
  };
}

/**
 * Which section each sentence of the answer came from.
 *
 *   C(sentence, passage) = |words shared| / |words in the sentence|
 *   source = the section of the passage with the highest C, when C >= 0.5
 *
 * Share of the sentence, not Jaccard: a twelve-word sentence lifted from an
 * eighty-word paragraph has Jaccard 0.15 and is still wholly from it. Measured
 * on 93 answer sentences from the held-out suite (2026-10-10): C >= 0.5 labels
 * 86, Jaccard >= 0.2 labels 58. Kushal chose C.
 */
const STOP = new Set(["the", "and", "for", "with", "his", "has", "was", "that", "this", "from", "are", "into", "not", "but", "who", "its", "than", "then", "also", "which"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/\*\*/g, "").split(/[^a-z0-9+#%]+/).filter((w) => w.length > 2 && !STOP.has(w)));

export type Citation = { sentence: string; source: string | null };

export function cite(answer: string, sections: { title: string; body: string }[], min = 0.5): Citation[] {
  const passages = sections.flatMap((s) => s.body.split(/\n\n+/).map((p) => ({ title: s.title, w: words(p) })));
  return answer
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim())
    .map((sentence) => {
      const w = words(sentence);
      let best = { c: 0, title: null as string | null };
      for (const p of passages) {
        const c = w.size ? [...w].filter((x) => p.w.has(x)).length / w.size : 0;
        if (c > best.c) best = { c, title: p.title };
      }
      return { sentence, source: best.c >= min ? best.title : null };
    });
}
