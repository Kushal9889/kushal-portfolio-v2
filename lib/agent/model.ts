import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";

/**
 * Provider selection.
 *
 * OpenRouter, NVIDIA NIM and Groq all speak the OpenAI wire format, so one
 * ChatOpenAI client with a different baseURL covers all of them. That keeps this
 * file at one class instead of one SDK per vendor, and it means moving to a paid
 * provider is an environment change rather than a code change.
 *
 * Unset keys fall through to the next provider rather than throwing, so a missing
 * key degrades the site instead of breaking it.
 */
type ProviderName = "openrouter" | "nvidia" | "azure" | "openai";

/**
 * Request fields this provider needs that the OpenAI wire format has no name for.
 *
 * Spread into the request body through LangChain's `modelKwargs`, which is the
 * supported escape hatch for exactly this: a vendor extension that the shared
 * client does not model. Absent for providers that need nothing.
 */
type Extra = Record<string, unknown>;

const PROVIDERS: Record<
  ProviderName,
  { baseURL?: string; key?: string; model: string; extra?: Extra }
> = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    key: process.env.OPENROUTER_API_KEY,
    // Free tier. Small and fast beats clever here: answers are grounded in
    // retrieved text, so the model is summarising rather than reasoning. This is
    // a mixture-of-experts model with roughly 3B active parameters, which is what
    // keeps time-to-first-token low enough to sit in front of a visitor.
    // Checked against the provider's own model list on 2026-09-16: the previous
    // default had moved behind the paid tier and answered 404, which made the
    // whole failover chain one provider deep without saying so.
    model: process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    // Both, because OpenRouter routes to more than one upstream for this model
    // and they do not agree on how reasoning is suppressed. `exclude` is
    // OpenRouter's own field; `chat_template_kwargs` is what the NVIDIA-hosted
    // upstream reads. A provider that ignores one is unharmed by it.
    extra: { chat_template_kwargs: { thinking: false }, reasoning: { exclude: true } },
  },
  nvidia: {
    baseURL: "https://integrate.api.nvidia.com/v1",
    key: process.env.NVIDIA_API_KEY,
    // Deliberately the same model the OpenRouter entry uses. Failover should
    // change where an answer comes from, not how good it is: an earlier 8B
    // fallback answered correctly but dropped the headline metric, so a visitor
    // would have got a quietly worse site on the days the primary was capped.
    // The previous default was retired by the provider and answered 410 Gone.
    // An environment without NVIDIA_MODEL set therefore degraded every answer to
    // the retrieved passage, which is the failure this default exists to avoid.
    model: process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    /*
     * Reasoning off, at the source.
     *
     * This model generates a reasoning trace before its answer unless the chat
     * template is told otherwise, and it shipped for months with that default
     * untouched. The cost was not only the wait. Reasoning tokens count against
     * `max_tokens`, so of a 400-token budget roughly 200 went to a scratchpad
     * nobody reads and the answer took what was left -- which is why the eval
     * suite recorded five `omission` failures and grounding sat at 1 of 6. The
     * figure on the "Measured:" line was the first thing squeezed out.
     *
     * Measured against this endpoint on the shipped prompt, same question:
     *
     *   default                            2680ms   245 completion tokens
     *   `/no_think` in the system prompt    2378ms   400, capped and truncated
     *   chat_template_kwargs thinking:false  994ms    79
     *
     * The middle row is the documented toggle and it is the wrong one here: it
     * put 1747 characters of raw scratchpad into `content`, hit the cap and cut
     * mid-word. That guidance is written for Nemotron 9B v2. This is Nemotron 3,
     * and the two do not share a chat template.
     */
    extra: { chat_template_kwargs: { thinking: false } },
  },
  azure: {
    // Azure keys its deployments by name rather than by model id, so the
    // deployment is the model here. Everything else in this file is unchanged:
    // AzureChatOpenAI is a LangChain class with the same interface.
    key: process.env.AZURE_OPENAI_API_KEY,
    model: process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini",
  },
  openai: {
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  },
};

/*
 * NVIDIA first, OpenRouter second.
 *
 * OpenRouter was primary for its free tier, and that tier stopped serving this
 * model: the slug now 404s with "This model is unavailable for free. The paid
 * version is available now". Failover caught it, so nothing broke, and every
 * request paid a failed round trip to find out. The cooldown bounds that to
 * once per 15 minutes rather than once per question, which is why it stayed
 * invisible.
 *
 * NVIDIA runs the same model, so this changes where the answer comes from and
 * not how good it is. OpenRouter stays in the list: the moment its slug or its
 * tier changes back it is a working second provider, and a dead entry behind a
 * live one costs nothing.
 */
