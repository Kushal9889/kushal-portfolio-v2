import { failoverState, RATE_LIMIT_COOLDOWN_MS, TRANSIENT_COOLDOWN_MS, ANSWER_TIMEOUT_MS, EMBED_TIMEOUT_MS } from "@/lib/agent/model";
import { STORE_CAP_MS } from "@/lib/agent/retrieve";
import { LOAD_CACHE_MS } from "@/lib/journeys";
import vitals from "@/lib/agent/vitals.json";
import { calibration, index } from "@/lib/agent/corpus-index";
import { PROMPT_VERSION } from "@/lib/agent/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the agent can serve right now, without calling a model: configured
 * providers and which are cooling off, whether the index has vectors and floors,
 * whether a database is configured, and the prompt version. 200 when an answer
 * path exists, 503 when none does.
 */
export function GET() {
  const idx = index as { passages: unknown[]; vectors: unknown[] | null };
  const providers = failoverState();
  const body = {
    ok: providers.length > 0 || idx.passages.length > 0,
    providers,
    passages: idx.passages.length,
    dense: !!idx.vectors,
    calibrated: !!calibration,
    store: process.env.NEON_DATABASE_URL ? "neon+memory" : "memory",
    reranker: !!process.env.NVIDIA_API_KEY,
    prompt: PROMPT_VERSION,
    // How long a refusing provider rests before it is tried first again.
    cooldown: { rateLimitedMs: RATE_LIMIT_COOLDOWN_MS, transientMs: TRANSIENT_COOLDOWN_MS },
    // The time budgets the code enforces, read from the constants themselves.
    limits: { answerMs: ANSWER_TIMEOUT_MS, embedMs: EMBED_TIMEOUT_MS, storeMs: STORE_CAP_MS, loadCacheMs: LOAD_CACHE_MS },
    // The last measured runs, written by scripts/vitals.ts from docs/agent-bench.
    measured: vitals,
  };
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
