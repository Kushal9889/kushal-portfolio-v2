import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "../lib/content";

// Strict rule (Kushal, 2026-10-02): every stated figure is reachable by a link.
// A source is a URL or the literal `resume`, which renders as the resume PDF.
test("every metric names a source", () => {
  const { sections } = loadContent();
  const bare: string[] = [];
  for (const s of sections) {
    for (const m of s.metrics) {
      if (!m.source) bare.push(`${s.title}: ${m.value} ${m.label}`);
    }
  }
  assert.deepEqual(bare, [], `metrics without a source:\n${bare.join("\n")}`);
});

test("every source is a link or the resume", () => {
  const { sections } = loadContent();
  for (const s of sections) {
    for (const m of s.metrics) {
      assert.match(m.source ?? "", /^(https?:\/\/\S+|resume)$/, `${s.title}: ${m.label}`);
    }
  }
});

test("every quoted sentence shares a paragraph with a link", () => {
  const text = readFileSync(join(process.cwd(), "content/facts.md"), "utf8");
  const bare: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const quotes = para.match(/"[^"\n]{25,}"/g) ?? [];
    if (quotes.length && !/https?:\/\//.test(para)) bare.push(quotes[0] ?? "");
  }
  assert.deepEqual(bare, [], `quotes without a link in their paragraph:\n${bare.join("\n")}`);
});

test("every section with a bold claim names a witness (@source)", () => {
  const { sections } = loadContent();
  const bare = sections.filter((s) => /\*\*[^*]+\*\*/.test(s.body) && !s.claim).map((s) => s.title);
  assert.deepEqual(bare, [], `sections with bold claims and no @source:\n${bare.join("\n")}`);
});

test("every badge is a link or the resume", () => {
  const { sections } = loadContent();
  const badges = sections.flatMap((s) => s.badges);
  assert.ok(badges.length >= 8, "the proof wall has its tiles");
  for (const b of badges) assert.match(b.href, /^(https?:\/\/\S+|\/kushal-gaddamwar-resume\.pdf)$/, b.label);
});
