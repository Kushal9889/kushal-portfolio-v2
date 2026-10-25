import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "../lib/content";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Wilson 95% interval, same as agent-scenarios.ts (importing it would run that suite). */
function wilson(k: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [+(mid - half).toFixed(3), +(mid + half).toFixed(3)];
}

/**
 * LLM judge over a finished agent-scenarios report (R5, R7).
 *
 *   npx tsx scripts/judge.ts docs/agent-bench/<report>.json
 *
 * For every answered row, a model from a different provider than the one that
 * generated reads the passages that run actually
 * retrieved and lists each claim in the answer the passages do not support.
 * The deterministic check in lib/agent/ground.ts misses paraphrase; this is the
 * second opinion it names. Rows the judge provider itself generated go to JUDGE_SECOND; with no
 * second judge they are marked selfJudged and reported apart. Verdicts are cached by a hash of model, prompt, passages and answer,
 * so a rerun only pays for rows that changed. Point AGENT_CORPUS at the corpus
 * the report was run on so the passages match.
 */

// Groq by default; JUDGE_PROVIDER=gemini when Groq's free 8k tokens/min cannot
// carry a full blind set (2026-10-25: 6 of 115 rows in 20 minutes). A row the
// judge's own provider generated goes to JUDGE_SECOND instead, so no row is
// graded by the family that wrote it (2026-10-25: Gemini served 73 of 120
// blind answers while NVIDIA sat in 429 cooldown).
type Judge = { name: string; model: string; endpoint: string; key: () => string | undefined; effort: string | null };
const JUDGES: Record<string, Omit<Judge, "name">> = {
  groq: { model: "openai/gpt-oss-120b", endpoint: "https://api.groq.com/openai/v1/chat/completions", key: () => process.env.GROQ_API_KEY, effort: "low" },
  gemini: { model: "gemini-3.8-flash", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: () => process.env.GEMINI_API_KEY, effort: "none" },
  nvidia: { model: "deepseek-ai/deepseek-v4.1-flash", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: () => process.env.NVIDIA_API_KEY, effort: null },
};
const pick = (name: string, model?: string, effort?: string): Judge => ({ name, ...JUDGES[name], model: model ?? JUDGES[name].model, effort: effort ?? JUDGES[name].effort });
const PRIMARY = pick(JUDGES[process.env.JUDGE_PROVIDER ?? ""] ? process.env.JUDGE_PROVIDER! : "groq", process.env.JUDGE_MODEL);
// gpt-oss-120b on Groq has a 200k tokens/day cap that one blind pass spends
// (2026-10-25); JUDGE_SECOND_MODEL=qwen/qwen3.8-27b JUDGE_SECOND_EFFORT=none has its own.
const SECOND = JUDGES[process.env.JUDGE_SECOND ?? ""] ? pick(process.env.JUDGE_SECOND!, process.env.JUDGE_SECOND_MODEL, process.env.JUDGE_SECOND_EFFORT) : null;
const PROMPT = `You check one answer against the source passages it was written from.
List every factual claim in the answer that the passages do not state or directly imply.
A claim is supported if a passage says it, even in other words. Wording, tone and
statements that something is missing from the passages are not claims.
Reply with JSON only: {"claims": <number of factual claims>, "unsupported": ["<claim>", ...]}`;

type Row = { id: number; expect: string; q: string; answer: string; titles: string[]; provider: string | null; route: string };
type Verdict = { claims: number; unsupported: string[] };

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("usage: tsx scripts/judge.ts <report.json>");
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportPath, "utf8")) as { rows: Row[]; corpus: string };
const corpus = process.env.AGENT_CORPUS ?? report.corpus;
const indexFile = corpus === "content" ? join(process.cwd(), "lib/agent/index.json") : join(process.cwd(), corpus, "index.json");
const index = JSON.parse(readFileSync(indexFile, "utf8")) as { passages: { parent: string; text: string }[] };
const textOf = (title: string) => index.passages.filter((p) => p.parent === title).map((p) => p.text).join("\n");

const DIR = join(process.cwd(), ".cache/judge");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The passages never restate whose profile they are, and the contact close and
// availability line come from the profile header, not a section. Without this
// the judge flagged the subject's own name and email as unsupported (7 of 10
// site-c flags, 2026-10-25).
const { profile } = loadContent();
const SUBJECT = `[Subject]\nEvery passage is about ${profile.name}.\n${Object.entries(profile)
  .filter(([, v]) => typeof v === "string")
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}`;
// A degraded answer is source text plus a fixed note about the outage; the note is not a claim.
const DEGRADED_NOTE = "\n\nThat is the source text, unsummarised";