const ORDER: ProviderName[] = ["nvidia", "openrouter", "azure", "openai"];

/**
 * Published list prices, US dollars per million tokens.
 *
 * The trace has printed "$0.00 on a free tier" since it was built, which is true
 * and says nothing: every number on that panel is measured except the one that
 * matters to whoever pays the bill. These rates are what the same traffic costs
 * at list price, so the free tier reads as a decision with a known value rather
 * than as an absence of one. Unlisted models fall back to null and the line is
 * omitted rather than guessed.
 */
const RATES: Record<string, { in: number; out: number }> = {
  "nvidia/nemotron-3-nano-30b-a3b": { in: 0.04, out: 0.16 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

export function listPrice(model: string, usage: { in: number; out: number }) {
  const rate = RATES[model.replace(/:free$/, "")];
  if (!rate) return null;
  return (usage.in * rate.in + usage.out * rate.out) / 1_000_000;
}


/**
 * Which providers are currently benched, and for how long.
 *
 * Failover is the most production-shaped thing on this page and it has been
 * completely invisible: the reader sees an answer whether it came from the
 * primary or from the third fallback. Exposed read-only so the trace can say so.
 */
export function failoverState() {
  const now = Date.now();
  return ORDER.filter((n) => PROVIDERS[n].key).map((n) => ({
    name: n,
    coolingOffFor: Math.max(0, Math.round(((coolingOff.get(n) ?? 0) - now) / 1000)),
  }));
}

/**
 * Providers that recently refused, and when they may be retried.
 *
 * Free tiers fail for a day at a time, not for a request. Without this the
 * exhausted provider is tried first on every single question, and the visitor
 * pays a full failed round trip before the working provider is even called.
 * Measured at roughly two seconds of dead time per question.
 *
 * Rate limits get a long cooldown because the cap is usually daily. Other
 * failures get a short one, since those are more often transient.
 */
const coolingOff = new Map<ProviderName, number>();

const RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;
const TRANSIENT_COOLDOWN_MS = 30_000;

function benchProvider(name: ProviderName, err: unknown) {
  const message = String((err as Error)?.message ?? err);
  const rateLimited = /429|rate.?limit|quota|too many requests/i.test(message);
  coolingOff.set(name, Date.now() + (rateLimited ? RATE_LIMIT_COOLDOWN_MS : TRANSIENT_COOLDOWN_MS));
}

function isCoolingOff(name: ProviderName) {
  const until = coolingOff.get(name);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    coolingOff.delete(name);
    return false;
  }
  return true;
}

/** Every configured provider, preferred first. */
function availableProviders(): ProviderName[] {
  const preferred = process.env.LLM_PROVIDER as ProviderName | undefined;
  const configured = ORDER.filter((name) => PROVIDERS[name].key);

  const ordered =
    preferred && PROVIDERS[preferred]?.key
      ? [preferred, ...configured.filter((n) => n !== preferred)]
      : configured;

  // A provider in cooldown moves to the back rather than being dropped. If every
  // provider is cooling off the request should still be attempted, because a
  // stale cooldown is a worse failure than a retry.
  const ready = ordered.filter((n) => !isCoolingOff(n));
  return ready.length ? ready : ordered;
}

/** The model id a provider is configured to call, read from the environment per call. */
export function modelOf(name: ProviderName): string;
export function modelOf(name: string): string | null;
export function modelOf(name: string) {
  if (!(name in PROVIDERS)) return null;
  const provider = PROVIDERS[name as ProviderName];
  return name === "nvidia"
    ? (process.env.NVIDIA_MODEL ?? provider.model)
    : name === "openrouter"
      ? (process.env.OPENROUTER_MODEL ?? provider.model)
      : provider.model;
}

export function activeProvider(): ProviderName | null {
  return availableProviders()[0] ?? null;
}

function build(name: ProviderName, streaming: boolean) {
  const provider = PROVIDERS[name];
  /*
   * The model id is read per call, not once at import.
   *
   * `PROVIDERS` is a module constant, so its `model` field froze whatever the
   * environment held when the module first loaded. That is invisible in
   * production, where the environment does not change, and wrong for
   * `scripts/bench-models.ts`, which has to run the same pipeline against
   * several models in one process. A benchmark that silently measured one model
   * five times would have looked exactly like a benchmark.
   */
  const model = modelOf(name);
  const shared = {
    streaming,
    temperature: 0.1,
    /*
     * Bounded to the length that is actually served.
     *
     * This is a public endpoint and output tokens are the half of the bill a
     * stranger controls for free, but the real reason for the number is
     * latency. Profiled across thirty requests:
     *
     *   retrieve   p50    1ms   p95   338ms
     *   answer     p50 1462ms   p95  5463ms   max 11348ms
     *   output     p50  143tk   p95   569tk   max   700tk
     *
     * Generation costs about 11.9ms per output token here, so the tail is not
     * the provider being slow, it is the model being allowed to write for
     * eleven seconds. And `cleanAnswer` then trims the result to roughly 120
     * words -- so the slowest request on the page was generating four hundred
     * tokens that were deleted before a reader saw them.
     *
     * 260 is that ceiling plus room to finish a sentence: 120 words is about
     * 170 tokens on this corpus. A cut that lands mid-word is handled where it
     * has to be, in `cleanAnswer`, which drops an unterminated final sentence
     * rather than showing one.
     */
    maxTokens: Number(process.env.AGENT_MAX_OUTPUT_TOKENS ?? 260),
    // One retry only. A visitor is waiting, and a provider that failed twice is
    // better swapped than waited on.
    maxRetries: 1,
    /*
     * A hung provider is worse than a failed one.
     *
     * There was no timeout here at all, so a free tier that accepts a
     * connection and then stops responding held the request open until
     * something upstream gave up. Measured on the hero's own demo: 238,546ms
     * in the answer node, four minutes, after which the degraded path served
     * the retrieved chunk correctly -- and the page printed the four minutes as
     * its headline latency, because the number was real.
     *
     * Twenty seconds is well past the 95th percentile of a working request and
     * well short of a visitor's patience. Past it the client throws, failover
     * moves to the next provider, and if they all miss the reader gets the
     * grounded paragraph in seconds rather than minutes.
     */
    timeout: Number(process.env.AGENT_TIMEOUT_MS ?? 20_000),
    // Without this the final chunk carries no usage_metadata and the token
    // count on screen stays empty, which is the number a reader most wants
    // when the page is claiming to be cost-aware.
    streamUsage: true,
    // Vendor fields the shared client has no name for. Undefined for providers
    // that need none, which LangChain treats as absent rather than as empty.
    modelKwargs: provider.extra,
  };

  if (name === "azure") {
    return new AzureChatOpenAI({
      ...shared,
      azureOpenAIApiKey: provider.key,
      azureOpenAIApiDeploymentName: model,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
    });
  }

  return new ChatOpenAI({
    ...shared,
    apiKey: provider.key,
    model,
    configuration: provider.baseURL ? { baseURL: provider.baseURL } : undefined,
  });
}


/**
 * Calls the first working provider.
 *
 * Free tiers fail in ways a health check never sees: OpenRouter allows 50
 * model requests a day, and the 51st returns 429 with no warning. Choosing a
 * provider once at startup means the agent breaks precisely when the site is
 * getting traffic, which is the worst possible time. Each configured provider
 * is tried in turn, so a daily cap degrades to a slower answer rather than none.
 */
export async function invokeWithFailover(
  messages: { role: string; content: string }[],
  deadline = Infinity,
): Promise<{ text: string; provider: ProviderName; usage: { in: number; out: number } | null }> {
  const providers = availableProviders();
  if (providers.length === 0) throw new Error("no provider configured");

  let lastError: unknown;
  for (const name of providers) {
    try {
      const res = await withDeadline(() => build(name, false).invoke(messages), "answer", left(deadline, ANSWER_MS, FALLBACK_MS));
      const meta = (res.response_metadata?.tokenUsage ?? res.usage_metadata ?? null) as {
        promptTokens?: number;
        completionTokens?: number;
        input_tokens?: number;
        output_tokens?: number;
      } | null;

      return {
        text: typeof res.content === "string" ? res.content : "",
        provider: name,
        usage: meta
          ? {
              in: meta.promptTokens ?? meta.input_tokens ?? 0,
              out: meta.completionTokens ?? meta.output_tokens ?? 0,
            }
          : null,
      };
    } catch (err) {
      lastError = err;
      benchProvider(name, err);
      console.warn(`provider ${name} failed, trying next:`, (err as Error).message);
    }
  }
  throw lastError;
}


/**
 * Token stream, with the same failover the non-streaming path uses.
 *
 * A free tier that caps mid-answer is a real case: the generator switches to the
 * next provider and restarts, which is visible as a brief stall rather than a
 * half-finished sentence. Restarting is correct here because a partial answer
 * from one model cannot be continued coherently by another.
 */
/** How long one provider may take to answer before the next one is tried. */
const FIRST_TOKEN_MS = Number(process.env.AGENT_FIRST_TOKEN_MS ?? 6_000);

/**
 * A complete answer is allowed longer than a stream is allowed to open.
 *
 * `stream()` settles when the connection is up, which is fast or not happening;
 * `invoke()` settles only when the whole answer is written, so it has to clear
 * the slowest answers this model actually gives. The eval suite measured p95
 * 5,733ms on 2026-09-16, which the 6s stream bound sits directly on top of: a
 * slower-than-p95 answer would have been killed and degraded for no reason.
 */
const ANSWER_MS = Number(process.env.AGENT_ANSWER_MS ?? 15_000);

/**
 * The per-question budget (2026-10-10): 8 s from the question to an
 * answer or the passage fallback, whatever the provider does. Each NVIDIA call
 * gets min(its own cap, time left), so a hanging provider costs at most the
 * budget. Measured before: embed 4 s + rerank 3 s + answer 12 s = 19.0 s.
 */
export const BUDGET_MS = Number(process.env.AGENT_BUDGET_MS ?? 8_000);
/** Time a call may take: its cap, cut to what the question has left minus a reserve. */
export function left(deadline: number, cap: number, reserve = 0): number {
  return Math.max(0, Math.min(cap, deadline - Date.now() - reserve));
}
/** Kept back for the fallback answer once the model has had its turn. */
const FALLBACK_MS = 500;

/**
 * Fault injection for the degraded-path test (scripts/agent-scenarios.ts --fault).
 *
 * AGENT_FAULT=outage|429|timeout makes every NVIDIA call fail the way that
 * failure arrives in production: a refused connection and a rate limit fail at
 * once, a timeout fails only after the call's own timeout. It runs before the
 * request is sent, so the test spends no quota. Unset in every deployment.
 */
function faulted(ms: number): Promise<never> | null {
  const fault = process.env.AGENT_FAULT;
  if (!fault) return null;
  const message = fault === "429" ? "429 Too Many Requests (AGENT_FAULT)" : fault === "timeout" ? "timeout (AGENT_FAULT)" : "fetch failed (AGENT_FAULT)";
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), fault === "timeout" ? ms : 0));
}

