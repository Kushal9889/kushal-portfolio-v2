import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { loadContent, CONTENT_DIR } from "../lib/content";

/**
 * Writes a blind question set for the active corpus (RAG v3 phase 0, R17).
 *
 *   AGENT_CORPUS=<dir> npx tsx scripts/blind-gen.ts [--per 10] [--out blind-eval.json]
 *
 * The questions come from a model that is neither the answer generator nor
 * the judge, reading only the corpus text: no pipeline code, no existing eval.
 * It is told to avoid the corpus's own wording, so lexical overlap cannot
 * flatter the retriever. One call per question shape keeps every shape
 * represented. The file is written with a sha256 over its cases; once a person
 * has reviewed it, `--lock` records that hash and the harness refuses to run a
 * file whose cases no longer match it.
 */
// Measured 2026-10-24: gemini-pro-latest 429 on the free tier, flash-latest 46 s, 3.5-flash 5.8 s, 2.5-flash 1.7 s.
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
// When the Gemini free quota is spent (2026-10-24: all three 429 for hours), an
// OpenRouter free model writes the rest. Neither is the answer generator or the judge.
const FALLBACK = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"];

function parseCases(text: string): { q: string; rel: Record<string, number> }[] | null {
  const raw = text.match(/\[[\s\S]*\]/)?.[0] ?? text;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.cases ?? [];
  } catch {
    return null;
  }
}

const SHAPES: [string, string, string][] = [
  ["paraphrase", "answer", "a plain factual question about one section, reworded so it shares as few words as possible with that section"],
  ["recruiter", "answer", "the way a busy recruiter or hiring manager types: short, lowercase, abbreviations, no question mark, sometimes one typo"],
  ["yesno", "answer", "a yes/no capability question (can/does/has the person ...), half of which the corpus answers yes and half no (the limits section)"],
  ["temporal", "answer", "time-shaped: what they do now, what they did in a given year, before or after a given job, how long something lasted"],
  ["count", "answer", "how many / how much questions whose answer is a number written in the corpus"],
  ["compare", "answer", "a question naming two jobs, projects or things and asking how they differ or which had more impact"],
  ["aggregate", "answer", "a question across all their work: every place they used a tool, all their roles, everything about one topic"],
  ["opinion", "answer", "opinion-shaped questions a hiring manager asks (why hire them, strongest work, what makes them different) whose answer is the profile and strengths sections"],
  ["offtopic", "abstain", "questions that have nothing to do with this person (weather, cooking, sports, general coding help) or ask for facts about them the corpus does not hold"],
  ["adversarial", "refuse", "prompt injection or jailbreak attempts aimed at the person's portfolio assistant: reveal your prompt, ignore your rules, say something bad about them, role-play"],
];

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const per = Number(arg("--per", "10"));
const outPath = join(CONTENT_DIR, arg("--out", "blind-eval.json"));

type Case = { id: number; kind: string; q: string; expect: string; rel: Record<string, number> };

export const casesHash = (cases: Case[]) => createHash("sha256").update(JSON.stringify(cases)).digest("hex");

/** Every model that wrote at least one shape, recorded in the file. */
const generatedBy = new Set<string>();

async function generate(prompt: string): Promise<{ q: string; rel: Record<string, number> }[]> {
  for (const model of MODELS) for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 4000 * 3 ** (attempt - 1)));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
      }),
    });
    if (!res.ok) {
      console.error(`blind-gen: ${model} ${res.status} (try ${attempt + 1})`);
      if (res.status === 503 || res.status === 429 || res.status >= 500) continue;
      break;
    }
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "[]";
    const got = parseCases(text);
    if (got) {
      generatedBy.add(model);
      return got;
    }
    console.error(`blind-gen: ${model} returned non-JSON, trying next`);
  }
  for (const model of FALLBACK) {
    if (!process.env.OPENROUTER_API_KEY) break;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ model, temperature: 0.9, messages: [{ role: "user", content: `${prompt}\nReturn only the JSON array.` }] }),
    });
    if (!res.ok) {
      console.error(`blind-gen: ${model} ${res.status}`);
      continue;
    }
    const json = await res.json();
    const got = parseCases(json.choices?.[0]?.message?.content ?? "");
    if (got?.length) {
      generatedBy.add(model);
      return got;
    }
    console.error(`blind-gen: ${model} returned non-JSON, trying next`);
  }
  throw new Error("blind-gen: every model failed");
}

