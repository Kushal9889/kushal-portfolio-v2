import { test } from "node:test";
import assert from "node:assert/strict";
import { remainder, defaultOrder, rankChips, profileChips, type Chip } from "../lib/agent/chips";
import index from "../lib/agent/index.json";

test("a chip's name drops its kind's words", () => {
  assert.equal(remainder("NVIDIA", "NVIDIA-Certified Professional: Agentic AI"), "Professional: Agentic AI");
  assert.equal(remainder("Anthropic", "Claude Certified Developer - Foundations"), "Claude Certified Developer - Foundations");
  assert.equal(remainder("RA", "AI Engineer"), "AI Engineer");
  // Never empties a name.
  assert.equal(remainder("NVIDIA", "NVIDIA"), "NVIDIA");
});

const chip = (group: Chip["group"], homes: string[], terms: string[] = [], near: Record<string, number> = {}) => ({ group, homes, terms, near });

test("before an answer: source order, no two of one group touch, ranking last", () => {
  const chips = [chip("role", []), chip("role", []), chip("oss", []), chip("cert", []), chip("cert", []), chip("last", [])];
  const o = defaultOrder(chips);
  assert.deepEqual([...o].sort(), [0, 1, 2, 3, 4, 5]);
  assert.equal(o.at(-1), 5);
  for (let i = 1; i < o.length - 1; i++) assert.notEqual(chips[o[i]].group, chips[o[i - 1]].group);
  // Deterministic: the same order every load.
  assert.deepEqual(defaultOrder(chips), o);
});

test("an answer ranks cited section first, then shared words, then vector closeness", () => {
  const chips = [
    chip("role", ["Harness"], ["harness"]),
    chip("cert", ["Certifications"], ["nvidia", "agentic"]),
    chip("last", ["Proof wall"], [], { IMG: 0.9 }),
    chip("oss", ["Open source"], [], { IMG: 0.4 }),
  ];
  assert.equal(rankChips(chips, { sources: ["Certifications"], answer: "He built a harness." })[0], 1);
  assert.equal(rankChips(chips, { sources: ["IMG"], answer: "The harness gates agents." })[0], 0);
  // No cited home, no shared word: the closer section wins the tie.
  const r = rankChips(chips, { sources: ["IMG"], answer: "Nothing in common." });
  assert.ok(r.indexOf(2) < r.indexOf(3));
  assert.deepEqual(rankChips(chips, null), defaultOrder(chips));
});

test("chip terms and affinities come from the shipped index", () => {
  const [c] = profileChips([{ kind: "NVIDIA", label: "Professional: Agentic AI", href: "", ask: "", group: "cert" as const, homes: ["Certifications"] }], index);
  assert.ok(c.terms.includes("agentic"));
  assert.ok(!c.terms.includes("nvidia"), "the kind's own word is not a term");
  assert.equal(Object.keys(c.near)[0], "Certifications", "a chip is nearest its own section");
});
