import { runStream, type Exchange } from "@/lib/agent/stream";
import { checkBudget } from "@/lib/agent/budget";
import { noteDegraded } from "@/lib/agent/degraded";

import { loadContent } from "@/lib/content";

export const runtime = "nodejs";

const { profile } = loadContent();
export const maxDuration = 30;

/**
 * Streaming agent endpoint.
 *
 * Server-Sent Events over a plain GET so EventSource can consume it directly,
 * including its own reconnect behaviour. The question rides in the query string
 * because EventSource cannot send a request body.
 */
export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const url = new URL(req.url);
  // 2000 to match the textarea, so a pasted job description is not truncated
  // into nonsense halfway through the requirements list.
  const question = (url.searchParams.get("q") ?? "").slice(0, 2000);

  /**
   * Prior turns, sent by the client because the server keeps no session.
   *
   * EventSource cannot send a body, so this rides in the query string as JSON.
   * It is bounded twice -- here and again in runStream -- because this is a
   * public endpoint and the length of the prompt is the half of the bill a
   * stranger controls. Anything malformed is dropped rather than rejected: a
   * bad history should cost the reader context, not their answer.
   */
  let history: Exchange[] = [];
  try {
    const raw = url.searchParams.get("h");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        history = parsed
          .filter((e) => e && typeof e.question === "string" && typeof e.answer === "string")
          .slice(-2)
          .map((e) => ({ question: e.question.slice(0, 500), answer: e.answer.slice(0, 400) }));
      }
    }
  } catch {
    // Not JSON. The turn is answered without context.
  }

  if (question.trim().length < 2) {
    return Response.json({ error: "ask something" }, { status: 400 });
  }

  const budget = await checkBudget(ip, question);

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        if (!budget.ok) {
          send({ type: "route", route: "deflect", ms: 0 });
          send({
            type: "token",
            // The address was typed here while every other surface reads it
            // from the corpus, so a change to his email would have left one
            // dead route behind. The reason ships with the limit: a public LLM
            // endpoint with no ceiling is a stranger spending someone else's
            // credit, and saying so turns a wall into a decision.
            text: `That is the token ceiling for this demo. It is capped on purpose: this endpoint is public and uncapped inference on a free tier is a stranger spending someone else's credit. Email is faster anyway: ${profile.email}.`,
          });
          send({ type: "done", total: 0, usage: null });
          return;
        }

        // One structured line per request, keyed by the id in the response
        // header, so a reader's report maps to the run that produced it.
        const log: Record<string, unknown> = { level: "info", requestId, at: new Date().toISOString() };
        const failed: string[] = [];
        // What is left of today's ceiling, so the card can warn before the wall.
        send({ type: "budget", remaining: budget.remaining, limit: budget.limit });
        for await (const event of runStream(question, history)) {
          send(event);
          if (event.type === "route") log.route = event.route;
          else if (event.type === "sources") Object.assign(log, { band: event.trace?.band, tier: event.trace?.confidence?.tier, store: event.trace?.store });
          else if (event.type === "step" && event.state === "failed") failed.push(event.name);
          else if (event.type === "done") Object.assign(log, { provider: event.provider, total: event.total, degraded: !!event.degraded, prompt: event.promptVersion });
        }
        if (log.degraded) noteDegraded();
        if (failed.length || log.degraded) Object.assign(log, { level: "warn", failed });
        console.log(JSON.stringify(log));
      } catch (err) {
        console.error(JSON.stringify({ level: "critical", requestId, error: String(err).slice(0, 300) }));
        send({ type: "error", message: `Stream failed (request ${requestId.slice(0, 8)}). Email ${profile.email} directly.` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "x-request-id": requestId,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