/**
 * A deadline on one provider, not only on the whole request.
 *
 * The request timeout alone is the wrong bound when there are two providers and
 * both are refusing: each one burns its full timeout in turn while the reader
 * watches a running dot. Measured with both free tiers exhausted, that was forty
 * seconds before the degraded answer the page could have served immediately.
 * Every path that calls a provider goes through here.
 */
function withDeadline<T>(work: () => Promise<T>, what: string, ms = FIRST_TOKEN_MS): Promise<T> {
  return Promise.race([
    faulted(ms) ?? work(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} deadline`)), ms)),
  ]);
}

export async function* streamWithFailover(
  messages: { role: string; content: string }[],
  onUsage?: (usage: { in: number; out: number }) => void,
  onProvider?: (provider: ProviderName, model: string) => void,
  deadline = Infinity,
): AsyncGenerator<string> {
  const providers = availableProviders();
  if (providers.length === 0) throw new Error("no provider configured");

  let lastError: unknown;
  for (const name of providers) {
    try {
      // A deadline on the connection, not only on the whole request. Measured
      // with both providers refusing: the request timeout alone left the reader
      // watching "writing the answer" for 40 seconds before the degraded answer
      // it could have had immediately. Whichever is shorter wins.
      const stream = await withDeadline(() => build(name, true).stream(messages), "first token", left(deadline, FIRST_TOKEN_MS, FALLBACK_MS));
      // Reported once the provider has actually produced a stream rather than
      // when it was selected, so a provider that fails on connect is never
      // credited with an answer it did not give.
      onProvider?.(name, name === "nvidia" ? (process.env.NVIDIA_MODEL ?? PROVIDERS[name].model) : PROVIDERS[name].model);
      for await (const chunk of stream) {
        const text = typeof chunk.content === "string" ? chunk.content : "";
        if (text) yield text;

        // Usage arrives on the final chunk rather than alongside the tokens, so
        // it is reported through a callback instead of the generator: a consumer
        // reading text should not have to discriminate two payload shapes.
        const u = chunk.usage_metadata;
        if (u) onUsage?.({ in: u.input_tokens ?? 0, out: u.output_tokens ?? 0 });
      }
      return;
    } catch (err) {
      lastError = err;
      benchProvider(name, err);
      console.warn(`provider ${name} stream failed, trying next:`, (err as Error).message);
    }
  }
  throw lastError;
}

/**
 * Query embeddings, used only to score the dense half of retrieval.
 *
 * Chunk vectors are precomputed at build time, so this is the single embedding
 * call per question. It returns null when there is nothing to embed with, and
 * retrieval falls back to BM25 alone rather than failing.
 *
 * That promise was only half kept. A key that was absent returned null, and a
 * response that was not ok returned null -- but a network failure threw, and
 * nothing between here and the request handler caught it, so the whole graph
 * died. Observed: the endpoint accepted the connection and never sent headers,
 * undici raised UND_ERR_HEADERS_TIMEOUT after its default five minutes, and the
 * agent crashed on a question the keyword retriever could have answered on its
 * own without ever touching the network.
 *
 * This is the same defect that once made the hero print a four-minute latency,
 * in the other half of the request. That one was fixed with a timeout on the
 * model client and this one was left, because it was written as a function that
 * "returns null on failure" and read like one.
 */
/**
 * The embedding model, named once because it was named at three call sites and
 * all three died together: `nv-embedqa-e5-v5` reached end of life 2026-08-25 and
 * answers 410. build-index reports that and continues, writing `vectors: null`,
 * so the dense half of a hybrid retriever can stop existing without failing.
 *
 * Chosen by measurement, not by the migration note. NVIDIA names
 * `llama-3.2-nv-embedqa-1b-v2`; the account does not carry it, and six of the
 * seven listed embedding models answer 404. This one serves: 2048 dims, fixed
 * (the endpoint rejects every other value, so no Matryoshka slicing), 249ms.
 *
 * Index and query path must name the same model. Cosine across two embedding
 * spaces returns plausible numbers rather than an error.
 */
export const EMBED_MODEL = "nvidia/nemotron-3-embed-1b";

const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? 1_500);

/**
 * Query vectors already computed, kept for the life of the process.
 *
 * The same handful of questions are asked far more than any others: the three
 * openers in the hero, whatever a shared `?q=` link carries, and a re-asked
 * past turn. Every one of those paid the full embedding round trip -- measured
 * at 236-421ms, which is the whole of the retrieve node -- to compute a vector
 * that had already been computed minutes earlier.
 *
 * Bounded, because this is a public endpoint and the keys are strings a
 * stranger controls. At 1024 floats a vector this is a few megabytes at the
 * cap, and eviction is oldest-first, which for a query cache is close enough to
 * least-recently-used to not be worth the bookkeeping: the openers are re-asked
 * constantly and so are never the oldest for long.
 *
 * Not a persistent cache. A serverless instance that goes cold loses it, which
 * is correct -- the alternative is a store to operate for a saving measured in
 * milliseconds.
 */
const EMBED_CACHE_MAX = 256;
const embedCache = new Map<string, number[]>();

/** Same question, different capitalisation or spacing, is the same question. */
function cacheKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function embedCacheStats() {
  return { size: embedCache.size, max: EMBED_CACHE_MAX };
}

export async function embedQuery(text: string, deadline = Infinity): Promise<number[] | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;

  const cached = embedCache.get(cacheKey(text));
  if (cached) return cached;

  try {
    const ms = left(deadline, EMBED_TIMEOUT_MS);
    const res = await (faulted(ms) ?? fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        input: [text],
        model: EMBED_MODEL,
        input_type: "query",
      }),
      /*
       * 1.5 seconds (was four), against a call measured at 236-421ms.
       *
       * An order of magnitude past the observed worst case, and far short of
       * anyone's patience. Past it the dense half is simply skipped: BM25 has
       * already scored every chunk by this point at no network cost, so the
       * degraded answer is a keyword-ranked one rather than no answer. Losing
       * the better ranking is a real cost and it is not close to the cost of
       * losing the request.
       */
      signal: AbortSignal.timeout(ms),
    }));

    if (!res.ok) return null;
    const json = await res.json();
    const vector = json.data?.[0]?.embedding ?? null;
    if (vector) {
      // Oldest out first. Map preserves insertion order, so the first key is
      // the oldest one.
      if (embedCache.size >= EMBED_CACHE_MAX) {
        embedCache.delete(embedCache.keys().next().value as string);
      }
      embedCache.set(cacheKey(text), vector);
    }
    return vector;
  } catch (err) {
    // Loud in the log, silent to the reader. The question still gets answered.
    console.warn(`embedQuery failed, retrieval falls back to BM25: ${(err as Error).message}`);
    return null;
  }
}


/**
 * Cross-encoder reranking.
 *
 * The retrievers score a query and a passage separately and compare the two
 * vectors. A cross-encoder reads them together, which is strictly more
 * information and strictly more expensive: one forward pass per passage instead
 * of one lookup. It is the standard second stage in a production retrieval
 * pipeline and the standard reason to skip it is latency.
 *
 * Measured on this endpoint at 587ms for five passages, against a p50 of 666ms
 * for an entire answer. That is the number that decides whether it ships, and
 * `scripts/bench-retrieval.ts` is what answers it: at the time of writing,
 * retrieval already scores precision@1 1.00 across the eval set, and nothing
 * can improve on 1.00. It is implemented, benchmarked, and left off, so the
 * decision is a measurement rather than an omission.
 *
 * Returns null on any failure. The caller keeps the fused order, which is the
 * order it would have used anyway.
 */
export const RERANK_MODEL = process.env.RERANK_MODEL ?? "nvidia/llama-nemotron-rerank-vl-1b-v2";

export async function rerank(
  query: string,
  passages: string[],
  deadline = Infinity,
): Promise<{ index: number; score: number }[] | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key || passages.length === 0) return null;

  try {
    // The old rerank-qa-mistral-4b function returns 404 and llama-nemotron-rerank-1b-v2
    // reached end of life on 2026-08-25 (410), which is why rerank never ran.
    const rerankMs = left(deadline, Number(process.env.RERANK_TIMEOUT_MS ?? 1_500));
    const res = await (faulted(rerankMs) ?? fetch(`https://ai.api.nvidia.com/v1/retrieval/nvidia/${RERANK_MODEL.split("/")[1]}/reranking`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query: { text: query },
        passages: passages.map((text) => ({ text })),
      }),
      // Tighter than the model call. A reranker that is slow has already lost
      // the argument for using it, and the fused order is a good fallback.
      signal: AbortSignal.timeout(rerankMs),
    }));
    if (!res.ok) return null;
    const json = (await res.json()) as { rankings?: { index: number; logit: number }[] };
    return json.rankings?.map((r) => ({ index: r.index, score: r.logit })) ?? null;
  } catch (err) {
    console.warn(`rerank failed, keeping fused order: ${(err as Error).message}`);
    return null;
  }
}


