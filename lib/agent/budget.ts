/**
 * Per-IP spend guard.
 *
 * Budgeted in tokens rather than requests, because request count is a poor proxy
 * for cost when one question can be twenty times another. A public LLM endpoint
 * with no ceiling is a way to hand a stranger your credit balance.
 *
 * The counter lives in Neon when NEON_DATABASE_URL is set, so every instance
 * draws on one daily total per address. In memory, a client that landed on five
 * warm instances got five budgets. The address is hashed before it is stored.
 * When the database is unset, slow or failing, the per-instance map below still
 * holds the line: the guard degrades, it never opens.
 */

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_TOKENS = Number(process.env.AGENT_DAILY_TOKEN_BUDGET ?? 20_000);

type Bucket = { spent: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Rough token estimate. Four characters per token is close enough to budget on. */
function estimate(text: string): number {
  return Math.ceil(text.length / 4) + Number(process.env.AGENT_MAX_OUTPUT_TOKENS ?? 400);
}

type Verdict = { ok: true; remaining: number; limit: number } | { ok: false; remaining: 0; limit: number };

function inMemory(ip: string, question: string): Verdict {
  const now = Date.now();
  const cost = estimate(question);

  let bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { spent: 0, resetAt: now + DAY_MS };
    buckets.set(ip, bucket);
  }

  if (bucket.spent + cost > DAILY_TOKENS) {
    return { ok: false, remaining: 0, limit: DAILY_TOKENS };
  }

  bucket.spent += cost;

  // Bounded so a flood of unique addresses cannot grow the map without limit.
  if (buckets.size > 5000) {
    for (const [key, b] of buckets) {
      if (now > b.resetAt) buckets.delete(key);
    }
  }

  return { ok: true, remaining: DAILY_TOKENS - bucket.spent, limit: DAILY_TOKENS };
}

const STORE_MS = 400;
let ready: Promise<unknown> | null = null;

/**
 * One upsert per question: add this question's cost to today's row and read the
 * new total back. A failed or slow write falls back to the in-memory guard, so
 * the limit still holds when the database does not.
 */
export async function checkBudget(ip: string, question: string): Promise<Verdict> {
  const url = process.env.NEON_DATABASE_URL;
  if (!url || process.env.AGENT_STORE === "memory" || process.env.AGENT_FAULT === "neon") return inMemory(ip, question);
  const cost = estimate(question);
  const key = createHash("sha256").update(`budget:${ip}`).digest("hex").slice(0, 32);
  const sql = neon(url);
  const run = (async () => {
    ready ??= sql.query("CREATE TABLE IF NOT EXISTS agent_budget (key text, day date, spent int NOT NULL, PRIMARY KEY (key, day))");
    await ready;
    const rows = (await sql.query(
      `INSERT INTO agent_budget (key, day, spent) VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (key, day) DO UPDATE SET spent = agent_budget.spent + $2
       WHERE agent_budget.spent + $2 <= $3
       RETURNING spent`,
      [key, cost, DAILY_TOKENS],
    )) as { spent: number }[];
    return rows;
  })();
  // The race can leave `run` behind; a late failure must not surface as unhandled.
  run.catch(() => (ready = null));
  const timer = new Promise<null>((r) => setTimeout(() => r(null), STORE_MS).unref?.());
  try {
    const rows = await Promise.race([run, timer]);
    if (!rows) return inMemory(ip, question);
    // No row back means the WHERE refused the add: today's total would pass the limit.
    if (rows.length === 0) return { ok: false, remaining: 0, limit: DAILY_TOKENS };
    return { ok: true, remaining: DAILY_TOKENS - Number(rows[0].spent), limit: DAILY_TOKENS };
  } catch {
    ready = null;
    return inMemory(ip, question);
  }
}
