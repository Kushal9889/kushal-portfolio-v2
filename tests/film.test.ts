import { test } from "node:test";
import assert from "node:assert/strict";
import { chipOf, reduce, type Provenance, type RequestState } from "../app/components/film/request";

const empty: RequestState = { provenance: { kind: "none" }, sentAt: -1, question: null };
const none: Provenance = { kind: "none" };
const ping = { ms: 1200, tokens: 300, cost: 0, provider: "nvidia" };

function run(events: Parameters<typeof reduce>[2][]) {
  let s = empty;
  let p = none;
  for (const e of events) ({ state: s, previous: p } = reduce(s, p, e));
  return s.provenance;
}

test("the load-time request is RECORDED with its age, never YOUR QUESTION", () => {
  const p = run([
    { type: "sent", detail: { question: null, t0: 10, recorded: true } },
    { type: "done", detail: { ...ping, recorded: true, ranAt: 1_000_000 } },
  ]);
  assert.deepEqual(p, { kind: "recorded", ranAt: 1_000_000 });
  assert.equal(chipOf(p, 1_040_000)?.text, "RECORDED · 40 S AGO");
  assert.equal(chipOf(p, 1_000_000 + 125_000)?.text, "RECORDED · 2 MIN AGO");
  assert.equal(chipOf(p)?.marker, "hollow");
});

test("a fresh answer in this tab is YOUR QUESTION", () => {
  const p = run([
    { type: "sent", detail: { question: "What has he shipped?", t0: 10 } },
    { type: "done", detail: { ...ping, warm: false, degraded: false } },
  ]);
  assert.equal(p.kind, "yours");
  assert.equal(chipOf(p)?.text, "YOUR QUESTION");
  assert.equal(chipOf(p)?.marker, "filled");
});

test("a warm answer is a stored one, and says so without an age it does not have", () => {
  const p = run([
    { type: "sent", detail: { question: "What has he shipped on Azure?", t0: 10 } },
    { type: "done", detail: { ...ping, warm: true } },
  ]);
  assert.equal(chipOf(p)?.text, "RECORDED · STORED ANSWER");
});

test("a degraded answer is the visitor's question, answered from notes only", () => {
  const p = run([
    { type: "sent", detail: { question: "q", t0: 10 } },
    { type: "done", detail: { ...ping, degraded: true } },
  ]);
  assert.equal(chipOf(p)?.text, "YOUR QUESTION · NOTES ONLY");
});

test("a late load-time answer never replaces the visitor's run", () => {
  const p = run([
    { type: "sent", detail: { question: null, t0: 5, recorded: true } },
    { type: "sent", detail: { question: "q", t0: 10 } },
    { type: "done", detail: { ...ping, recorded: true, ranAt: 1 } },
  ]);
  assert.equal(p.kind, "running");
});

test("a request that never answers gives the light back to what it was", () => {
  const p = run([
    { type: "sent", detail: { question: null, t0: 5, recorded: true } },
    { type: "done", detail: { ...ping, recorded: true, ranAt: 7 } },
    { type: "sent", detail: { question: "q", t0: 10 } },
    { type: "timeout" },
  ]);
  assert.deepEqual(p, { kind: "recorded", ranAt: 7 });
});

test("a failed load-time request draws no orange at all", () => {
  const p = run([{ type: "sent", detail: { question: null, t0: 5, recorded: true } }, { type: "timeout" }]);
  assert.equal(p.kind, "none");
  assert.equal(chipOf(p), null);
});

// ---- Step 5: the world as data (plan C1.9, C2.1, K3) ----------------------
import { readFileSync } from "node:fs";

import { existsSync } from "node:fs";
import clipMap from "../content/film-clips.json";

type Row = { beat: string; file: string; span: number[]; time: number[] };
const rows = clipMap.clips as Row[];

test("every point of every beat shows a clip, so the film never drops to black (D36 to D38)", async () => {
  const { ROUTE } = await import("../app/components/film/shots");
  const gaps: string[] = [];
  for (const { id } of ROUTE as { id: string }[])
    for (let k = 0; k <= 20; k++) if (!rows.some((r) => r.beat === id && r.span[0] <= k / 20 && k / 20 <= r.span[1])) gaps.push(`${id}@${k / 20}`);
  assert.deepEqual(gaps, []);
});

test("every clip the map names is a shipped file", () => {
  for (const f of new Set(rows.map((r) => r.file))) assert.ok(existsSync(`public/film/clips/${f}.mp4`), `${f}.mp4 missing`);
});

test("down the page, no clip ever plays backwards (D44)", async () => {
  const { ROUTE } = await import("../app/components/film/shots");
  const order = (ROUTE as { id: string }[]).map((b) => b.id);
  const sorted = [...rows].sort((a, b) => order.indexOf(a.beat) - order.indexOf(b.beat) || a.span[0] - b.span[0]);
  const last = new Map<string, number>();
  for (const r of sorted) {
    assert.ok(r.time[1] >= r.time[0], `${r.file} runs backwards inside ${r.beat}`);
    const before = last.get(r.file);
    assert.ok(before === undefined || r.time[0] >= before - 1e-3, `${r.file} jumps back to ${r.time[0]} in ${r.beat} after reaching ${before}`);
    last.set(r.file, r.time[1]);
  }
});
