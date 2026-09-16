import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { invokeWithFailover, activeProvider, chooseTool } from "./model";
import { toolSchemas, openEvidence, composeIntro, runEval, type ToolResult } from "./tools";
import { retrieve, type Chunk, type RetrievalTrace } from "./retrieve";
import { analyze } from "./query";
import {
  classify,
  systemPrompt,
  cleanAnswer,
  deflection,
  handoffAnswer,
  AUTHORISATION_ANSWER,
} from "./policy";

/**
 * The agent behind this site.
 *
 *                     ┌──▶ retrieve ──▶ answer ──▶ END
 *   START ──▶ route ──┼──▶ deflect ──────────────▶ END
 *                     └──▶ handoff ──────────────▶ END
 *
 * Compiled without a checkpointer. LangGraph persists state after every node by
 * default, which is the right default for long-running stateful agents and the
 * wrong one here: a Postgres saver costs 20-50ms per write, and this graph runs
 * three nodes to answer a question in a conversation that lives in the browser
 * tab. Conversation history is passed in per request instead.
 *
 * That last sentence was false for as long as it was written here. Nothing
 * accepted history, so the trade being described -- durability given up for
 * latency, with the conversation carried by the client -- was only half
 * implemented: the durability was gone and the conversation was too. The
 * streaming path in stream.ts now takes the history the browser holds, which is
 * what makes the decision above an actual decision rather than an omission with
 * a paragraph attached.
 *
 * This graph stays single-turn on purpose. It backs the eval suite and the
 * hero's measured trace, where a settled answer to one stated question is
 * exactly what should be asserted against.
 */

