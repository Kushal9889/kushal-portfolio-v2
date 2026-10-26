import { ask } from "@/lib/agent/graph";
import { checkBudget } from "@/lib/agent/budget";
import { loadContent } from "@/lib/content";

const PROFILE = loadContent().profile;

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The agent endpoint.
 *
 * Returns the answer together with the per-node timings and the sections that
 * grounded it, so the trace panel reports what actually happened rather than a
 * plausible reconstruction.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  let question: unknown;
  try {
    ({ question } = await req.json());
  } catch {
    return Response.json({ error: "expected JSON body" }, { status: 400 });
  }

  if (typeof question !== "string" || question.trim().length < 2) {
    return Response.json({ error: "ask something" }, { status: 400 });
  }

  // Input length is the half of the bill a stranger controls for free, so it is
  // capped before the question reaches a model rather than after.
  const trimmed = question.slice(0, 500);

  const budget = await checkBudget(ip, trimmed);
  if (!budget.ok) {
    return Response.json(
      {
        answer: `That is the daily limit for this demo. Reach ${PROFILE.email} directly.`,
        route: "deflect",
        timings: {},
        total: 0,
        sources: [],
        limited: true,
      },
      { status: 200 },
    );
  }

  try {
    const result = await ask(trimmed);
    return Response.json({ ...result, remaining: budget.remaining });
  } catch (err) {
    console.error("agent:", err);
    return Response.json(
      {
        answer:
          `That request did not complete. The rest of this page does not depend on me; reach ${PROFILE.email} directly.`,
        route: "error",
        timings: {},
        total: 0,
        sources: [],
      },
      { status: 200 },
    );
  }
}
