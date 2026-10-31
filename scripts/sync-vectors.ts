import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { neon } from "@neondatabase/serverless";
import { tableFor } from "../lib/agent/store";

/**
 * Copies the built index into Neon pgvector (RAG v3 phase 3, ADR-008).
 *
 *   [AGENT_CORPUS=<dir>] npx tsx scripts/sync-vectors.ts
 *
 * One table per index build, `passages_<hash8>`, named from the index's section
 * hashes: a deploy never empties the table the live build is reading, and an
 * unchanged corpus is a no-op. Tables older than the two newest are dropped.
 * The vectors are 2,048-dim and pgvector's HNSW on `vector` stops at 2,000, so
 * the column is `halfvec`, which HNSW indexes up to 4,000. Without a URL this
 * warns and exits 0: the site serves from the bundled index either way.
 */
type Index = {
  passages: { parent: string; ordinal: number; text: string }[];
  parents: { title: string; meta?: { kind?: string; yearStart?: number; yearEnd?: number; current?: boolean } }[];
  vectors: number[][] | null;
  hashes?: Record<string, string>;
};

async function main() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) return console.warn("sync-vectors: NEON_DATABASE_URL not set, skipping (bundled index serves).");
  const dir = process.env.AGENT_CORPUS ? join(process.cwd(), process.env.AGENT_CORPUS) : join(process.cwd(), "lib/agent");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as Index;
  if (!index.vectors) throw new Error("sync-vectors: index has no vectors");
  const sql = neon(url);
  const table = tableFor(index);
  const dims = index.vectors[0].length;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  const [{ exists }] = (await sql`SELECT to_regclass(${table}) IS NOT NULL AS exists`) as { exists: boolean }[];
  if (!exists) {
    await sql.query(`CREATE TABLE ${table} (
      id integer PRIMARY KEY, parent text NOT NULL, ordinal integer NOT NULL, body text NOT NULL,
      kind text, year_start integer, year_end integer, current boolean,
      embedding halfvec(${dims}) NOT NULL, created timestamptz DEFAULT now())`);
    const meta = new Map(index.parents.map((p) => [p.title, p.meta ?? {}]));
    // One multi-row insert per 20 passages instead of one round trip each.
    for (let i = 0; i < index.passages.length; i += 20) {
      const rows = index.passages.slice(i, i + 20).map((p, j) => {
        const m = meta.get(p.parent) ?? {};
        return [i + j, p.parent, p.ordinal, p.text, m.kind ?? null, m.yearStart || null, m.yearEnd || null, !!m.current, JSON.stringify(index.vectors![i + j])];
      });
      const values = rows.map((_, r) => `(${Array.from({ length: 9 }, (_, c) => `$${r * 9 + c + 1}`).join(",")})`).join(",");
      await sql.query(`INSERT INTO ${table} (id,parent,ordinal,body,kind,year_start,year_end,current,embedding) VALUES ${values}`, rows.flat());
    }
    await sql.query(`CREATE INDEX ${table}_hnsw ON ${table} USING hnsw (embedding halfvec_cosine_ops)`);
    await sql.query(`CREATE INDEX ${table}_meta ON ${table} (kind, year_start, year_end)`);
  }
  // Keep the two newest builds per corpus prefix; older ones are unreachable.
  const prefix = table.replace(/_[0-9a-f]{8}$/, "");
  const old = (await sql`SELECT c.relname FROM pg_class c WHERE c.relkind = 'r' AND c.relname LIKE ${prefix + "\\_%"} ORDER BY c.oid DESC OFFSET 2`) as { relname: string }[];
  for (const { relname } of old) if (/^[a-z0-9_]+$/.test(relname)) await sql.query(`DROP TABLE ${relname}`);
  const plan = (await sql.query(`EXPLAIN SELECT id FROM ${table} ORDER BY embedding <=> (SELECT embedding FROM ${table} LIMIT 1) LIMIT 5`)) as { "QUERY PLAN": string }[];
  const [{ count }] = (await sql.query(`SELECT count(*)::int AS count FROM ${table}`)) as { count: number }[];
  console.log(`sync-vectors: ${table} ${count} passages ${dims}-dim ${exists ? "(unchanged)" : "(built)"}; HNSW in plan: ${plan.some((r) => /hnsw/.test(r["QUERY PLAN"]))}; dropped ${old.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
