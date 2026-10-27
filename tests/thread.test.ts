import assert from "node:assert/strict";
import { test } from "node:test";
import { cite, SENTENCE } from "../lib/agent/ground";
import { activeTurn, alignCitations, summarizeEvidence } from "../lib/thread";

test("evidence distinguishes repeated citations, uncited statements and distinct passages", () => {
  assert.deepEqual(summarizeEvidence(), { sourced: 0, total: 0, passages: 0 });
  assert.deepEqual(summarizeEvidence([
    { sentence: "A.", source: "Work", n: 1 },
    { sentence: "B.", source: "Work", n: 1 },
    { sentence: "C.", source: "Research", n: 2 },
    { sentence: "D.", source: null },
  ]), { sourced: 3, total: 4, passages: 2 });
  assert.equal(summarizeEvidence([{ sentence: "Unmatched.", source: "Work" }]).sourced, 0);
});

const sections = [
  { title: "Retrieval", body: "BM25 and dense cosine are fused with reciprocal rank fusion at k=60.\n\nThe embedding call is skipped when the top BM25 score is far ahead." },
  { title: "Azure", body: "He shipped a document assistant on Azure for an enterprise consulting firm." },
];

// What Formatted does: paragraphs first, then sentences.
const pageSentences = (answer: string) => answer.split(/\n{2,}/).flatMap((p) => p.split(SENTENCE).filter((x) => x.trim()));
const marks = (answer: string) => alignCitations(pageSentences(answer), cite(answer, sections)).map((c) => c?.n ?? null);

test("every sourced sentence carries its number, an unsourced one none", () => {
  const answer = "BM25 and dense cosine are fused with reciprocal rank fusion at k=60. He enjoys long walks by the river. He shipped a document assistant on Azure for an enterprise consulting firm.";
  assert.deepEqual(marks(answer), [1, null, 2]);
});

test("a paragraph without closing punctuation does not drop the markers after it", () => {
  // cite() keeps "In short:\n\nBM25 ..." as one sentence; the page splits it in two.
  const answer = "In short:\n\nBM25 and dense cosine are fused with reciprocal rank fusion at k=60. He shipped a document assistant on Azure for an enterprise consulting firm.";
  assert.deepEqual(marks(answer), [null, 1, 2]);
});

test("a sentence the code prefixed before the cited answer is skipped, not matched", () => {
  const cited = "He shipped a document assistant on Azure for an enterprise consulting firm.";
  const page = ["The profile does not mention Kubernetes.", cited];
  const c = alignCitations(page, cite(cited, sections));
  assert.equal(c[0], undefined);
  assert.equal(c[1]?.source, "Azure");
});

test("a mismatch in the middle re-syncs on the next exact start", () => {
  const cites = [
    { sentence: "One alpha sentence.", source: "A", n: 1 },
    { sentence: "Two beta sentence.", source: "B", n: 2 },
    { sentence: "Three gamma sentence.", source: "A", n: 1 },
  ];
  assert.deepEqual(
    alignCitations(["One alpha sentence.", "Something else entirely.", "Three gamma sentence."], cites).map((c) => c?.n ?? null),
    [1, null, 1],
  );
});

test("markdown and whitespace do not break a match", () => {
  const cites = [{ sentence: "He cut latency by **40%**\nacross the stack.", source: "A", n: 1 }];
  assert.equal(alignCitations(["He cut latency by 40% across the stack."], cites)[0]?.n, 1);
});

test("the side panel follows the turn crossing the reading line, not the most visible one", () => {
  const view = { top: 0, height: 600 };
  // Turn 0 fills the view from far above; turn 1 is short and fully visible below the line.
  assert.equal(activeTurn([-900, 450], view, false), 0);
  assert.equal(activeTurn([-900, 150], view, false), 1);
  assert.equal(activeTurn([-900, 450], view, true), 1);
  assert.equal(activeTurn([300, 900], view, false), 0);
  assert.equal(activeTurn([], view, false), null);
});

test("list markers are layout: each item's sentence keeps its own marker", () => {
  const answer = "He built the retrieval layer.\n- BM25 and dense cosine are fused with reciprocal rank fusion at k=60.\n- He shipped a document assistant on Azure for an enterprise consulting firm.";
  const page = ["He built the retrieval layer.", "BM25 and dense cosine are fused with reciprocal rank fusion at k=60.", "He shipped a document assistant on Azure for an enterprise consulting firm."];
  assert.deepEqual(alignCitations(page, cite(answer, sections)).map((c) => c?.n ?? null), [null, 1, 2]);
});

test("the answer format follows the question's wording, the same way every time", async () => {
  const { answerFormat } = await import("../lib/agent/policy");
  const shape = (q: string) => answerFormat(q).name;
  assert.equal(shape("Is he on a visa?"), "direct");
  assert.equal(shape("What did he ship at his last role?"), "points");
  assert.equal(shape("How does retrieval work here?"), "steps");
  assert.equal(shape("Why hybrid retrieval instead of dense only? What were the trade-offs?"), "compare");
  assert.equal(shape("Tell me about him"), "prose");
  assert.equal(shape("word ".repeat(70)), "points");
});

test("every Sources link points at an id the page renders, from a section that exists", async () => {
  const { readFileSync } = await import("node:fs");
  const { PAGE_HOME, loadContent, sectionHomes } = await import("../lib/content");
  const page = readFileSync(new URL("../app/ClassicPage.tsx", import.meta.url), "utf8");
  const ids = new Set(loadContent().sections.map((s) => s.id));
  for (const [section, id] of Object.entries(PAGE_HOME)) {
    assert.ok(ids.has(section), `no section with id ${section}`);
    assert.match(page, new RegExp(`id(?:=|: )"${id}"`), `ClassicPage renders no id "${id}"`);
  }
  assert.equal(sectionHomes()["IMG Systems"].href, "#role-3");
  assert.equal(sectionHomes()["Skills"], undefined);
});