async function judge(j: Judge, sources: string, answer: string): Promise<Verdict | null> {
  const user = `<passages>\n${SUBJECT}\n\n${sources}\n</passages>\n<answer>\n${answer}\n</answer>`;
  const file = join(DIR, `${createHash("sha256").update(JSON.stringify([j.model, PROMPT, user])).digest("hex")}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Verdict;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(j.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${j.key()}` },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: j.model,
        temperature: 0,
        ...(j.effort ? { reasoning_effort: j.effort } : {}),
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: PROMPT }, { role: "user", content: user }],
      }),
    }).catch(() => null);
    // Free tier: 8k tokens a minute. Wait out a 429 rather than drop the row.
    if (!res || res.status === 429 || res.status >= 500) {
      await sleep(Math.min(60_000, 1000 * Number(res?.headers.get("retry-after") ?? 2 ** (attempt + 2))));
      continue;
    }
    if (!res.ok) return null;
    try {
      const v = JSON.parse((await res.json()).choices[0].message.content) as Verdict;
      const out = { claims: Number(v.claims) || 0, unsupported: Array.isArray(v.unsupported) ? v.unsupported.map(String) : [] };
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(out));
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  for (const j of [PRIMARY, SECOND]) {
    if (j && !j.key()) {
      console.error(`${j.name} key missing`);
      process.exit(1);
    }
  }
  const rows = report.rows.filter((r) => r.expect === "answer" && r.answer && r.route !== "deflect" && r.titles.length);
  const results: { id: number; provider: string | null; judge: string; selfJudged: boolean; verdict: Verdict | null }[] = [];
  const one = async (r: Row, j: Judge) => {
    const v = await judge(j, r.titles.map((t) => `[${t}]\n${textOf(t)}`).join("\n\n"), r.answer.split(DEGRADED_NOTE)[0]);
    const selfJudged = r.provider === j.name;
    results.push({ id: r.id, provider: r.provider, judge: j.name, selfJudged, verdict: v });
    console.log(`${v === null ? "ERR " : v.unsupported.length ? "HALL" : "ok  "} #${String(r.id).padStart(3)} ${r.provider ?? "-"}>${j.name}${selfJudged ? " self" : ""} ${v ? `${v.unsupported.length}/${v.claims}` : ""} ${v?.unsupported.join(" | ").slice(0, 120) ?? ""}`);
  };
  // One lane per judge, run side by side. Groq's free 8k tokens/min allows one
  // call at a time; the others take JUDGE_CONCURRENCY (one row a minute
  // serially made a 230-row pass about four hours).
  const lanes = new Map<Judge, Row[]>();
  for (const r of rows) {
    const j = r.provider === PRIMARY.name && SECOND ? SECOND : PRIMARY;
    lanes.set(j, [...(lanes.get(j) ?? []), r]);
  }
  await Promise.all(
    [...lanes].map(([j, queue]) => {
      const width = j.name === "groq" ? 1 : Number(process.env.JUDGE_CONCURRENCY ?? 6);
      return Promise.all(Array.from({ length: width }, async () => {
        for (let r = queue.shift(); r; r = queue.shift()) await one(r, j);
      }));
    }),
  );
  results.sort((a, b) => a.id - b.id);
  const scored = results.filter((r) => r.verdict && !r.selfJudged);
  const claims = scored.reduce((s, r) => s + r.verdict!.claims, 0);
  const bad = scored.reduce((s, r) => s + r.verdict!.unsupported.length, 0);
  const clean = scored.filter((r) => r.verdict!.unsupported.length === 0).length;
  const summary = {
    report: reportPath,
    judge: `${PRIMARY.name} ${PRIMARY.model}${SECOND ? `, ${SECOND.name} ${SECOND.model} for ${PRIMARY.name}-generated rows` : ""}`,
    answered: rows.length,
    judged: scored.length,
    selfJudged: results.filter((r) => r.selfJudged).length,
    errors: results.filter((r) => !r.verdict).length,
    hallucinatedAnswers: scored.length - clean,
    groundedCI: wilson(clean, scored.length),
    claimSupport: claims ? +(1 - bad / claims).toFixed(3) : null,
  };
  console.log(JSON.stringify(summary));
  writeFileSync(reportPath.replace(/\.json$/, `-judge-${PRIMARY.name}${SECOND ? `-${SECOND.name}` : ""}.json`), JSON.stringify({ ...summary, results }, null, 1));
}

main();
