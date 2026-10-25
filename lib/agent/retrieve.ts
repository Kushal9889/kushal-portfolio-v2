import { Document } from "@langchain/core/documents";
import { traceable } from "langsmith/traceable";
import { embedQuery } from "./model";
import { NvidiaRerank } from "./rerank";
import { kindsFor, type ChunkMeta } from "./query";
import { loadContent } from "../content";
import { correct } from "./vocab";
import { index, calibration } from "./corpus-index";
import { denseFromNeon, tableFor } from "./store";

export type Chunk = { title: string; body: string; source: string; meta?: ChunkMeta };

type Passage = { parent: string; ordinal: number; text: string; tokens: number; context?: string };

type IndexShape = {
  /** The ranked unit: a semantic passage of roughly 100-150 tokens. */
  passages: Passage[];
  /** The unit handed to the model: the whole section a passage came from. */
  parents: Chunk[];
  /** Per-chunk term frequencies, plus the length needed for BM25 normalisation. */
  tf: Record<string, number>[];
  lengths: number[];
  df: Record<string, number>;
  avgLength: number;
  /** Present only when an embedding provider was configured at build time. */
  vectors: number[][] | null;
  /** The model that embedded `vectors`; queries are embedded with the same one. Absent means NVIDIA (older indexes). */
  embedModel?: string;
  /** Entity -> section titles, built by scripts/build-index.ts (graph route). */
  graph?: Record<string, string[]>;
  /** Typed knowledge graph (scripts/build-index.ts): domains, concepts, tech, sections. */
  kg?: { seedFloor: number | null; nodes: { id: string; type: string; label: string; v?: number[] | null }[]; edges: [string, string, number, string][] };
};

// Cast through unknown: TypeScript infers a literal type for every term in the
// generated index, which does not structurally match the declared shape.
const idx = index as unknown as IndexShape;

import { queryTokens, indexTokens, STOPWORDS } from "./tokenize";

/**
 * Query-time tokens.
 *
 * Re-exported rather than redefined. This file and `scripts/build-index.ts`
 * each had their own copy differing only in a stopword filter, and nothing kept
 * them in step -- which is how 169 of 1,342 indexed terms came to end in a full
 * stop while queries were tokenised without one.
 */
export const tokenize = queryTokens;
export { indexTokens };

const K1 = 1.5;
const B = 0.75;

/**
 * BM25 over the corpus.
 *
 * Dense retrieval alone is wrong for this content. Embeddings compress meaning
 * and lose surface form, so they miss exact strings, and exact strings are what
 * people actually type here: "Cosmos DB", "NCP-AAI", "Growaza", "LangGraph".
 * Keyword scoring handles those; the vector half handles intent.
 */
function bm25(query: string): number[] {
  const terms = tokenize(query);
  const N = idx.passages.length;

  return idx.tf.map((tf, i) => {
    let score = 0;
    for (const term of terms) {
      const f = tf[term];
      if (!f) continue;
      const df = idx.df[term] ?? 0;
      const inverseDocFreq = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const norm = 1 - B + (B * idx.lengths[i]) / idx.avgLength;
      score += inverseDocFreq * ((f * (K1 + 1)) / (f + K1 * norm));
    }
    return score;
  });
}

/**
 * How similarity between two vectors is measured.
 *
 * Exposed so `scripts/bench-retrieval.ts` can compare them on this corpus
 * rather than repeating what a blog post says. One result is worth stating
 * because it is provable rather than empirical: these embeddings are unit
 * length, and for unit vectors squared euclidean distance is 2 - 2cos, which is
 * monotonic in cosine -- so cosine and L2 produce identical rankings, always,
 * and any measured difference between them is a bug in the harness. L1 has no
 * such relationship and genuinely differs.
 */
export type Metric = "cosine" | "dot" | "l2" | "l1";

