import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
import { retrieve, searchText } from "../lib/agent/retrieve";
(async () => {
for (const q of process.argv.slice(2)) {
  const r = await retrieve(q, { question: q });
  console.log(q, "| search:", searchText(q), "| band", r.band, r.trace.relevance?.toFixed(2));
  for (const row of r.trace.rows.filter((x) => x.lexicalRank || (x.denseRank && x.denseRank <= 6)).sort((a, b) => (a.denseRank ?? 99) - (b.denseRank ?? 99)).slice(0, 6))
    console.log("   ", row.title.slice(0, 40).padEnd(40), "lex", row.lexicalRank, row.lexicalScore, "dense", row.denseRank, row.selected ? "SEL" : "");
}
})();