/**
 * One model call with tools bound, across the same failover chain.
 *
 * Separate from `invokeWithFailover` because the two carry different payloads
 * and are asked different questions: that one is given the corpus and asked to
 * summarise it, this one is given no corpus at all and asked which action the
 * reader wants. Binding tools to the answering path instead would put roughly
 * four hundred tokens of schema into every ordinary request to serve a case
 * that arises in a small fraction of them.
 *
 * Measured on this endpoint: 440-726ms, correct tool and correct arguments on
 * every action phrasing tried, and no tool call at all on an ordinary question.
 *
 * Returns the calls rather than executing them. Execution is the caller's, and
 * there is no second turn -- nothing is fed back to the model for another
 * opinion, so the retry loop that dominates production tool-use failures has
 * nowhere to happen.
 */
export async function chooseTool(
  messages: { role: string; content: string }[],
  tools: unknown[],
  deadline = Infinity,
): Promise<{ calls: { name: string; args: Record<string, unknown> }[]; provider: ProviderName } | null> {
  const providers = availableProviders();
  if (providers.length === 0) return null;

  for (const name of providers) {
    try {
      const bound = build(name, false).bindTools(tools as never);
      const res = await withDeadline(() => bound.invoke(messages), "tool call", left(deadline, ANSWER_MS, FALLBACK_MS));
      return {
        calls: (res.tool_calls ?? []).map((c) => ({ name: c.name, args: (c.args ?? {}) as Record<string, unknown> })),
        provider: name,
      };
    } catch (err) {
      benchProvider(name, err);
      console.warn(`provider ${name} tool call failed, trying next:`, (err as Error).message);
    }
  }
  // Every provider is down. The caller degrades to prose rather than erroring.
  return null;
}
