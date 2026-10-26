export const runtime = "nodejs";

const ALLOWED = new Set([
  "view",
  "scroll_deep",
  "agent_opened",
  "agent_asked",
  "voice_used",
  "agent_feedback",
  "contact",
]);

/**
 * Funnel sink.
 *
 * Writes to the platform log rather than a database: the question being answered
 * is "does this page convert", which needs counts over days, not rows. No IP, no
 * user agent, no identifier is recorded, so there is nothing here to leak and
 * nothing to put in a privacy policy.
 */
/**
 * The furthest step a session reached, as one countable line.
 *
 * Raw events answer "how many people scrolled", which is not a question worth
 * asking. The question is where readers stop, and answering it from raw events
 * means reconstructing sessions out of a log. Naming the stage on every line
 * makes the funnel a `grep -c` instead of a query.
 */
const STAGE: Record<string, number> = {
  view: 1,
  scroll_deep: 2,
  agent_opened: 3,
  agent_asked: 4,
  voice_used: 4,
  agent_feedback: 4,
  contact: 5,
};

export async function POST(req: Request) {
  try {
    const { event, detail } = await req.json();
    if (typeof event === "string" && ALLOWED.has(event)) {
      const clean = typeof detail === "string" ? detail.slice(0, 120) : "";
      console.log(
        `funnel stage=${STAGE[event] ?? 0} ${event}${clean ? ` ${JSON.stringify(clean)}` : ""}`,
      );
    }
  } catch {
    // Malformed beacon. Nothing to do and nothing worth surfacing.
  }
  // 204 so a beacon never retries and never blocks unload.
  return new Response(null, { status: 204 });
}
