import test from "node:test";
import assert from "node:assert/strict";
import { evidencePresentation } from "../lib/evidence-presentation";

const one = {
  answer: "**Kushal built a tool.**",
  route: "answer",
  sources: ["Work"],
  grounding: { claims: 0, found: 0, g: 1, unsupported: [] },
  citations: [{ sentence: "Kushal built a tool.", source: "Work", id: "Work#0", n: 1, text: "Kushal built a tool." }],
};
const result = (changes: Record<string, unknown> = {}) => ({ ...one, ...changes });

test("supported requires complete source-linked citations and consistent grounding", () => {
  const view = evidencePresentation(one);
  assert.equal(view.state, "supported");
  assert.equal(view.allowAnswer && view.allowAside && view.scoreAllowed, true);
});

test("optional current record accepts canonical quotes and rejects forged or stale passages", () => {
  assert.equal(evidencePresentation(one, false, { Work: "The record says Kushal built a tool." }).state, "supported");
  assert.equal(evidencePresentation(result({ citations: [{ ...one.citations[0], text: "Kushal invented a platform." }] }), false, { Work: "Kushal built a tool." }).state, "withheld");
  assert.equal(evidencePresentation(result({ citations: [{ ...one.citations[0], text: "Formerly, he built a tool." }] }), false, { Work: "Kushal built a tool." }).state, "withheld");
});

test("record lookup requires an own string-valued source key", () => {
  assert.equal(evidencePresentation(one, false, { Other: "Kushal built a tool." }).state, "withheld");
  const inherited = Object.create({ Work: "Kushal built a tool." }) as Record<string, string>;
  assert.equal(evidencePresentation(one, false, inherited).state, "withheld");
  const wrongType = { Work: 3 } as unknown as Record<string, string>;
  assert.equal(evidencePresentation(one, false, wrongType).state, "withheld");
});

test("degraded answer must match a current source when a record is supplied", () => {
  assert.equal(evidencePresentation(result({ degraded: true }), false, { Work: "Kushal built a tool." }).state, "retrieved");
  assert.equal(evidencePresentation(result({ degraded: true }), false, { Work: "A different passage." }).state, "withheld");
});

test("normalized redacted quote still matches its sanitized current record", () => {
  const redacted = result({
    answer: "Kushal worked with [redacted] to build a tool.",
    citations: [{ sentence: "Kushal worked with [redacted] to build a tool.", source: "Work", n: 1, text: "**Kushal worked with [redacted]** to build a tool." }],
  });
  assert.equal(evidencePresentation(redacted, false, { Work: "Kushal worked with [redacted] to build a tool." }).state, "supported");
});

test("repeated citation numbers may repeat only compatible source and id", () => {
  const view = evidencePresentation(result({
    answer: "Kushal built a tool. The tool is useful.",
    citations: [
      { sentence: "Kushal built a tool.", source: "Work", id: "Work#0", n: 1, text: "Passage." },
      { sentence: "The tool is useful.", source: "Work", id: "Work#0", n: 1 },
    ],
  }));
  assert.equal(view.state, "supported");
});

test("missing, inconsistent, or unsupported grounding withholds markers", () => {
  for (const grounding of [undefined, { claims: 2, found: 1, g: .5, unsupported: [] }, { claims: 1, found: 1, g: 1, unsupported: ["99"] }]) {
    const view = evidencePresentation(result({ grounding }));
    assert.equal(view.state, "withheld");
    assert.deepEqual(view.citations, []);
  }
});

