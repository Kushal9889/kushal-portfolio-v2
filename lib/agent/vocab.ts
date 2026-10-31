import { index } from "./corpus-index";

/**
 * Typo tolerance, against the vocabulary the corpus actually contains.
 *
 * BM25 matches strings exactly, so a single wrong character removes a term from
 * the query entirely. Measured across five realistic typos, three broke
 * retrieval outright:
 *
 *   Growza          -> Growaza                  survived, dense covered it
 *   LangChian       -> LangChain deepagents     survived
 *   IMG Sytems      -> Questrom                 failed
 *   certifcations   -> What he is good at       failed
 *   Pytorc          -> IMG Systems              failed
 *
 * `IMG Sytems` failed worst, and not in the way it looks. The typo also defeats
 * the section-name check in query.ts, so the question was reclassified from
 * `specific` to `shipped`, and the ranking weights then actively promoted his
 * current role over the employer he had been asked about. A typo did not
 * degrade the answer; it changed the question.
 *
 * The corpus already ships its own dictionary: `df` in index.json is every term
 * the retriever knows, about thirteen hundred of them. An unknown token is
 * mapped to its nearest neighbour in that list before scoring, which is what a
 * search engine does and costs nothing at this size.
 */
const VOCAB: string[] = Object.keys((index as unknown as { df: Record<string, number> }).df);
const KNOWN = new Set(VOCAB);

/**
 * Levenshtein distance, abandoned as soon as it exceeds `max`.
 *
 * The bound is what makes this cheap: a candidate that is already too far is
 * dropped without finishing the matrix, so most of thirteen hundred comparisons
 * cost a length check and one row.
 */
function within(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) return null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return null;
    prev = row;
  }
  const d = prev[b.length];
  return d <= max ? d : null;
}

/**
 * How far a token may be from a real term and still be treated as that term.
 *
 * Scaled by length, because one wrong character in a four-letter word is a
 * different word and one wrong character in "certifications" is a typo. Tokens
 * under four characters are not corrected at all: at that length almost
 * everything is within one edit of something, and a wrong correction is worse
 * than a missing term because it retrieves confidently.
 */
function budget(token: string): number {
  if (token.length < 4) return 0;
  if (token.length < 7) return 1;
  return 2;
}

/**
 * How many characters two words share from the start.
 *
 * The tie-break that matters, and the one whose absence shipped a regression.
 * "publish" is not in this corpus -- the prose says "published" and
 * "publications" -- so it was treated as a typo and corrected to "public",
 * which is also two edits away and does appear, in the certifications section.
 * The question "What did he publish?" then ranked Certifications first.
 *
 * A word is not a typo just because a small corpus never happens to use that
 * exact inflection, and the difference is visible in the prefix: a real typo
 * diverges early, an inflection diverges at the end.
 */
function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const cache = new Map<string, string | null>();

/** The nearest real term, or null when the token is already real or too far. */
export function nearestTerm(token: string): string | null {
  if (KNOWN.has(token)) return null;
  if (cache.has(token)) return cache.get(token)!;

  /*
   * A morphological variant is not a typo.
   *
   * If the corpus contains a word that simply extends this one -- "published"
   * for "publish", "certifications" for "certification" -- that is the term
   * that was meant, and no edit-distance search should be allowed to overrule
   * it with something that merely happens to be close.
   */
  const variant = VOCAB.filter(
    (term) =>
      term !== token &&
      // The shorter side still has to be a word. Without this, "orchestrate"
      // matched the vocabulary term "or" -- the token starts with it, so the
      // stem rule fired and turned a real word into a preposition.
      term.length >= 4 &&
      Math.abs(term.length - token.length) <= 4 &&
      (term.startsWith(token) || (token.length > 5 && token.startsWith(term))),
  ).sort((a, b) => Math.abs(a.length - token.length) - Math.abs(b.length - token.length))[0];
  if (variant) {
    cache.set(token, variant);
    return variant;
  }

  const max = budget(token);
  let best: string | null = null;
  let bestDistance = max + 1;
  let bestPrefix = -1;

  // A number is never a misspelling of another number ("2021" is not "2020"),
  // and a misspelling keeps its first letter: without that rule real words were
  // "repaired" into other real words (tell -> well, know -> now, best -> test),
  // adding terms that matched the wrong passages.
  if (max > 0 && !/^\d/.test(token)) {
    for (const term of VOCAB) {
      if (term[0] !== token[0]) continue;
      const d = within(token, term, max);
      if (d === null) continue;
      const prefix = sharedPrefix(token, term);
      // Closest first; among equals, the one that diverges latest, because a
      // typo diverges early and an inflection diverges at the end.
      if (d < bestDistance || (d === bestDistance && prefix > bestPrefix)) {
        bestDistance = d;
        bestPrefix = prefix;
        best = term;
      }
    }
  }

  cache.set(token, best);
  return best;
}

/**
 * Adjacent tokens merged into a compound, when the corpus indexes it as one.
 *
 * "deep agents" and "deepagents" tokenize to different things -- two words
 * against one -- and BM25 matches tokens exactly, so a question naming a
 * compound the corpus writes as one word never reaches it. Neither half is a
 * typo: "deep" and "agents" are both real words that happen to appear
 * elsewhere in the corpus too (an IEEE paper titled "Deep Learning for
 * Contextual Bug Detection...", agentic-AI content throughout), so
 * `nearestTerm` never fires on either one and BM25 scores a confident, wrong
 * section instead of no section at all. Same additive pattern as the
 * correction below: the compound is added as an extra term, the originals
 * are never removed, so a wrong merge costs nothing and a right one recovers
 * the match.
 */
function merged(words: string[]): string {
  const tokens = words
    .map((w) => w.toLowerCase().replace(/[^a-z0-9+#.-]/g, ""))
    .filter(Boolean);
  const extra: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const pair = tokens[i] + tokens[i + 1];
    if (KNOWN.has(pair)) extra.push(pair);
  }
  return extra.join(" ");
}

/**
 * Rewrites a query so unknown tokens are scored as the terms they meant.
 *
 * The original token is kept alongside the correction rather than replaced. A
 * correction can be wrong, and keeping both means a wrong one adds a term that
 * matches nothing instead of removing one that would have matched.
 */
export function correct(query: string): { text: string; fixes: [string, string][] } {
  const fixes: [string, string][] = [];
  const words = query.split(/(\s+)/);
  const out = words.map((w) => {
    const token = w.toLowerCase().replace(/[^a-z0-9+#.-]/g, "");
    if (!token || token.length < 4) return w;
    const near = nearestTerm(token);
    if (!near) return w;
    fixes.push([token, near]);
    return `${w} ${near}`;
  });
  const compounds = merged(words);
  return { text: compounds ? `${out.join("")} ${compounds}` : out.join(""), fixes };
}
