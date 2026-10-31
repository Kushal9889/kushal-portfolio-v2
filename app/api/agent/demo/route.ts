import { ask } from "@/lib/agent/graph";
import { listPrice, modelOf } from "@/lib/agent/model";
import type { RetrievalTrace } from "@/lib/agent/retrieve";
import { LOAD_QUESTION, LOAD_CACHE_MS } from "@/lib/journeys";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The hero's one query.
 *
 * Runs a fixed question through the real graph and returns what it measured.
 * The hero renders measured numbers or none at all, which is the whole point: a
 * hardcoded latency is the easiest claim on a page like this to check and the
 * most damaging one to get caught on.
 *
 * It used to return the per-node timings and discard everything else `ask()`
 * produced -- the token usage, which provider served it, the total. The
 * telemetry strip in the hero then had a bar and no numbers beside it on first
 * load, because the only request a visitor who asks nothing ever makes is this
 * one. Cost and provider were measured and thrown away one function call before
 * the thing that wanted them.
 *
 * Cached briefly so a burst of visitors does not each pay for the same answer.
 * The timings stay honest because they are the timings of a real run; the cache
 * window just decides how recent that run was.
 */
const QUESTION = LOAD_QUESTION;
const TTL_MS = LOAD_CACHE_MS;

/**
 * Past this, the request did not succeed slowly -- it failed and took its time.
 *
 * The client now times out at twenty seconds and fails over, so nothing should
 * reach this. It stayed in because the failure it guards against was real and
 * silent: a provider accepted the connection and stopped responding, the graph
 * degraded correctly to the retrieved paragraph, and the hero published the
 * 238,993ms it had honestly measured as its headline latency. A number being
 * true is not sufficient reason to lead with it.
 */
const IMPLAUSIBLE_MS = 30_000;

type Demo = {
  /** The question, returned rather than duplicated in the hero. */
  question: string;
  /** What it actually said. The hero printed timings for a request whose answer
   *  it discarded, so the strongest thing this page does -- answer a real
   *  question about him, correctly, in under two seconds -- was invisible to
   *  anyone who did not type. */
  answer: string;
  sources: string[];
  timings: Record<string, number>;
  total: number;
  usage: { in: number; out: number } | null;
  provider: string | null;
  /** The ranking behind `sources`, so the corpus field can light what was retrieved. */
  trace: RetrievalTrace | null;
  /** What the same tokens cost at the serving model's published list price, in US dollars. Null when unlisted. */
  listPrice: number | null;
  /** When this run finished, epoch ms. A cache hit returns the same value, so the age a reader is shown is the age of the run. */
  ranAt: number;
};

let cached: { at: number; demo: Demo } | null = null;

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return Response.json(cached.demo, {
      headers: { "cache-control": "public, max-age=30" },
    });
  }

  try {
    const { answer, sources, timings, total, usage, provider, trace } = await ask(QUESTION);
    const demo: Demo = {
      question: QUESTION,
      answer: (answer ?? "").toString(),
      sources: sources ?? [],
      timings,
      total,
      usage: usage ?? null,
      provider: provider ?? null,
      trace: trace ?? null,
      listPrice: usage && provider && modelOf(provider) ? listPrice(modelOf(provider)!, usage) : null,
      ranAt: Date.now(),
    };
    // Not cached and not served. The hero renders its unreachable copy, which
    // is what actually happened, rather than a four-minute figure.
    if (demo.total > IMPLAUSIBLE_MS) return new Response(null, { status: 503 });

    cached = { at: Date.now(), demo };
    return Response.json(demo, { headers: { "cache-control": "public, max-age=30" } });
  } catch {
    // The hero handles this by showing the graph structure with no numbers.
    return new Response(null, { status: 503 });
  }
}
