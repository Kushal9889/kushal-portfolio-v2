import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "../lib/content";
import { chunkSection, sentences, estimateTokens, BREAK_BELOW, type Passage } from "../lib/agent/chunk";
import { indexTokens } from "../lib/agent/tokenize";
import { EMBED_MODEL } from "../lib/agent/model";

/**
 * Builds the retrieval index at compile time.
 *
 * Everything expensive happens here so the request path does none of it: no
 * indexing, no database, no network handshake to a vector store. The corpus is
 * small enough that the whole index is a JSON file bundled with the function,
 * which makes retrieval a memory read instead of a round trip. At this size a
 * vector database would add latency and operational surface without buying
 * anything back.
 */

// The index and the query are tokenised by the same function, in one place.
// They were two near-copies that nothing kept in step.
const tokenize = indexTokens;

/**
 * Heading terms outweigh body terms by this much. At 2 -- what pasting the
 * heading in twice produced -- "What bug did he find in LangChain?" ranked
 * Publications first. At 6 every lexical case in integration.test.ts passes.
 * Higher is not free: the title field is tiny, so a large weight lets any
 * passage of a section beat the one that holds the answer.
 */
const TITLE_WEIGHT = 6;

/**
 * The embedding model accepts 512 tokens and nothing was enforcing it.
 *
 * A section that grew past the limit returned 400, the whole request failed, and
 * `embedPassages` returned null for every chunk in the corpus -- so one long
 * paragraph silently downgraded the entire site to keyword-only retrieval and
 * took the projection figure with it. The only signal was one warning line in a
 * build log nobody reads. This is exactly the class of failure the page is about,
 * and it shipped here.
 *
 * The fix is not to cut prose to fit an API limit. Long passages are split into
 * windows on paragraph boundaries, each window is embedded, and the results are
 * mean-pooled into one vector for the chunk. That is the standard treatment for
 * a passage longer than a model's context, it keeps one vector per chunk so
 * retrieval and the projection are unchanged, and the corpus stays whatever
 * length it needs to be.
 *
 * 1400 characters is deliberately conservative against the 512-token limit:
 * this corpus measures about 1.4 tokens per word, and a hard failure here costs
 * the whole index.
 */
const WINDOW_CHARS = 1400;