const State = Annotation.Root({
  question: Annotation<string>,
  intent: Annotation<string>,
  chunks: Annotation<Chunk[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  reply: Annotation<string>,
  /** The question as the model receives it. See `asked` in query.ts. */
  asked: Annotation<string>,
  /** Token usage reported by the provider. Absent when no model was called. */
  usage: Annotation<{ in: number; out: number } | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  /**
   * The fusion the retriever performed, carried on the state rather than thrown
   * away at the node boundary.
   *
   * retrieve() has always built a complete trace and the streaming path has
   * always forwarded it, but the graph dropped it on the floor, so anything not
   * driven by a browser -- the eval suite, the prewarm script, a future export --
   * could not see which half of the hybrid retriever decided the answer. The
   * suite now counts how often the embedding round trip was skipped, which is a
   * number the page publishes.
   */
  trace: Annotation<RetrievalTrace | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  /** What the agent did, when the question was an instruction rather than a question. */
  action: Annotation<ToolResult | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  /** Which provider served the answer. Failover is real and was never visible. */
  provider: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  /** Per-node wall time, surfaced in the trace panel and the hero. */
  timings: Annotation<Record<string, number>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
});

type S = typeof State.State;

/** Wraps a node so every one of them is timed the same way, with no per-node bookkeeping. */
function timed(name: string, fn: (s: S) => Promise<Partial<S>>) {
  return async (state: S): Promise<Partial<S>> => {
    const start = performance.now();
    const result = await fn(state);
    return { ...result, timings: { [name]: Math.round(performance.now() - start) } };
  };
}

const route = timed("route", async (state) => ({
  intent: classify(state.question),
}));

const retrieveNode = timed("retrieve", async (state) => {
  const { query, weight, asked, floor } = analyze(state.question);
  const { chunks, trace } = await retrieve(query, 4, weight, floor);
  return { chunks, trace, asked };
});

const answer = timed("answer", async (state) => {
  const context = state.chunks.map((c) => `## ${c.title}\n${c.body}`).join("\n\n");

  // No provider configured, or every one of them failed. Returning the retrieved
  // source beats an error: the visitor still gets the grounded material, just
  // unsummarised, and the page around it keeps working.
  const fallback = () => ({
    reply: state.chunks[0]?.body.split("\n\n")[0] ?? deflection(state.question),
    usage: null,
    provider: null,
  });

  if (!activeProvider()) return fallback();

  try {
    const { text, usage, provider } = await invokeWithFailover([
      { role: "system", content: systemPrompt(context) },
      { role: "user", content: state.asked || state.question },
    ]);
    // Stripped here rather than inside the provider adapter: the adapter's job
    // is transport, and reasoning leakage is a property of the answer.
    // A limit is only welcome when the question asked for one.
    const reply = cleanAnswer(
      state.intent === "handoff" ? handoffAnswer(text) : text,
      analyze(state.question).intent === "limitation",
    );

    // Nothing survived the clean, so the reply was scratchpad end to end. The
    // retrieved section is a worse answer and a far better outcome than a model
    // thinking out loud under his name.
    if (!reply.trim()) return fallback();

    return { reply, usage, provider };
  } catch {
    return fallback();
  }
});

/**
 * The tool path, on the non-streaming graph.
 *
 * The same shape as the streaming one and for the same reason: one model call,
 * no corpus, no second turn. It exists here so the eval suite can assert that
 * "pull up his LinkedIn" is executed rather than answered, and so the two paths
 * cannot drift into behaving differently -- which is the failure the streaming
 * path has already had twice, once on the handoff line and once on degradation.
 */
const act = timed("act", async (state) => {
  const chosen = await chooseTool(
    [
      {
        role: "system",
        content:
          `You act on behalf of a visitor reading a portfolio. ` +
          `Call exactly one tool for what they asked. Never call more than one.`,
      },
      { role: "user", content: state.question },
    ],
    toolSchemas(state.question),
  );

  const call = chosen?.calls[0];
  let result: ToolResult;

  if (!call) {
    result = {
      ok: false,
      // Same wording as the streaming path, and for the same reason: an answer
      // that opens "I can" about its own abilities is the shape the reasoning
      // gate flags, and the eval suite is the caller that sees this one.
      say: `Open on request: his LinkedIn, his GitHub, the source for this page, the LangChain issue and its merged fix, either publication, a written draft email to him, or one of this site's own eval cases.`,
    };
  } else if (call.name === "open_evidence") {
    result = openEvidence(String(call.args.target ?? ""));
  } else if (call.name === "compose_intro") {
    result = composeIntro(String(call.args.about ?? "general"));
  } else if (call.name === "run_eval") {
    // Not recursive: the suite is what calls this graph, and a case running
    // itself would be a loop with a model call in it.
    result = { ok: false, say: `The suite runs on every deploy; the result is published on this page.` };
  } else {
    result = { ok: false, say: `That is not something this page can do.` };
  }

  return { reply: result.say, action: result, provider: chosen?.provider ?? null };
});

const deflect = timed("deflect", async (state) => ({
  reply:
    state.intent === "authorisation" ? AUTHORISATION_ANSWER : deflection(state.question),
}));

export const graph = new StateGraph(State)
  .addNode("route", route)
  .addNode("retrieve", retrieveNode)
  .addNode("answer", answer)
  .addNode("deflect", deflect)
  .addNode("act", act)
  .addEdge(START, "route")
  .addConditionalEdges(
    "route",
    (s: S) =>
      s.intent === "deflect" || s.intent === "authorisation"
        ? "deflect"
        : s.intent === "act"
          ? "act"
          : "retrieve",
    { deflect: "deflect", retrieve: "retrieve", act: "act" },
  )
  .addEdge("retrieve", "answer")
  .addEdge("answer", END)
  .addEdge("deflect", END)
  .addEdge("act", END)
  .compile();

export async function ask(question: string) {
  const started = performance.now();
  const result = await graph.invoke({ question });
  return {
    answer: result.reply,
    route: result.intent,
    timings: result.timings,
    total: Math.round(performance.now() - started),
    sources: result.chunks.map((c) => c.title),
    usage: result.usage,
    action: result.action,
    trace: result.trace,
    provider: result.provider,
  };
}
