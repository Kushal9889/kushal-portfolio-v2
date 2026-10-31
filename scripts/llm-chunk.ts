import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sentences, estimateTokens } from "../lib/agent/chunk";
import { ground } from "../lib/agent/ground";

/**
 * Semantic chunking by a model, at build time only (CHUNKER=llm).
 *
 * The model never writes chunk text. It reads the section as numbered
 * sentences and returns which consecutive sentences belong together, plus one
 * situating line per unit. The text of every unit is rebuilt from the original
 * sentences, so a unit is verbatim by construction and grounding cannot drift.
 *
 * Checked in code, else the section falls back to the default chunker:
 *   - every sentence id appears exactly once, in order, in contiguous runs
 *   - each context line passes ground() against the section (no name or
 *     number the section does not hold); a failing line becomes the title
 *
 * The context line is read by BM25 and the embedding only. The answer model is
 * handed whole sections, as before. Cached per (model, prompt version, section).
 */
export const CHUNK_PROMPT_VERSION = "c1";
const MODEL = process.env.CHUNK_MODEL ?? "gemini-3.1-flash-lite";
const DIR = join(process.cwd(), ".cache/chunks");

const SYSTEM = `You split one section of a person's profile into small retrieval units.

<rules>
1. A unit is 1 to 3 consecutive sentences that answer one question on their own.
2. Start a new unit when the subject, claim, project or time changes.
3. Keep a figure with the sentence that says what it measures.
4. A list line ("Label: a, b, c") stays one unit.
5. Every sentence id is used exactly once, in order.
6. context: at most 20 words saying who, where and when the unit is about, using only names and numbers that appear in the section. No new facts, no opinion.
</rules>

<example>
Section "Acme Corp" sentences:
0: She led the billing rewrite at Acme Corp in 2021.
1: It cut invoice errors 40%.
2: Separately, she mentored four interns.
3: Stack: Go, Postgres.
Output: {"units":[{"ids":[0,1],"context":"Acme Corp, 2021: billing rewrite and its error reduction"},{"ids":[2],"context":"Acme Corp: mentoring interns"},{"ids":[3],"context":"Acme Corp: technologies used"}]}
</example>

Reply with JSON only: {"units":[{"ids":[...],"context":"..."}]}`;

let warned = false;

export type LlmUnit = { text: string; context: string; tokens: number };

export async function llmChunk(title: string, body: string): Promise<LlmUnit[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    if (!warned) console.warn("llm-chunk: GEMINI_API_KEY missing, default chunker used for every section");
    warned = true;
    return null;
  }
  const sents = sentences(body);
  if (sents.length < 2) return null;
  const user = `Section "${title}" sentences:\n${sents.map((s, i) => `${i}: ${s}`).join("\n")}`;
  const file = join(DIR, `${createHash("sha256").update(JSON.stringify([MODEL, CHUNK_PROMPT_VERSION, SYSTEM, user])).digest("hex")}.json`);
  let units: { ids: number[]; context: string }[] | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (!units) {
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          reasoning_effort: "none",
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        console.warn(`llm-chunk: ${title}: ${res.status}`);
        return null;
      }
      units = JSON.parse((await res.json()).choices[0].message.content).units;
    } catch (e) {
      console.warn(`llm-chunk: ${title}: ${(e as Error).message}`);
      return null;
    }
  }
  // Coverage: ids 0..n-1, each once, in order, contiguous within a unit.
  const flat = units?.flatMap((u) => u.ids) ?? [];
  const ordered = flat.length === sents.length && flat.every((id, i) => id === i);
  const contiguous = units?.every((u) => u.ids.length > 0 && u.ids.every((id, j) => j === 0 || id === u.ids[j - 1] + 1));
  if (!units || !ordered || !contiguous) {
    console.warn(`llm-chunk: ${title}: coverage check failed, default chunker used`);
    return null;
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(units));
  const source = `${title}\n${body}`;
  return units.map((u) => {
    const text = u.ids.map((i) => sents[i]).join(" ");
    const context = typeof u.context === "string" && u.context.trim() && ground(u.context, source).g === 1 ? u.context.trim() : title;
    return { text, context, tokens: estimateTokens(text) };
  });
}