function windows(text: string): string[] {
  if (text.length <= WINDOW_CHARS) return [text];

  const out: string[] = [];
  let current = "";
  // Paragraphs first, then sentences for a single paragraph that is itself over
  // the limit. Splitting mid-sentence would embed a fragment whose meaning is
  // not the meaning of the passage it came from.
  for (const para of text.split(/\n{2,}/)) {
    for (const piece of para.length > WINDOW_CHARS ? para.split(/(?<=\.)\s+/) : [para]) {
      if (current && current.length + piece.length > WINDOW_CHARS) {
        out.push(current.trim());
        current = "";
      }
      current += (current ? " " : "") + piece;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Mean of the window vectors, renormalised so cosine stays well behaved. */
function pool(vectors: number[][]): number[] {
  if (vectors.length === 1) return vectors[0];
  const mean = vectors[0].map(
    (_, d) => vectors.reduce((sum, v) => sum + v[d], 0) / vectors.length,
  );
  const norm = Math.hypot(...mean) || 1;
  return mean.map((v) => v / norm);
}

/**
 * Batched embeddings for an arbitrary list of strings.
 *
 * Used twice per build and for different units: once per sentence, to find the
 * points where meaning changes, and once per passage, to index. Both go through
 * the same model, because a query is scored against passage vectors and the two
 * sides have to live in the same space.
 */
async function embedAll(texts: string[], inputType: "query" | "passage"): Promise<number[][] | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 8) {
    const batch = texts.slice(i, i + 8);
    const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ input: batch, model: EMBED_MODEL, input_type: inputType }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`build-index: embedding failed (${res.status}) ${detail.slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    for (const d of json.data as { embedding: number[] }[]) out.push(d.embedding);
  }
  return out;
}

/** Query-time embeddings come from the same model, so both sides must match. */
async function embedPassagesLegacy(texts: string[]): Promise<number[][] | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    console.warn(
      "build-index: NVIDIA_API_KEY not set, building lexical-only index.\n" +
        "  Retrieval will run BM25 alone. Set the key and rebuild to enable hybrid search.",
    );
    return null;
  }

  // Every chunk becomes one or more windows, each tagged with the chunk it came
  // from, so the flat list can be batched and then pooled back.
  const pieces = texts.flatMap((text, chunk) => windows(text).map((body) => ({ chunk, body })));
  const oversized = pieces.length - texts.length;
  if (oversized > 0) {
    console.log(`build-index: ${oversized} extra window(s) for passages over ${WINDOW_CHARS} chars`);
  }

  const perChunk: number[][][] = texts.map(() => []);
  // Batched to stay inside the endpoint's per-request input limit.
  for (let i = 0; i < pieces.length; i += 8) {
    const slice = pieces.slice(i, i + 8);
    const batch = slice.map((p) => p.body);
    const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        input: batch,
        model: EMBED_MODEL,
        input_type: "passage",
      }),
    });
    if (!res.ok) {
      // Loud, and it names the chunk. A key that is absent is a supported state;
      // a key that is present and rejected is a corpus or model problem, and
      // reporting it as "falling back to BM25" is how this went unnoticed.
      const detail = await res.text().catch(() => "");
      console.error(
        `build-index: embedding request failed (${res.status}) on chunk ` +
          `"${texts[slice[0].chunk].slice(0, 60)}..." ${detail.slice(0, 200)}`,
      );
      return null;
    }
    const json = await res.json();
    json.data.forEach((d: { embedding: number[] }, n: number) => {
      perChunk[slice[n].chunk].push(d.embedding);
    });
  }

  return perChunk.map(pool);
}

async function main() {
  const { sections } = loadContent();

  /*
   * The parent unit: everything a section knows, as the model will see it.
   *
   * Role and stack are folded in because they carry the rarest terms in the
   * corpus. Metrics and artifacts are folded in because they are already
   * structured, already checked by the facts gate, and passing them as prose
   * and hoping the model notices is throwing away metadata we own -- "-30%" and
   * "#4925" are the rarest strings here.
   */
  const parents = sections.map((s) => ({
    title: s.title,
    body: [
      s.role && `Role: ${s.role}`,
      s.stack.length && `Stack: ${s.stack.join(", ")}`,
      s.metrics.length && `Measured: ${s.metrics.map((m) => `${m.value} ${m.label}`).join("; ")}`,
      s.artifacts.length &&
        `Links: ${s.artifacts.map((a) => `${a.kind} (${a.state}) ${a.label} ${a.url}`).join("; ")}`,
      s.body,
    ]
      .filter(Boolean)
      .join("\n"),
    source: s.source,
    meta: {
      fromNotes: s.source !== "facts",
      dated: Boolean(s.roleParts.dates),
      current: /present|current/i.test(s.roleParts.dates),
      year: Math.max(0, ...(s.roleParts.dates.match(/\b(20\d{2})\b/g) ?? []).map(Number)),
      metrics: s.metrics.length,
      artifacts: s.artifacts.length,
    },
  }));

  /*
   * Sentence embeddings, used only to find where meaning changes.
   *
   * These are not indexed and never reach the request path. They exist so the
   * split happens at a topic boundary rather than at a character count, which
   * is the whole difference between semantic chunking and a text splitter.
   */
  const sentenceIndex: { parent: number; text: string }[] = [];
  for (const [i, p] of parents.entries()) {
    for (const text of sentences(p.body)) sentenceIndex.push({ parent: i, text });
  }
  console.log(`build-index: ${sentenceIndex.length} sentences across ${parents.length} sections`);

  const sentenceVectors = await embedAll(
    sentenceIndex.map((s) => s.text),
    "passage",
  );

  if (sentenceVectors) {
    /*
     * The distribution the break threshold is read from.
     *
     * Printed on every build so BREAK_BELOW stays a measurement rather than a
     * number somebody once liked. If the corpus changes shape this is where it
     * shows.
     */
    const sims: number[] = [];
    for (let i = 1; i < sentenceIndex.length; i++) {
      if (sentenceIndex[i].parent !== sentenceIndex[i - 1].parent) continue;
      const a = sentenceVectors[i - 1];
      const b = sentenceVectors[i];
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let d = 0; d < a.length; d++) {
        dot += a[d] * b[d];
        na += a[d] * a[d];
        nb += b[d] * b[d];
      }
      sims.push(dot / (Math.sqrt(na) * Math.sqrt(nb) || 1));
    }
    sims.sort((x, y) => x - y);
    const at = (q: number) => sims[Math.floor(sims.length * q)]?.toFixed(3) ?? "-";
    console.log(
      `build-index: adjacent-sentence similarity  p10 ${at(0.1)}  p25 ${at(0.25)} ` +
        `p50 ${at(0.5)}  p90 ${at(0.9)}   (breaking below ${BREAK_BELOW})`,
    );
  }

  // Split each section, giving the chunker the sentence vectors for that
  // section only. A boundary is never allowed to cross a heading.
  const passages: Passage[] = [];
  let cursor = 0;
  for (const [i, p] of parents.entries()) {
    const count = sentences(p.body).length;
    const vectors = sentenceVectors ? sentenceVectors.slice(cursor, cursor + count) : undefined;
    cursor += count;
    passages.push(...chunkSection(p.title, p.body, vectors));
  }

  const sizes = passages.map((p) => p.tokens).sort((a, b) => a - b);
  console.log(
    `build-index: ${passages.length} passages  tokens min ${sizes[0]} ` +
      `p50 ${sizes[Math.floor(sizes.length / 2)]} max ${sizes[sizes.length - 1]}`,
  );

  /*
   * BM25 is built over passages, not sections, and the heading is scored as its
   * own field.
   *
   * A term in a section's heading says what the passage is about; the same term
   * in running prose says only that it was mentioned. Those are different
   * signals and they were being counted as one, because the heading was pasted
   * into the body text twice and then tokenised together with it.
   *
   * Twice was not enough. "What bug did he find in LangChain?" returned
   * Publications ahead of the section titled "Open source, LangChain
   * deepagents": the publications text names bug detection three times and
   * cross-references LangChain once, so it carried more of the query's terms
   * than the section the question is actually about.
   *
   * This is the field-weighted form. Per-field term frequencies are summed with
   * a weight and the result is handed to the single saturation function in
   * `bm25()`, rather than each field being scored separately and the scores
   * added. Scoring fields apart and combining afterwards breaks the saturation
   * curve BM25 depends on, which is the documented failure mode of the naive
   * version and the reason this is not a second retriever fused by rank.
   *
   * The weight is a float, so it is a dial rather than a repeat count.
   */
  const docs = passages.map((p) => ({
    title: tokenize(p.parent),
    body: tokenize(p.text),
  }));

  const tf = docs.map(({ title, body }) => {
    const counts: Record<string, number> = {};
    for (const t of body) counts[t] = (counts[t] ?? 0) + 1;
    for (const t of title) counts[t] = (counts[t] ?? 0) + TITLE_WEIGHT;
    return counts;
  });

  const df: Record<string, number> = {};
  for (const counts of tf) {
    for (const term of Object.keys(counts)) df[term] = (df[term] ?? 0) + 1;
  }

  // Length has to be measured on the same weighted counts the scores are, or
  // the normalisation divides by a document length the tf above no longer has.
  const lengths = docs.map((d) => d.body.length + d.title.length * TITLE_WEIGHT);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // Every passage now fits the model's window by construction, so there is no
  // windowing and no mean-pooling. That pooling was averaging three
  // semantically different windows into one vector that represented none of
  // them, on exactly the sections that explain how this page works.
  const vectors = await embedAll(
    passages.map((p) => `${p.parent}\n${p.text}`),
    "passage",
  );

  const out = { passages, parents, tf, lengths, df, avgLength, vectors };
  const path = join(process.cwd(), "lib", "agent", "index.json");

  writeFileSync(path, JSON.stringify(out));

  const size = (JSON.stringify(out).length / 1024).toFixed(0);
  console.log(
    `build-index: ${passages.length} passages from ${parents.length} sections, ` +
      `${Object.keys(df).length} terms, ${vectors ? `${vectors[0].length}-dim` : "lexical only"}, ${size}KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
