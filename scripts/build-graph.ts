import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "../lib/content";

/**
 * Builds the corpus graph.
 *
 * Sections are nodes. An edge exists where two sections share a technology, so
 * the structure comes out of the content rather than being drawn by hand: adding
 * a project to facts.md rewires the graph on the next build, and nothing can
 * show a connection the corpus does not support.
 *
 * Edge weight is the count of shared technologies, which is what lets the layout
 * put genuinely related work near each other instead of spacing nodes evenly.
 */

type Node = { id: string; label: string; kind: string; stack: string[]; weight: number };
type Edge = { a: number; b: number; shared: string[] };

const KIND = (title: string) => {
  if (/Questrom|IMG Systems|Growaza/.test(title)) return "role";
  if (/This site|deepagents/.test(title)) return "project";
  if (/Skills|good at|does not do|Who he is/.test(title)) return "capability";
  return "context";
};

const SHORT: Record<string, string> = {
  "Boston University, Questrom Computational Lab": "Questrom",
  "Open source, LangChain deepagents": "deepagents",
  "What he is good at": "Diagnosis",
  "What he does not do": "Scope limits",
  "Who he is": "Context engineering",
};

const { sections } = loadContent();

const nodes: Node[] = sections
  .filter((s) => s.stack.length > 0 || /Questrom|IMG|Growaza|This site|deepagents|Skills/.test(s.title))
  .map((s) => ({
    id: s.title,
    label: SHORT[s.title] ?? s.title,
    kind: KIND(s.title),
    stack: s.stack.length ? s.stack : extractTech(s.body),
    weight: s.metrics.length,
  }));

/** Sections without a Stack line still name technologies in prose. */
function extractTech(body: string): string[] {
  const known = [
    "LangGraph", "LangChain", "FastAPI", "Next.js", "React", "Python", "TypeScript",
    "pgvector", "BM25", "Azure", "AWS", "Docker", "PostgreSQL", "Redis", "MySQL",
    "Pydantic", "NVIDIA NIM", "LangSmith", "Cohere", "Cosmos DB", "NV-Embed",
  ];
  return known.filter((t) => body.includes(t));
}

const edges: Edge[] = [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const shared = nodes[i].stack.filter((t) =>
      nodes[j].stack.some((u) => u.toLowerCase() === t.toLowerCase()),
    );
    if (shared.length > 0) edges.push({ a: i, b: j, shared });
  }
}

const out = { nodes, edges };
writeFileSync(join(process.cwd(), "lib/agent/graph-data.json"), JSON.stringify(out));

const degrees = nodes.map((_, i) => edges.filter((e) => e.a === i || e.b === i).length);
const busiest = nodes[degrees.indexOf(Math.max(...degrees))];
console.log(
  `build-graph: ${nodes.length} nodes, ${edges.length} edges, ` +
    `most connected "${busiest.label}" with ${Math.max(...degrees)}`,
);