test("conflicting repeated source, id, passage text, source-list mismatch, and missing passage withhold", () => {
  const base = { answer: "Kushal built a tool. Another useful tool.", citations: [
    { sentence: "Kushal built a tool.", source: "Work", id: "Work#0", n: 1, text: "Passage." },
    { sentence: "Another useful tool.", source: "Work", n: 1 },
  ] };
  assert.equal(evidencePresentation(result({ ...base, citations: [base.citations[0], { ...base.citations[1], source: "Other" }] })).state, "withheld");
  assert.equal(evidencePresentation(result({ ...base, citations: [base.citations[0], { ...base.citations[1], id: "Work#1" }] })).state, "withheld");
  assert.equal(evidencePresentation(result({ ...base, citations: [base.citations[0], { ...base.citations[1], text: "Different passage." }] })).state, "withheld");
  assert.equal(evidencePresentation(result({ ...base, sources: ["Other"] })).state, "withheld");
  assert.equal(evidencePresentation(result({ ...base, citations: base.citations.map(({ text: _text, ...citation }) => citation) })).state, "withheld");
});

test("orphan markers and uncited statements withhold all citation output", () => {
  assert.equal(evidencePresentation(result({ answer: "Kushal built a tool. [2]" })).state, "withheld");
  assert.equal(evidencePresentation(result({
    answer: "Kushal built a tool. [1]",
    citations: [{ ...one.citations[0], sentence: "Kushal built a tool. [1]" }],
  })).state, "withheld");
  assert.deepEqual(evidencePresentation(result({ answer: "Kushal built a tool. Another claim." })).citations, []);
});

test("malformed arrays, null-ish input, and invalid fields never throw", () => {
  for (const input of [null, undefined, 4, result({ sources: "Work" }), result({ citations: [null] }), result({ grounding: { claims: 0, found: 0, g: 1, unsupported: null } })]) {
    assert.doesNotThrow(() => evidencePresentation(input));
    assert.equal(evidencePresentation(input).state, "withheld");
  }
});

test("pending holds everything; failed partial output is withheld", () => {
  const pending = evidencePresentation(one, true);
  assert.equal(pending.state, "pending");
  assert.equal(pending.allowAnswer || pending.allowAside || pending.scoreAllowed, false);
  assert.deepEqual(pending.citations, []);
  assert.equal(evidencePresentation(result({ answer: "partial", failed: true })).state, "withheld");
});

test("degraded mode allows only retrieved text with a source and no score or aside", () => {
  const view = evidencePresentation(result({ degraded: true }));
  assert.equal(view.state, "retrieved");
  assert.equal(view.allowAnswer, true);
  assert.equal(view.allowAside || view.scoreAllowed, false);
  assert.deepEqual(view.citations, []);
  assert.equal(evidencePresentation(result({ degraded: true, sources: [] })).state, "withheld");
});

test("retrieved section names without citations remain unverified context", () => {
  const view = evidencePresentation(result({ sources: ["Work"], citations: [], grounding: undefined }));
  assert.equal(view.state, "withheld");
  assert.equal(view.allowAnswer || view.scoreAllowed, false);
  assert.deepEqual(view.citations, []);
});

test("a non-answer with retrieved sections does not acquire citation markers", () => {
  const view = evidencePresentation(result({ route: "deflect", sources: ["Work"], citations: [], grounding: undefined }));
  assert.equal(view.state, "non-answer");
  assert.equal(view.allowAnswer, true);
  assert.equal(view.scoreAllowed, false);
  assert.deepEqual(view.citations, []);
});

test("deterministic deflection, handoff, authorization, and action routes are non-answers", () => {
  for (const route of ["deflect", "handoff", "authorisation", "act"]) {
    const view = evidencePresentation(result({ route, grounding: undefined, citations: [] }));
    assert.equal(view.state, "non-answer");
    assert.equal(view.allowAnswer, true);
    assert.equal(view.allowAside || view.scoreAllowed, false);
  }
  assert.equal(evidencePresentation(result({ route: "act", answer: "" })).state, "withheld");
  assert.equal(evidencePresentation(result({ route: "act", answer: null })).state, "withheld");
});

test("unknown routes fail closed", () => {
  assert.equal(evidencePresentation(result({ route: "maybe-answer" })).state, "withheld");
  assert.equal(evidencePresentation(result({ route: "tool" })).state, "withheld");
});

test("input is not mutated", () => {
  const input = structuredClone(one);
  evidencePresentation(input);
  assert.deepEqual(input, one);
});
