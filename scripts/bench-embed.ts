import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * Dense leg alone, NVIDIA vs a Gemini embedding model, on a locked eval file.
 *
 *   npx tsx scripts/bench-embed.ts [content/blind-eval.json] [gemini-embedding-2] [dims]
 *
 * Passages are embedded as "<section title>\n<text>" by both, the same string
 * build-index embeds. Each question's sections are ranked by their best passage
 * cosine; nDCG@5 and recall@5 against the file's graded labels, plus MRR.
 * Measures retrieval quality of the vectors only, not the fused pipeline.
 */
const AGENT_EVAL_CACHE = (process.env.AGENT_EVAL_CACHE ??= "1");
void AGENT_EVAL_CACHE;
const file = process.argv[2] ?? "content/blind-eval.json";
const MODEL = process.argv[3] ?? "gemini-embedding-2";
const DIMS = process.argv[4] ? Number(process.argv[4]) : undefined;
const K = 5;

const idx = JSON.parse(readFileSync("lib/agent/index.json", "utf8")) as { passages: { parent: string; text: string }[]; vectors: number[][] };
const evals = JSON.parse(readFileSync(file, "utf8")) as { sections: Record<string, string>; cases: { q: string; rel: Record<string, number> }[] };
const cases = evals.cases.filter((c) => Object.keys(c.rel).length);

async function gemini(texts: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({ requests: texts.slice(i, i + 100).map((t) => ({ model: `models/${MODEL}`, content: { parts: [{ text: t }] }, taskType: task, ...(DIMS ? { outputDimensionality: DIMS } : {}) })) }),
    });
    if (!res.ok) throw new Error(`${MODEL} ${res.status} ${(await res.text()).slice(0, 200)}`);
    out.push(...((await res.json()) as { embeddings: { values: number[] }[] }).embeddings.map((e) => e.values));
  }
  return out.map((v) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  });
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
function score(qv: number[][], pv: number[][]) {
  let ndcg = 0, recall = 0, mrr = 0;
  cases.forEach((c, n) => {
    const best = new Map<string, number>();
    idx.passages.forEach((p, i) => best.set(p.parent, Math.max(best.get(p.parent) ?? -1, dot(qv[n], pv[i]))));
    const ranked = [...best].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const rel = Object.fromEntries(Object.entries(c.rel).map(([k, g]) => [evals.sections[k], g]));
    const dcg = ranked.slice(0, K).reduce((s, t, i) => s + (2 ** (rel[t] ?? 0) - 1) / Math.log2(i + 2), 0);
    const ideal = Object.values(rel).sort((a, b) => b - a).slice(0, K).reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);
    ndcg += ideal ? dcg / ideal : 1;
    const relevant = Object.keys(rel).filter((t) => rel[t] > 0);
    recall += relevant.filter((t) => ranked.slice(0, K).includes(t)).length / relevant.length;
    const first = ranked.findIndex((t) => rel[t] > 0);
    mrr += first >= 0 ? 1 / (first + 1) : 0;
  });
  const m = cases.length;
  return { ndcg5: +(ndcg / m).toFixed(3), recall5: +(recall / m).toFixed(3), mrr: +(mrr / m).toFixed(3) };
}

async function main() {
  const { embedQuery, embedTexts, NVIDIA_EMBED_MODEL } = await import("../lib/agent/model");
  const nvQ: number[][] = [];
  for (const c of cases) nvQ.push((await embedQuery(c.q, Infinity, NVIDIA_EMBED_MODEL))!);
  // The NVIDIA side reads the index's vectors only while the index is NVIDIA-built.
  const nvP = (idx as { embedModel?: string }).embedModel?.startsWith("gemini")
    ? (await embedTexts(idx.passages.map((p) => `${p.parent}\n${p.text}`), "passage", NVIDIA_EMBED_MODEL))!
    : idx.vectors;
  const t0 = performance.now();
  const gP = await gemini(idx.passages.map((p) => `${p.parent}\n${p.text}`), "RETRIEVAL_DOCUMENT");
  const gQ = await gemini(cases.map((c) => c.q), "RETRIEVAL_QUERY");
  const geminiMs = Math.round(performance.now() - t0);
  const rows = { file, cases: cases.length, nvidia: score(nvQ, nvP), [MODEL]: { ...score(gQ, gP), dims: gP[0].length, batchMs: geminiMs } };
  console.log(JSON.stringify(rows, null, 1));
  writeFileSync(join("docs/agent-bench", `embed-${new Date().toISOString().slice(0, 10)}-${MODEL}${DIMS ? `-${DIMS}` : ""}-${file.split("/").at(-1)}`), JSON.stringify(rows, null, 1));
}

main();
