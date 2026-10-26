import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { retrieve } from "../lib/agent/retrieve";
import { systemPrompt } from "../lib/agent/policy";
import { ground } from "../lib/agent/ground";

/**
 * Every free provider and model on the same grounded prompts (RAG v3 phase 2).
 *
 *   npx tsx scripts/bench-providers.ts [--n 12]
 *
 * Same retrieval and system prompt the site sends, streamed straight to each
 * OpenAI-compatible endpoint, so the numbers are the provider's and not the
 * pipeline's. Per model: time to first token p50/p95, total p50, error rate,
 * groundedness (share of answers whose every figure and name is in context).
 * Writes docs/agent-bench/providers-<date>.json; the order in model.ts is read
 * from it by hand.
 */
const CANDIDATES: { provider: string; baseURL: string; key?: string; model: string; extra?: Record<string, unknown> }[] = [
  { provider: "groq", baseURL: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: "openai/gpt-oss-20b", extra: { reasoning_effort: "low" } },
  { provider: "groq", baseURL: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: "openai/gpt-oss-120b", extra: { reasoning_effort: "low" } },
  { provider: "groq", baseURL: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: "qwen/qwen3.8-27b", extra: { reasoning_effort: "none" } },
  { provider: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY, model: "gemini-2.5-flash", extra: { reasoning_effort: "none" } },
  { provider: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY, model: "gemini-3.5-flash-lite", extra: { reasoning_effort: "low" } },
  { provider: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY, model: "gemini-3.1-flash-lite", extra: { reasoning_effort: "none" } },
  { provider: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY, model: "gemini-3.8-flash", extra: { reasoning_effort: "none" } },
  { provider: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY, model: "gemini-4-argon", extra: { reasoning_effort: "low" } },
  { provider: "openrouter", baseURL: "https://openrouter.ai/api/v1", key: process.env.OPENROUTER_API_KEY, model: "nvidia/nemotron-3-super-120b-a12b:free", extra: { reasoning: { exclude: true } } },
  { provider: "openrouter", baseURL: "https://openrouter.ai/api/v1", key: process.env.OPENROUTER_API_KEY, model: "google/gemma-4-31b-it:free" },
  { provider: "nvidia", baseURL: "https://integrate.api.nvidia.com/v1", key: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", extra: { chat_template_kwargs: { thinking: false } } },
];

/** Wilson 95% interval for k of n. */
const wilson = (k: number, m: number) => {
  if (!m) return null;
  const z = 1.96, p = k / m, d = 1 + (z * z) / m;
  const c = (p + (z * z) / (2 * m)) / d, h = (z * Math.sqrt((p * (1 - p)) / m + (z * z) / (4 * m * m))) / d;
  return [+(c - h).toFixed(3), +(c + h).toFixed(3)];
};

const n = process.argv.includes("--n") ? Number(process.argv[process.argv.indexOf("--n") + 1]) : 12;
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null;
};

async function stream(c: (typeof CANDIDATES)[number], system: string, question: string) {
  const t0 = performance.now();
  const res = await fetch(`${c.baseURL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ model: c.model, stream: true, temperature: 0, max_tokens: 400, messages: [{ role: "system", content: system }, { role: "user", content: question }], ...c.extra }),
  });
  if (!res.ok || !res.body) throw new Error(`${res.status}`);
  let ttft: number | null = null;
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    for (const line of decoder.decode(chunk, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      try {
        const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
        if (delta) {
          ttft ??= performance.now() - t0;
          text += delta;
        }
      } catch {}
    }
  }
  return { ttft: ttft ?? performance.now() - t0, total: performance.now() - t0, text };
}

async function main() {
  const file = JSON.parse(readFileSync("content/agent-scenarios.json", "utf8")) as { cases: { id: number; q: string; expect: string }[] };
  const qs = file.cases.filter((c) => c.id % 2 === 1 && c.expect === "answer").slice(0, n).map((c) => c.q);
  const prompts = [];
  for (const q of qs) {
    const r = await retrieve(q, { question: q });
    const context = r.chunks.map((c) => `## ${c.title}\n${c.body}`).join("\n\n");
    prompts.push({ q, context, system: systemPrompt(context) });
  }
  const out = [];
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  for (const c of CANDIDATES.filter((c) => c.key && (!only || c.provider === only))) {
    const ttft: number[] = [], total: number[] = [];
    let errors = 0, grounded = 0, ok = 0;
    for (const p of prompts) {
      try {
        const r = await stream(c, p.system, p.q);
        ttft.push(r.ttft);
        total.push(r.total);
        ok++;
        if (r.text.trim() && ground(r.text, p.context).g === 1) grounded++;
      } catch (e) {
        errors++;
        if (errors === 3 && ok === 0) break;
      }
    }
    const row = { provider: c.provider, model: c.model, runs: ok + errors, errors, ttftP50: pct(ttft, 0.5), ttftP95: pct(ttft, 0.95), totalP50: pct(total, 0.5), grounded, groundedCI: wilson(grounded, ok) };
    out.push(row);
    console.log(JSON.stringify(row, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
  }
  const path = join("docs/agent-bench", `providers-${new Date().toISOString().slice(0, 10)}${only ? `-${only}` : ""}.json`);
  writeFileSync(path, JSON.stringify(out, null, 1));
  console.log("wrote", path);
}

main();
