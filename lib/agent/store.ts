import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

/**
 * The dense leg served from Neon pgvector (ADR-008).
 *
 * Only the vector search moves to the database. BM25, fusion, the reranker and
 * the gate stay in process, so the database changes where cosine is computed
 * and nothing else: the parity test (scripts/store-parity.ts) holds the two
 * rankings equal. The table is the one built from this exact index
 * (scripts/sync-vectors.ts), so a deploy never reads another build's rows.
 */
export function tableFor(index: { hashes?: Record<string, string>; passages: { text: string }[] }): string {
  const corpus = (process.env.AGENT_CORPUS ?? "site").replace(/[^a-z0-9]+/gi, "_").toLowerCase().replace(/^_+|_+$/g, "").slice(-20) || "site";
  const hash = createHash("sha256").update(JSON.stringify(index.hashes ?? index.passages.map((p) => p.text))).digest("hex").slice(0, 8);
  return `passages_${corpus}_${hash}`;
}

/**
 * Cosine similarity of the query to every passage, by passage id, or null when
 * the database is unset, slow or failing. The caller falls back to the bundled
 * index, which holds the same vectors. `limit` is every passage: the fusion
 * ranks them all, and at this size an exact scan is what HNSW returns.
 */
export async function denseFromNeon(table: string, query: number[], limit: number, timeoutMs: number): Promise<Map<number, number> | null> {
  const url = process.env.NEON_DATABASE_URL;
  if (!url || process.env.AGENT_STORE === "memory" || process.env.AGENT_FAULT === "neon" || timeoutMs <= 0) return null;
  const sql = neon(url);
  const q = JSON.stringify(query);
  const run = sql.transaction([
    // Default ef_search is 40; asking for every passage needs at least that many candidates.
    sql.query(`SET LOCAL hnsw.ef_search = ${Math.max(40, limit)}`),
    sql.query(`SELECT id, 1 - (embedding <=> $1::halfvec) AS cos FROM ${table} ORDER BY embedding <=> $1::halfvec LIMIT ${limit}`, [q]),
  ]);
  const timer = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs).unref?.());
  try {
    const out = await Promise.race([run, timer]);
    if (!out) return null;
    const rows = (out as unknown as { id: number; cos: number }[][])[1];
    return new Map(rows.map((r) => [r.id, Number(r.cos)]));
  } catch {
    return null;
  }
}