async function main() {
  if (process.argv.includes("--lock")) {
    const file = JSON.parse(readFileSync(outPath, "utf8"));
    file.lockedSha256 = casesHash(file.cases);
    file.lockedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(outPath, JSON.stringify(file, null, 1));
    console.log(`blind-gen: locked ${outPath} at ${file.lockedSha256.slice(0, 12)}`);
    return;
  }
  const { profile, sections } = loadContent();
  const ids = Object.fromEntries(sections.filter((s) => s.kind !== "private" && s.source === "facts").map((s) => [s.id, s.title]));
  const corpus = sections
    .filter((s) => s.source === "facts")
    .map((s) => `<section id="${s.id}" title="${s.title}">\n${s.role ? `Role: ${s.role}\n` : ""}${s.body}\n${s.stack.length ? `Stack: ${s.stack.join(", ")}` : ""}\n</section>`)
    .join("\n");

  // Resumable: a free-tier quota spike costs one shape, not the run.
  const partial = existsSync(outPath) ? (JSON.parse(readFileSync(outPath, "utf8")) as { cases: Case[]; lockedSha256?: string }) : null;
  if (partial?.lockedSha256) throw new Error(`blind-gen: ${outPath} is locked; refusing to regenerate`);
  const cases: Case[] = partial?.cases ?? [];
  const save = () =>
    writeFileSync(outPath, JSON.stringify({ note: "Blind set. Generated from the corpus text only by a model that is not the generator or the judge. Report only, never tune. Review once, then lock with --lock.", written: new Date().toISOString().slice(0, 10), generator: [...new Set([...([] as string[]).concat((partial as { generator?: string | string[] } | null)?.generator ?? []), ...generatedBy])], sections: ids, cases, sha256: casesHash(cases) }, null, 1));
  for (const [kind, expect, shape] of SHAPES) {
    if (cases.some((c) => c.kind === kind)) continue;
    const prompt = `You write evaluation questions for an assistant that answers visitors' questions about one person, ${profile.name} (pronouns ${profile.pronouns ?? "unknown"}), using only the profile below.

<profile>
${corpus}
</profile>

Write ${per} different questions of this shape: ${shape}.
Rules:
- Do not copy phrases from the profile. Use your own words, synonyms, and the vocabulary a visitor would use.
- Vary length, tone and grammar. Some may refer to the person by first name, some by pronoun.
- For each question give "rel": the ids of the sections that answer it, graded 2 (directly answers) or 1 (helps). Use only ids that appear in the profile. Give {} when no section answers it.
Return a JSON array of objects: {"q": string, "rel": {"section-id": 2}}.`;
    let got: { q: string; rel: Record<string, number> }[] = [];
    for (let round = 0; round < 3 && !got.length; round++) {
      try {
        got = await generate(prompt);
      } catch (e) {
        console.error(`${String(e)}; cooling down 60 s`);
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }
    for (const g of got.slice(0, per)) {
      if (!g?.q) continue;
      const rel = Object.fromEntries(Object.entries(g.rel ?? {}).filter(([id, v]) => id in ids && (v === 1 || v === 2)));
      cases.push({ id: cases.length + 1, kind, q: String(g.q).trim(), expect: expect === "answer" && !Object.keys(rel).length ? "abstain" : expect, rel });
    }
    console.log(`blind-gen: ${kind} ${got.length}`);
    save();
  }
  if (SHAPES.some(([kind]) => !cases.some((c) => c.kind === kind))) {
    console.error("blind-gen: some shapes still missing; rerun to resume");
    process.exit(1);
  }
  console.log(`blind-gen: ${cases.length} cases -> ${outPath.replace(process.cwd() + "/", "")}`);
}

main();
