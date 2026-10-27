/**
 * Post-deploy smoke check: reads /api/health from a deployed origin and fails
 * when the agent has no provider or the hero's baked seed is missing.
 * No model is called; health answers from config alone.
 *
 *   npx tsx scripts/smoke.ts https://example.vercel.app
 */
export {};

const base = (process.argv[2] ?? "http://localhost:3002").replace(/\/$/, "");

async function main() {
  const res = await fetch(`${base}/api/health`, { cache: "no-store" });
  const h = (await res.json()) as { providers?: unknown[]; seedAgeMs?: number | null; degraded24h?: number; prompt?: string };
  const fails: string[] = [];
  if (!h.providers?.length) fails.push("providers=0: every question will be a fallback");
  if (h.seedAgeMs == null) fails.push("seed missing or degraded: re-run the prewarm bake");
  console.log(`smoke ${base}: providers=${h.providers?.length ?? 0} seedAgeMs=${h.seedAgeMs ?? "none"} degraded24h=${h.degraded24h ?? "?"} prompt=${h.prompt ?? "?"}`);
  for (const f of fails) console.log(`FAIL ${f}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.log(`FAIL health unreachable: ${String(err).slice(0, 200)}`);
  process.exit(1);
});
