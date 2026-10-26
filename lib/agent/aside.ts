/**
 * The second, lighter layer: one short aside written after the answer.
 *
 * Facts and tone are separate calls on purpose. The answer runs at temperature
 * 0 against the corpus; this call never sees the corpus, only the finished
 * answer, and runs warm (ASIDE_TEMPERATURE, default 0.7), so turning the
 * temperature up changes the wit and cannot change a fact. A code guard then
 * rejects any aside carrying a digit or a capitalised name the answer does not
 * already contain: a line that fails is dropped, never repaired. Optional by
 * design: no key, no time left, or a failed guard all mean no aside.
 */
const PROMPT = `Write one short aside (max 20 words) with dry, confident humour about the work in the answer below, the kind a hiring engineer would smile at.
Rules: no new facts, no numbers, no names that are not in the answer, no sarcasm about anyone, no emoji. Return only the line.`;

export const ASIDE_VERSION = "a2";

export function guardAside(line: string, answer: string): string | null {
  const text = line.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ");
  if (!text || /\d/.test(text) || text.split(" ").length > 24) return null;
  const known = new Set(answer.toLowerCase().match(/[a-z][\w.+#-]*/g) ?? []);
  // Every capitalised word after the first must already be in the answer.
  const names = text.split(" ").slice(1).filter((w) => /^[A-Z]/.test(w)).map((w) => w.toLowerCase().replace(/[^\w.+#-]/g, ""));
  return names.every((n) => !n || known.has(n)) ? text : null;
}

export async function aside(answer: string, msLeft: number): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key || msLeft < 1200 || !answer.trim()) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(Math.min(1500, msLeft - 200)),
      body: JSON.stringify({
        model: process.env.ASIDE_MODEL ?? "openai/gpt-oss-20b",
        temperature: Number(process.env.ASIDE_TEMPERATURE ?? 0.7),
        max_tokens: 200,
        reasoning_effort: "low",
        messages: [{ role: "system", content: PROMPT }, { role: "user", content: answer }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return guardAside(json.choices?.[0]?.message?.content ?? "", answer);
  } catch {
    return null;
  }
}