export function similarity(a: number[], b: number[], metric: Metric = "cosine"): number {
  if (metric === "dot") {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }
  if (metric === "l2") {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
    // Negated: every caller ranks descending, and a distance is better small.
    return -Math.sqrt(sum);
  }
  if (metric === "l1") {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return -sum;
  }
  return cosine(a, b);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Positions, best first.
 *
 * `keepAll` exists because the distance metrics are negated to make "larger is
 * better" true everywhere, so every L2 and L1 score is below zero and a filter
 * on `score > 0` would silently rank nothing at all. That filter is correct for
 * BM25, where zero means the term never appeared.
 */
function rankOf(scores: number[], keepAll = false): Map<number, number> {
  const order = scores
    .map((score, i) => ({ score, i }))
    .filter((s) => keepAll || s.score > 0)
    .sort((a, b) => b.score - a.score);
  return new Map(order.map((s, rank) => [s.i, rank + 1]));
}

/**
 * Reciprocal rank fusion.
 *
 * Merging on rank rather than raw score means the two retrievers do not need
 * comparable scales, which they do not have: BM25 is unbounded and cosine is
 * bounded to [-1, 1]. Normalising them against each other would need tuning that
 * a corpus this size cannot justify.
 */
const RRF_K = 60;

/*
 * The lexical short-circuit, measured and removed.
 *
 * It skipped the embedding call when the top keyword hit was 2.2x clear of the
 * next, on the reasoning that a rare term like "Growaza" or "NCP-AAI" lands one
 * chunk far ahead of the rest and no embedding is going to reorder it. The
 * comment named those two queries as the case it was tuned for.
 *
 * Neither of them passes it. Measured across the eval set:
 *
 *   Growaza                             top 2.813   2nd 2.377   not decisive
 *   NCP-AAI                             top 2.256   2nd 1.126   not decisive
 *   What did he do at IMG Systems?      top 5.123   2nd 4.873   not decisive
 *   What bug did he find in LangChain?  top 4.650   2nd 3.412   not decisive
 *   What did he ship?                   top 1.270   2nd 0.000   DECISIVE
 *
 * The one query it fired on is the weakest scoring query in the set, and it
 * fired because the test compares against `sorted[1] || 0` -- so when nothing
 * else scores at all, any single hit beats zero times anything and counts as
 * confidence. A lone weak match is not confidence; it is the absence of
 * competition, and it is exactly when the dense half is most needed.
 *
 * The consequence reached a reader. "What did he ship?" survives stopword
 * removal as ["ship"], the only chunk containing that token is the section
 * describing this website -- because it says the page refuses to "ship claims
 * it cannot support" -- and with the embedding call skipped there was nothing
 * left to notice that a career question had been answered with a paragraph
 * about Netlify.
 *
 * So it is gone rather than retuned. It never once fired on a query it was
 * written for, it fired on 5 of 40 retrievals in the eval suite and all of them
 * were of this kind, and both retrievers now run on every question. The cost is
 * one embedding call, measured at 236-421ms, on questions that were being
 * answered wrongly without it.
 */

/**
 * One chunk's position in both retrievers and in the fusion.
 *
 * Exposed so the page can draw the actual fusion rather than an impression of
 * it. Every field is a number this function computed on the way to an answer;
 * nothing is derived for display.
 */
export type FusionRow = {
  title: string;
  /** Raw BM25, unbounded. */
  lexicalScore: number;
  /** 1-based rank in the lexical retriever, null when it scored zero. */
  lexicalRank: number | null;
  /** 1-based rank in the dense retriever, null when dense was skipped or scored zero. */
  denseRank: number | null;
  /** The reciprocal rank fusion total that decides the ordering. */
  fused: number;
  selected: boolean;
};

export type RetrievalTrace = {
  k: number;
  denseUsed: boolean;
  /** How many passages were ranked to produce these sections. */
  passages?: number;
  /** Tokens repaired against the index vocabulary, as [typed, read as]. */
  corrections?: [string, string][];
  rows: FusionRow[];
  /** Answer, partial or unknown, from the best reranker logit (or the agreement rule). */
  band?: Band;
  /** The best reranker logit, null when the reranker was unreachable. */
  relevance?: number | null;
  /**
   * How strongly the evidence says the corpus answers this, as four tiers:
   * 0 no signal clears its off-topic floor; 1 one does; 2 two or more do, or the
   * question names a section or a template kind; 3 the reranker scores it above
   * every off-topic question measured for this corpus. Each signal is reported
   * beside its floor so the tier can be checked, not taken on trust.
   */
  confidence?: { tier: 0 | 1 | 2 | 3; signals: { cosine: number | null; lexical: number; logit: number | null }; floors: { cosine: number | null; lexical: number | null; logit: number | null; logitMax: number | null } };
  /** Sections added because the question shape maps to their template kind. */
  kinds?: string[];
  /** Which store served the dense leg, and how long it took. */
  store?: "neon" | "memory";
  storeMs?: number;
  /** Names in the question the corpus never uses (absentNames). */
  missing?: string[];
  /** Input with no corpus word at all (isNoise); nothing was scored. */
  noise?: boolean;
  /** Sections the entity graph linked for an aggregation question. */
  graph?: string[];
  /** Knowledge-graph paths that brought a section in: "seed (sim) -> [via ->] section". */
  kgPaths?: string[];
};

export type Band = "answer" | "partial" | "unknown";

/**
 * Cut points on the reranker logit, set on the dev split of
 * content/agent-scenarios.json by scripts/agent-calibrate.ts and never on test.
 * At or above `answer` the profile says it; between the two the profile holds
 * something related but not the thing asked; below `partial` it is not there.
 * Versioned with the reranker: a new model means a new calibration run.
 */
export const BANDS = { answer: -4.5, partial: -5.0 } as const;

/**
 * Input with no word the corpus uses anywhere, grammar words included: empty,
 * emoji, keyboard mashing, a greeting. Every ranker still returns a "best"
 * passage for it (an emoji scored logit -3.8, above most real questions), so it
 * is caught before scoring rather than by a threshold.
 */
export function isNoise(query: string): boolean {
  // Grammar words count too: a nine-section corpus may never write "why" or "we".
  return !indexTokens(query).some((t) => Object.hasOwn(idx.df, t) || STOPWORDS.has(t));
}

/**
 * Answer, partial or unknown, against this corpus's own floors.
 *
 * The floors sit at the 90th percentile of each signal over questions no
 * profile answers (scripts/calibrate-null.ts), so they move with the corpus.
 * The fixed cut points they replace were set on one corpus: there the logit
 * separated answerable from off-topic at AUC 0.94, on two other corpora 0.83
 * and 0.66, and correct top sections were refused. Unknown needs every signal
 * to look like an off-topic question; answer needs the logit above every one.
 * A question about the person that names something absent ("did he use
 * Kafka") is not off-topic: it goes to the model, which says what is missing.
 */
function gate(logit: number | null, cos: number, lex: number): Band {
  if (!calibration) return logit === null ? "unknown" : logit >= BANDS.answer ? "answer" : logit >= BANDS.partial ? "partial" : "unknown";
  const { floor, max } = calibration;
  const above = (x: number | null, f: number | null) => x !== null && f !== null && x > f;
  if (!above(cos, floor.cosine) && !above(lex, floor.lexical) && !above(logit, floor.logit)) return "unknown";
  return above(logit, max.logit) ? "answer" : "partial";
}

/**
 * Proper names in the question that the corpus never uses: "Did he intern at
 * Databricks?", "Has she worked at Google?". The question is about the person,
 * so no threshold should refuse it, and no ranker can say the name is missing:
 * each still returns its best passage. The vocabulary can. A capitalised or
 * mixed-case word (sentence-initial only when it is all caps or mixed case),
 * absent from every passage and not a typo of a word that is present, is
 * stated as missing before the model answers.
 */
export function absentNames(question: string): string[] {
  const out: string[] = [];
  // An employer question checks the name against the places the person worked,
  // not the whole vocabulary: "Google" in a certificate is not a Google job.
  const employer = question.match(EMPLOYER)?.[4]?.replace(/[?.!,]+$/, "");
  if (employer && !PLACES.some((p) => p.includes(employer.toLowerCase()))) out.push(employer);
  for (const m of question.matchAll(/(^|[.?!]\s+|\s)([A-Za-z][\w+#.-]*)/g)) {
    const word = m[2].replace(/[.\-]+$/, "");
    const initial = m[1] !== " " && m[1] !== "\t" && m[1] !== "\n";
    const shaped = /^[A-Z]{2,}$/.test(word) || /[a-z][A-Z]/.test(word);
    if (!/^[A-Z]/.test(word) || word.length < 2 || (initial && !shaped)) continue;
    const t = word.toLowerCase();
    if (Object.hasOwn(idx.df, t) || correct(t).fixes.length) continue;
    out.push(word);
  }
  return [...new Set(out)];
}

/** Template kind per section title (docs/facts-format.md). */
const KINDS = new Map(loadContent().sections.map((s) => [s.title, s.kind ?? ""]));

/**
 * Words that name a section: from its title and aliases, kept only when most of
 * the passages using the word belong to that section. "IMG", "Growaza", "Lumen"
 * pass; "systems", "university", "health" are spread across the corpus and do
 * not. Measured from the index, so it holds for any corpus and any length of
 * name, including the three-letter acronyms a length rule used to drop.
 */
const NAME_WORDS: Map<string, string> = (() => {
  const out = new Map<string, string>();
  const aliases = new Map(loadContent().sections.map((s) => [s.title, s.aliases ?? []]));
  // Headings of generic kinds ("What she is good at", "Skills") name nothing.
  const generic = new Set(["profile", "limits", "skills", "education", "availability", "private", "meta"]);
  for (const parent of idx.parents) {
    if (generic.has(KINDS.get(parent.title) ?? "")) continue;
    for (const w of new Set(indexTokens([parent.title, ...(aliases.get(parent.title) ?? [])].join(" ")))) {
      if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      const using = idx.tf.map((tf, i) => (tf[w] ? idx.passages[i].parent : null)).filter(Boolean);
      const own = using.filter((t) => t === parent.title).length;
      if (using.length && own / using.length >= 0.5 && !out.has(w)) out.set(w, parent.title);
    }
  }
  return out;
})();

/** Sections the question names, typo-tolerant, in the order named. */
export function namedSections(question: string): string[] {
  const titles = indexTokens(question).map((w) => NAME_WORDS.get(w) ?? NAME_WORDS.get(correct(w).fixes[0]?.[1] ?? ""));
  return [...new Set(titles.filter((t): t is string => !!t && !NEVER_RETRIEVED.has(t)))];
}

/** The person, as a visitor refers to them: any pronoun, or a part of their name. */
const NAME_PARTS = (loadContent().profile.name ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
const PERSON = new RegExp(String.raw`\b(he|him|his|himself|she|her|hers|herself|they|them|their|theirs|themselves|candidate|${NAME_PARTS.join("|") || "_"})\b`, "i");

/** Hiring text pasted or typed as a requirement list: about the person by intent, not by pronoun. */
const HIRING_TEXT = /\b(requirements?|responsibilit\w*|qualifications?|looking for|we need|we are hiring|seeking|must have|nice to have|years of (experience|\w+)|experience (with|in)|candidate)\b/i;

/** "worked at X", "interned with X", "employed by X": X is the place asked about. */
const EMPLOYER = /\b(work(ed|s|ing)?|intern(ed|ing)?|employed|job|position|role)\s+(?:at|for|with|by)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)/;
/** Titles and aliases of the template's role and project sections, lowercased. */
const PLACES = loadContent()
  .sections.filter((s) => s.kind === "role" || s.kind === "project" || !s.kind)
  .flatMap((s) => [s.title, ...((s as { aliases?: string[] }).aliases ?? [])])
  .map((t) => t.toLowerCase());

function confidenceOf(logit: number | null, cos: number, lex: number, structural: boolean, band: Band): RetrievalTrace["confidence"] {
  const f = calibration?.floor ?? { cosine: null, lexical: null, logit: null };
  const logitMax = calibration?.max.logit ?? null;
  const above = (x: number | null, y: number | null) => x !== null && y !== null && x > y;
  const n = [above(cos, f.cosine), above(lex, f.lexical), above(logit, f.logit)].filter(Boolean).length;
  const tier = band === "unknown" ? 0 : above(logit, logitMax) ? 3 : n >= 2 || structural ? 2 : n === 1 ? 1 : 0;
  const r = (x: number | null) => (x === null ? null : +x.toFixed(3));
  return { tier, signals: { cosine: cos < 0 ? null : r(cos), lexical: +lex.toFixed(3), logit: r(logit) }, floors: { cosine: f.cosine, lexical: f.lexical, logit: f.logit, logitMax } };
}

/** The Neon table built from this exact index, and how long it may take. */
const TABLE = tableFor(idx as unknown as { hashes?: Record<string, string>; passages: { text: string }[] });
const STORE_CAP_MS = 250;

/** The corpus term a misspelt token was meant as, or null. */
const nearestCorpusTerm = (t: string) => correct(t).fixes[0]?.[1] ?? null;

/** Candidates the reranker reads, and what it keeps. */
const CANDIDATES = 50;
/** BM25 score the agreement rule needs before it overrides an unknown band. */
const AGREE_LEXICAL = 4;
// Counted in sections, not passages: a passage count means a different breadth
// at every chunk size (10 passages of 123 tokens spanned about 6 sections; 10
// of 45 tokens, 2 or 3). The reranker scores every candidate; passages are kept
// in logit order until RERANK_SECTIONS distinct sections (or RERANK_CAP
// passages). Sections past the first OPEN_SECTIONS reach the model only when the
// knowledge graph proposed them.
const RERANK_SECTIONS = Number(process.env.RERANK_SECTIONS ?? 8);
const RERANK_CAP = 30;
const OPEN_SECTIONS = Number(process.env.OPEN_SECTIONS ?? 3);
/** First passages, in order, until they span `n` distinct sections. */
const bySections = <T extends { passage: Passage }>(xs: T[], n: number, cap = Infinity) => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of xs) {
    if (out.length >= cap || (!seen.has(x.passage.parent) && seen.size >= n)) break;
    seen.add(x.passage.parent);
    out.push(x);
  }
  return out;
};
const MAX_SECTIONS = 3;
/**
 * Sections answered by a fixed route and never retrieved. Work authorisation is
 * answered when asked (policy.ts AUTHORISATION_ANSWER) and must not reach any
 * other answer: with the model down, "Has he worked at Google?" matched "work"
 * and served the visa paragraph as the degraded answer (AGENT_FAULT=outage).
 */
const NEVER_RETRIEVED = new Set([...KINDS].filter(([, k]) => k === "private").map(([t]) => t));
/** Logits below the leader a reranked section may sit and still reach the model. */
// Set on the dev split: 1 cost recall (0.903 vs 0.922), 2 kept it and lifted P@5 0.67 -> 0.83.
const KEEP_WITHIN = 2;
/** The wider window a knowledge-graph section gets (set on the dev split and content/broad-dev.json). */
const KG_WITHIN = 4;

/** Present-tense questions about what the person is doing. */
const NOW = /\b(currently|current(ly)? (role|job|position|work)|right now|these days|at the moment|nowadays|presently|now)\b/i;

/** Sections of the given template kinds, corpus order. */
const ofKinds = (kinds: string[]) => [...KINDS].filter(([, k]) => kinds.includes(k)).map(([t]) => t);

/** Aggregation wording: the question wants every place, not the best one. */
export const AGGREGATE =
  /\b(across (all|every|his)|which (of his )?(projects|jobs|roles|companies|employers)|list (all|every|his)|every (job|role|project|employer)|all (of )?his (jobs|roles|projects|work)|where (has|did) he (use|used|worked with))\b/i;
/** Sections handed to the model on the graph route (MAX_SECTIONS is 3 otherwise). */
const GRAPH_MAX = 5;

/**
 * Sections the knowledge graph reaches from the question, two hops out.
 *
 *   seeds  = nodes that reach a section in two hops, with cos(query, node) >= seedFloor,
 *            within 0.2 of the best, at most 4
 *   score(section) = sum over seeds s of sim(s) * idf(s) * w(s -> section)
 *                  + 0.5 * sum over neighbours m of s: sim(s) * w(s - m) * idf(m) * w(m -> section)
 *   idf(n) = ln(1 + sections / sections n links to)
 *
 * The idf term is the precision half: a node that links to every section (a
 * language used everywhere) says little about where a thing was done. Sections
 * under a quarter of the best score are dropped. Without a query vector the
 * seeds are nodes whose label the question names outright, at sim 0.5.
 */
const KG = (() => {
  const g = idx.kg;
  if (!g) return null;
  const out = new Map<string, [string, number, string][]>();
  const link = (a: string, b: string, w: number, r: string) => out.set(a, [...(out.get(a) ?? []), [b, w, r]]);
  for (const [a, b, w, r] of g.edges) {
    link(a, b, w, r);
    if (!b.startsWith("s:")) link(b, a, w, r);
  }
  const sections = g.nodes.filter((n) => n.type === "section").length;
  const idf = (id: string) => Math.log(1 + sections / Math.max(1, (out.get(id) ?? []).filter(([t]) => t.startsWith("s:")).length));
  return { g, out, idf };
})();

export function knowledgeSections(q: number[] | null, question: string): { titles: string[]; paths: string[] } {
  if (!KG || process.env.AGENT_KG === "0") return { titles: [], paths: [] };
  const { g, out, idf } = KG;
  const text = question.toLowerCase();
  const reaches = (id: string) => (out.get(id) ?? []).some(([m]) => m.startsWith("s:") || (out.get(m) ?? []).some(([t]) => t.startsWith("s:")));
  const scored = g.nodes
    .filter((n) => n.type !== "section" && reaches(n.id))
    .map((n) => ({ n, sim: q && n.v ? n.v.reduce((x, y, i) => x + y * q[i], 0) : new RegExp(`(^|[^a-z0-9])${n.label.toLowerCase().split(": ").at(-1)!.replace(/[.+#*?()[\]]/g, "\\$&")}($|[^a-z0-9])`).test(text) ? 0.5 : 0 }))
    .sort((a, b) => b.sim - a.sim);
  const floor = q ? (g.seedFloor ?? Infinity) : 0.5;
  const seeds = scored.filter((x) => x.sim >= floor && x.sim >= scored[0].sim - 0.2).slice(0, 4);
  const score = new Map<string, number>();
  const why = new Map<string, string>();
  const credit = (t: string, v: number, path: string) => {
    score.set(t, (score.get(t) ?? 0) + v);
    if (!why.has(t)) why.set(t, path);
  };
  for (const { n, sim } of seeds) {
    for (const [m, w] of out.get(n.id) ?? []) {
      if (m.startsWith("s:")) credit(m.slice(2), sim * idf(n.id) * w, `${n.id.slice(2)} (${sim.toFixed(2)}) -> ${m.slice(2)}`);
      else for (const [t, w2] of out.get(m) ?? []) if (t.startsWith("s:")) credit(t.slice(2), 0.5 * sim * w * idf(m) * w2, `${n.id.slice(2)} (${sim.toFixed(2)}) -> ${m.slice(2)} -> ${t.slice(2)}`);
    }
  }
  const best = Math.max(0, ...score.values());
  const titles = [...score].filter(([, v]) => v >= best / 4).sort((a, b) => b[1] - a[1]).slice(0, GRAPH_MAX).map(([t]) => t).filter((t) => !NEVER_RETRIEVED.has(t));
  return { titles, paths: titles.map((t) => why.get(t)!) };
}

/** Sections the entity graph links to any entity named in the question. */
export function graphSections(question: string): string[] {
  const text = question.toLowerCase();
  const titles = Object.entries(idx.graph ?? {})
    .filter(([entity]) => new RegExp(`(^|[^a-z0-9])${entity.replace(/[.+#*?()[\]]/g, "\\$&")}($|[^a-z0-9])`).test(text))
    .flatMap(([, t]) => t);
  return [...new Set(titles)];
}

/**
 * The part of a question that is actually about the corpus.
 *
 * Select-to-ask wraps a highlighted phrase as `What does this mean: "..."`, and
 * every word of that wrapper goes into BM25 as a term. Measured: asking about
 * the dense retriever returned `Achievements` as a source, because the wrapper
 * words are common across the corpus and diluted the phrase that carried the
 * meaning. When a question wraps a quoted span of real length, that span is the
 * query; the wrapper is grammar, not signal.
 */
function core(query: string): string {
  const quoted = query.match(/["\u201c]([^"\u201d]{12,})["\u201d]/);
  return quoted ? quoted[1] : query;
}

/**
 * How far below the top result a chunk may score and still be sent to the model.
 *
 * `topK` used to be a promise as well as a ceiling: four chunks came back
 * whether or not four were relevant, so a narrow question was answered with two
 * good sections and two chosen by whatever scored above zero. Padding the
 * context with unrelated text is how a grounded answer drifts, and it is what
 * put an unrelated section under a question about retrieval.
 */
/**
 * How many passages are ranked before they are folded back into sections.
 *
 * Ten rather than four. The unit being ranked is now a 123-token passage rather
 * than a whole section, so ten passages typically resolve to three or four
 * distinct sections -- the same amount of context the model used to get, chosen
 * with far more precision, and with a second chance for a section whose best
 * passage was not its first.
 */
const PASSAGE_K = 10;

const RELEVANCE_FLOOR = 0.55;

/**
 * The same idea, applied to the keyword score when the dense half was skipped.
 *
 * Reciprocal rank fusion is deliberately flat: with one retriever running, rank
 * one scores 1/61 and rank four scores 1/64, which is a spread of five percent.
 * A floor expressed on the fused score therefore cannot cut anything on the
 * short-circuit path, and that is exactly the path where cutting matters most,
 * because nothing has cross-checked the keyword ranking.
 *
 * It showed: "why reciprocal rank fusion instead of a weighted blend" retrieved
 * the achievements section second, on the strength of the word "rank" appearing
 * in "CodeChef global rank 64". BM25 was working; the term is genuinely there.
 * Nothing downstream knew the match was an accident of vocabulary.
 *
 * The short-circuit already asserts one chunk is 2.2x clear of the next, so a
 * half-of-leader floor keeps whatever shares the leader's footing and drops
 * what the short-circuit had already declared irrelevant.
 */
const LEXICAL_FLOOR = 0.5;

/**
 * The tuning, in one exported place.
 *
 * Every one of these was a decision with a reason, and all of them lived as
 * bare module constants that nothing outside this file could read -- so the
 * page could describe the retrieval design in prose but never state the numbers
 * it actually runs on. Exported so the corpus panel reports them rather than
 * repeating them.
 */
export const RETRIEVAL_PARAMS = {
  k1: K1,
  b: B,
  rrfK: RRF_K,
  relevanceFloor: RELEVANCE_FLOOR,
  lexicalFloor: LEXICAL_FLOOR,
  topK: 4,
  passageK: PASSAGE_K,
} as const;


/**
 * Exactly the text the retrievers score, after the wrapper is stripped and
 * typos are repaired.
 *
 * Exported because anything that needs the query vector must ask for it under
 * the same key `retrieve` will use, or it pays for a second embedding of a
 * near-identical string. `/api/vector` did exactly that: it embedded the raw
 * query, `retrieve` embedded the corrected one, the process cache missed, and
 * one question cost two network round trips -- which then showed up inside the
 * timing as a 321ms "scan" that is really 0.8ms of scanning.
 */
export function searchText(query: string): string {
  return correct(core(query)).text;
}

/**
 * The source line under an answer: one name per section. Two chunks of one
 * section ("Boston University, Questrom Computational Lab" and "..., backend")
 * used to print as two near-identical chips; a title that another title
 * extends at a ", " boundary folds into the more specific one. Order kept.
 */
/**
 * The indexed passages of these sections, the unit an inline citation points
 * at. `${title}#${ordinal}` is stable across a rebuild that leaves the section
 * text alone, so a cite in a log or a trace resolves to the same passage.
 */
export function passagesOf(titles: string[]): { title: string; ordinal: number; text: string }[] {
  const want = new Set(titles);
  return idx.passages.filter((p) => want.has(p.parent)).map((p) => ({ title: p.parent, ordinal: p.ordinal, text: p.text }));
}

export function sourceTitles(chunks: { title: string }[]): string[] {
  const titles = [...new Set(chunks.map((c) => c.title))];
  return titles.filter((t) => !titles.some((o) => o !== t && o.startsWith(`${t}, `)));
}

async function retrieveRun(
  query: string,
  { topK = 4, floor = RELEVANCE_FLOOR, metric = "cosine" as Metric, deadline = Infinity, question = "" } = {},
) {
  query = core(query);
  if (isNoise(question || query)) {
    const trace: RetrievalTrace = { k: RRF_K, denseUsed: false, rows: [], band: "unknown", relevance: null, passages: idx.passages.length, noise: true };
    return { chunks: [] as Chunk[], trace, band: "unknown" as Band, best: undefined };
  }
  // Typos are repaired against the index vocabulary before scoring. BM25
  // matches exactly, so one wrong character removes a term entirely -- and on a
  // question naming a section, it also changes how the question is classified.
  const { text: corrected, fixes } = correct(query);
  const lexicalScores = bm25(corrected);
  const lexical = rankOf(lexicalScores);

  let dense = new Map<number, number>();
  let cosTop = -1;
  let qv: number[] | null = null;
  let store: "neon" | "memory" = "memory";
  let storeMs = 0;
  if (idx.vectors) {
    const q = await embedQuery(corrected, deadline, idx.embedModel);
    qv = q;
    if (q) {
      // Neon serves the dense leg when it answers inside the cap; the bundled
      // vectors are the same rows (scripts/store-parity.ts: 94/94 top-10 equal).
      const t = performance.now();
      const fromDb = metric === "cosine" ? await denseFromNeon(TABLE, q, idx.passages.length, Math.min(STORE_CAP_MS, deadline - Date.now())) : null;
      storeMs = Math.round(performance.now() - t);
      store = fromDb ? "neon" : "memory";
      const sims = fromDb ? idx.vectors.map((_, i) => fromDb.get(i) ?? -1) : idx.vectors.map((v) => similarity(q, v, metric));
      dense = rankOf(sims, true);
      if (metric === "cosine") cosTop = Math.max(...sims);
    }
  }
  const lexTop = Math.max(0, ...lexicalScores);

  const parentOf = new Map(idx.parents.map((p) => [p.title, p]));

  const fused = idx.passages.map((passage, i) => {
    const l = NEVER_RETRIEVED.has(passage.parent) ? undefined : lexical.get(i);
    const d = NEVER_RETRIEVED.has(passage.parent) ? undefined : dense.get(i);
    const score = (l ? 1 / (RRF_K + l) : 0) + (d ? 1 / (RRF_K + d) : 0);
    return {
      passage,
      score,
      best: Math.min(l ?? Infinity, d ?? Infinity),
      lexicalScore: lexicalScores[i],
    };
  });

  /**
   * Reciprocal rank fusion produces exact ties, and the tiebreak was corpus order.
   *
   * RRF is symmetric: a passage ranked 1 by keyword and 2 by embedding scores
   * exactly what a passage ranked 2 and 1 scores. That is the formula working
   * correctly, and it left `sort` to break the tie, which for a stable sort
   * means whichever passage appears earlier in the file wins -- a ranking
   * signal that is really just file layout.
   *
   * Ties break on the better single rank -- being any retriever's first choice
   * beats being two retrievers' second -- and then on keyword score, which is
   * the sharper signal on a corpus this small.
   */
  const ranked = fused
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.best - b.best || b.lexicalScore - a.lexicalScore)
    .slice(0, CANDIDATES);

  /*
   * The cross-encoder gate (lib/agent/rerank.ts) reads every candidate with the
   * question and keeps the best five, each with its logit. When it cannot be
   * reached the fused order stands and the band is never "answer": nothing has
   * judged relevance, and keyword score alone cannot (on the dev split "What did
   * he build in Rust?" scored BM25 37.5, above most answerable questions at
   * 2-41). Partial when any keyword matches, unknown when none does
   * (2026-10-10).
   */
  let shortlist = ranked.slice(0, PASSAGE_K);
  let band: Band;
  let relevance: number | null = null;
  try {
    if (process.env.RERANK === "0" || !ranked.length) throw new Error("rerank off");
    const kept = await new NvidiaRerank(CANDIDATES, deadline).compressDocuments(
      ranked.map((r, i) => new Document({ pageContent: `${r.passage.parent}\n${r.passage.context ? `${r.passage.context}\n` : ""}${r.passage.text}`, metadata: { i } })),
      corrected,
    );
    shortlist = bySections(kept.map((d) => ({ ...ranked[d.metadata.i as number], score: d.metadata.relevance as number })), RERANK_SECTIONS, RERANK_CAP);
    relevance = shortlist[0]?.score ?? null;
    band = gate(relevance, cosTop, lexTop);
    // A reranker can miss a paraphrase ("which reranker sat on top of the hybrid
    // search" scored -6.8 on its own answer). When both retrievers put the same
    // passage first and the keyword match is strong, that is independent
    // evidence: hedge rather than refuse. Set on the dev split.
    const top = ranked[0];
    const i = top ? idx.passages.indexOf(top.passage) : -1;
    if (band === "unknown" && lexical.get(i) === 1 && dense.get(i) === 1 && top.lexicalScore >= AGREE_LEXICAL) band = "partial";
  } catch {
    // Embedding down too: no calibrated signal is left to gate on, and a BM25
    // match alone rarely clears its floor. Measured under AGENT_FAULT=outage
    // that refused 15 of 32 answerable questions; any keyword match answers as
    // partial instead (degrade, never break).
    band = calibration && cosTop >= 0 ? (gate(null, cosTop, lexTop) === "unknown" ? "unknown" : "partial") : lexical.size > 0 ? "partial" : "unknown";
  }

  /*
   * Passages fold back into the sections they came from.
   *
   * The retriever ranks a 123-token passage because that is precise. The model
   * is handed the whole section because that is complete: a passage names a
   * figure, and the sentence that says what the figure measures is frequently
   * in the passage next door. Ranking small and reading large is the point of
   * splitting at all.
   *
   * A section's score is its best passage's score. Summing would reward long
   * sections for being long, which is the exact bias BM25's length
   * normalisation exists to remove.
   */
  const bySection = new Map<string, { score: number; lexicalScore: number; hits: number }>();
  for (const r of shortlist) {
    const prev = bySection.get(r.passage.parent);
    bySection.set(r.passage.parent, {
      score: Math.max(prev?.score ?? -Infinity, r.score),
      lexicalScore: Math.max(prev?.lexicalScore ?? 0, r.lexicalScore),
      hits: (prev?.hits ?? 0) + 1,
    });
  }

  const reranked = [...bySection.entries()]
    .map(([title, v]) => ({ title, ...v }))
    .sort((a, b) => b.score - a.score || b.hits - a.hits);

  // Graph route (A15). An aggregation question that names an entity gets every
  // section the entity graph links to it, fused with the reranked sections by
  // RRF: score(t) = sum over the two lists of 1 / (RRF_K + rank), rank 1-based.
  // The graph list is ordered by each section's best fused passage score.
  const asked = question || query;
  // A question shape the template defines a kind for: those sections join the
  // list by the same fusion as the graph route, and the question is never
  // refused while the corpus has a section of that kind.
  // "Now", "currently": the sections whose Role line runs to the present.
  const current = NOW.test(asked) ? idx.parents.filter((p) => p.meta?.current).map((p) => p.title) : [];
  // "in 2021", "between 2021 and 2023": dated sections whose span overlaps.
  const years = (asked.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  const span = years.length ? [Math.min(...years), Math.max(...years)] : null;
  if (span) current.push(...idx.parents.filter((p) => p.meta?.yearStart && p.meta.yearStart <= span[1] && (p.meta.yearEnd ?? 0) >= span[0]).map((p) => p.title));
  const byKind = [...new Set([...current, ...ofKinds(kindsFor(asked))])];
  const overview = byKind.length > 0;
  const kg = knowledgeSections(qv, asked);
  const linked = [...new Set([...byKind, ...(AGGREGATE.test(asked) ? graphSections(asked) : []), ...kg.titles])];
  if (overview && band === "unknown") band = "partial";
  // A question that never refers to the person, names none of their sections,
  // maps to no template kind and is not a strong match is about something else:
  // "best practices for optimizing a database query" clears every per-signal
  // floor on a technical corpus without being about anyone.
  // With the reranker down there is no logit to call a match strong; two
  // independent signals above their floors stand in for it, or BM25 alone when
  // the embedding is down too (cosTop -1).
  const strong = band === "answer" || (relevance === null && lexTop > (calibration?.floor.lexical ?? Infinity) && (cosTop < 0 || cosTop > (calibration?.floor.cosine ?? Infinity)));
  if (!overview && !strong && !PERSON.test(asked) && !HIRING_TEXT.test(asked) && !namedSections(asked).length && asked.length <= 200) band = "unknown";
  // Knowledge-graph sections are proposals, not verdicts: the cross-encoder
  // still has to place them within KG_WITHIN logits of the lead. Without this
  // veto "Is he good at Kubernetes?" pulled in three jobs whose passages merely
  // sit near it in embedding space (test P@5 0.905 -> 0.779).
  const kgOnly = new Set(kg.titles.filter((t) => !byKind.includes(t) && !(AGGREGATE.test(asked) && graphSections(asked).includes(t))));
  const fromGraph = new Set(linked.filter((t) => !kgOnly.has(t)));
  let sections = reranked.slice(0, Math.min(topK, MAX_SECTIONS));
  if (linked.length) {
    const bestFused = (t: string) => Math.max(0, ...fused.filter((r) => r.passage.parent === t).map((r) => r.score));
    const graphList = [...linked].sort((a, b) => bestFused(b) - bestFused(a));
    const rrf = (t: string) =>
      [reranked.findIndex((s) => s.title === t), graphList.indexOf(t)].reduce((sum, r) => sum + (r >= 0 ? 1 / (RRF_K + r + 1) : 0), 0);
    sections = [...new Set([...reranked.map((s) => s.title), ...graphList])]
      .sort((a, b) => rrf(b) - rrf(a))
      .slice(0, GRAPH_MAX)
      .map((title) => reranked.find((s) => s.title === title) ?? { title, score: -Infinity, lexicalScore: 0, hits: 0 });
  }

  // topK is a ceiling, not a quota. A section scoring far under the leader is
  // not evidence, it is filler, and filler in the context window is how a
  // grounded answer drifts off the question that was asked. The first result
  // always survives: a weak best match is still the best match.
  // A section the reader named leads, whatever the rankers thought of it.
  const named = namedSections(asked);
  if (named.length) {
    const find = (t: string) => sections.find((s) => s.title === t) ?? reranked.find((s) => s.title === t) ?? { title: t, score: -Infinity, lexicalScore: 0, hits: 0 };
    sections = [...named.map(find), ...sections.filter((s) => !named.includes(s.title))].slice(0, Math.max(GRAPH_MAX, named.length));
    for (const t of named) fromGraph.add(t);
    if (band === "unknown") band = "partial";
  }
  const scores = sections.map((s) => s.score).filter(Number.isFinite);
  const lead = scores.length ? Math.max(...scores) : 0;
  // With logits the floor is absolute (BANDS.partial); with fused scores it stays relative.
  const open = new Set(bySections(shortlist, OPEN_SECTIONS).map((r) => r.passage.parent));
  const kept = sections.filter((s, i) => i === 0 || fromGraph.has(s.title) || (kgOnly.has(s.title) && (relevance === null || s.score >= lead - KG_WITHIN)) || (open.has(s.title) && (relevance !== null ? s.score >= Math.max(calibration?.floor.logit ?? BANDS.partial, lead - KEEP_WITHIN) : s.score >= lead * floor)));
  const chosen = new Set(kept.map((s) => s.title));

  const trace: RetrievalTrace = {
    k: RRF_K,
    denseUsed: dense.size > 0,
    // Reported rather than applied silently. A reader who typed a word wrongly
    // should be able to see what it was read as.
    corrections: fixes,
    passages: idx.passages.length,
    store,
    storeMs,
    missing: absentNames(question || query),
    band,
    relevance,
    graph: linked.length && !overview ? linked : undefined,
    kgPaths: kg.paths.length ? kg.paths : undefined,
    kinds: overview ? byKind : undefined,
    confidence: confidenceOf(relevance, cosTop, lexTop, overview || named.length > 0, band),
    // Reported per section rather than per passage. Fifty-three rows is a
    // table; eighteen is a figure a reader can actually follow, and the section
    // is the unit the answer is grounded in.
    rows: idx.parents.map((parent) => {
      const scored = fused.filter((r) => r.passage.parent === parent.title);
      const bestLex = Math.max(0, ...scored.map((r) => r.lexicalScore));
      const lexRanks = scored.map((r) => lexical.get(idx.passages.indexOf(r.passage))).filter(Boolean) as number[];
      const denseRanks = scored.map((r) => dense.get(idx.passages.indexOf(r.passage))).filter(Boolean) as number[];
      return {
        title: parent.title,
        lexicalScore: +bestLex.toFixed(4),
        lexicalRank: lexRanks.length ? Math.min(...lexRanks) : null,
        denseRank: denseRanks.length ? Math.min(...denseRanks) : null,
        fused: +Math.max(0, ...scored.map((r) => r.score)).toFixed(6),
        selected: chosen.has(parent.title),
      };
    }),
  };

  return {
    chunks: kept.map((s) => parentOf.get(s.title)!).filter(Boolean),
    trace,
    band,
    // What a degraded answer serves: the best-ranked prose passage. A card
    // passage ("Role: ... Stack: ...") is data, not a sentence (U16).
    best: (shortlist.find((r) => !/^(Role|Stack|Measured|Links):/.test(r.passage.text.trim())) ?? shortlist[0])?.passage.text,
  };
}

/**
 * Retrieval as one traced step. With LANGSMITH_TRACING=true and a key set, the
 * run records the question, the sections chosen and the whole trace (band,
 * corrections, missing names, kinds), so a wrong answer can be followed back
 * to the step that produced it. Without them this is a plain call.
 */
export const retrieve = traceable(retrieveRun, { name: "retrieve", run_type: "retriever" });

/**
 * A pasted job description, line by line: which requirement the profile covers.
 *
 * Local only (BM25 against this corpus's own lexical floor, plus absentNames),
 * so a ten-line description costs no network call. Covered: the best section
 * clears the floor. Partial: some terms match. Missing: none do, or the line
 * names a tool the corpus never uses.
 */
export function coverage(text: string): { req: string; status: "covered" | "partial" | "missing"; section: string | null; share: number }[] {
  const lines = text
    .split(/\n+|(?<=[.;])\s+|\s*[\u2022\u00b7*-]\s+/)
    .map((l) => l.replace(/^(requirements?|responsibilities|qualifications?|nice to have)\s*:\s*/i, "").trim())
    .filter((l) => l.split(/\s+/).length >= 2 && l.length <= 300)
    .slice(0, 12);
  // Section -> its vocabulary, from the passage term frequencies.
  const vocab = new Map<string, Set<string>>();
  idx.passages.forEach((p, i) => {
    if (NEVER_RETRIEVED.has(p.parent)) return;
    const v = vocab.get(p.parent) ?? new Set<string>();
    for (const t of Object.keys(idx.tf[i])) v.add(t);
    vocab.set(p.parent, v);
  });
  const GENERIC = /^(years?|experience|building|built|build|strong|knowledge|ability|using|work|working|plus|etc|e\.g|team|teams)$/;
  return lines.map((req) => {
    const terms = queryTokens(req).filter((t) => !GENERIC.test(t) && !/^\d+\+?$/.test(t)).map((t) => (Object.hasOwn(idx.df, t) ? t : (nearestCorpusTerm(t) ?? t)));
    let best: string | null = null, hit = 0;
    for (const [title, v] of vocab) {
      const n = terms.filter((t) => v.has(t)).length;
      if (n > hit) [best, hit] = [title, n];
    }
    const unknown = terms.some((t) => !Object.hasOwn(idx.df, t));
    const share = terms.length ? hit / terms.length : 0;
    const status = share >= 2 / 3 && !unknown ? "covered" : share > 0 && !(unknown && share < 0.5) ? "partial" : "missing";
    return { req: req.slice(0, 120), status, section: status === "missing" ? null : best, share: +share.toFixed(2) };
  });
}

/**
 * The raw evidence per section: the best passage cosine and the best BM25.
 *
 * Ranks hide magnitude, and magnitude is what an absolute relevance test needs:
 * rank one of a question the corpus cannot answer is still rank one. Used by
 * scripts/agent-calibrate.ts to set thresholds on the dev split only.
 */
export async function sectionEvidence(query: string) {
  const text = searchText(query);
  const lexical = bm25(text);
  const q = idx.vectors ? await embedQuery(text, Infinity, idx.embedModel) : null;
  const cos = q && idx.vectors ? idx.vectors.map((v) => cosine(q, v)) : null;
  const out = new Map<string, { cosine: number | null; lexical: number }>();
  idx.passages.forEach((p, i) => {
    const prev = out.get(p.parent) ?? { cosine: cos ? -1 : null, lexical: 0 };
    out.set(p.parent, {
      cosine: cos ? Math.max(prev.cosine ?? -1, cos[i]) : null,
      lexical: Math.max(prev.lexical, lexical[i]),
    });
  });
  return out;
}
