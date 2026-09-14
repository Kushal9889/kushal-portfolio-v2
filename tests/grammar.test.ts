import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseFigure,
  settleFrame,
  rolls,
  parseRange,
  ghostStart,
  segmentsFor,
  relativeTime,
  daysSince,
  litPoints,
} from "../lib/numbers";
import { VERBS, STREAM, EXIT } from "../lib/verbs";

/**
 * The number and motion grammar (plan 3.5, 3.6). These guard the one property
 * the page cannot afford to lose: a moving figure never shows a value it does
 * not hold.
 */

const frames = (raw: string, from = 0, steps = 400) =>
  Array.from({ length: steps + 1 }, (_, i) => settleFrame(parseFigure(raw), i / steps, from));

const numeric = (s: string) => Number(s.replace(/[^\d.]/g, ""));

describe("settle frames", () => {
  for (const raw of ["57", "+20%", "-30%", "5,000+", "2,000+", "91.4%", "71/78", "13.5s", "14", "99.1"]) {
    test(`${raw} ends exactly on the corpus string and never exceeds it`, () => {
      const all = frames(raw);
      assert.equal(all.at(-1), raw);
      const target = parseFigure(raw).value;
      let previous = -1;
      for (const f of all.slice(0, -1)) {
        const n = parseFigure(f).value;
        assert.ok(n >= 0, `${f} below zero`);
        assert.ok(n <= target, `${f} above ${raw}`);
        assert.ok(n >= previous, `${f} went backwards`);
        previous = n;
      }
    });
  }

  test("prefix and suffix are held on every frame", () => {
    for (const f of frames("+22%")) assert.match(f, /^\+[\d.]+%$/);
    for (const f of frames("5,000+").slice(1, -1)) assert.match(f, /^[\d,]+\+$/);
  });

  test("decimal places are fixed from the first frame", () => {
    for (const f of frames("91.4%")) assert.match(f, /^\d+\.\d%$/);
  });

  test("a ghosted figure rolls from the top of its before range, never below it", () => {
    const start = ghostStart("up from 75-78%");
    assert.equal(start, 78);
    for (const f of frames("95%", start)) {
      const n = numeric(f);
      assert.ok(n >= 78 && n <= 95, f);
    }
  });

  test("text values do not roll", () => {
    assert.equal(rolls(parseFigure("BM25 + vector")), false, "a name with digits is not a figure");
    assert.equal(rolls(parseFigure("LLM-as-a-Judge")), false);
    assert.equal(settleFrame(parseFigure("LLM-as-a-Judge"), 0.3), "LLM-as-a-Judge");
  });
});

describe("number helpers", () => {
  test("ranges parse", () => {
    assert.deepEqual(parseRange("75-78%"), { low: 75, high: 78, suffix: "%" });
    assert.equal(parseRange("no range"), null);
  });

  test("seven segment digits", () => {
    assert.equal(segmentsFor("8"), "abcdefg");
    assert.equal(segmentsFor("1"), "bc");
    assert.equal(segmentsFor("x"), "");
  });

  test("relative time never reads zero units", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    assert.equal(relativeTime(new Date("2026-09-14T11:59:30Z"), now), "just now");
    assert.equal(relativeTime(new Date("2026-09-14T11:59:10Z"), now), "1 minute ago");
    assert.equal(relativeTime(new Date("2026-09-14T09:00:00Z"), now), "3 hours ago");
    assert.equal(relativeTime(new Date("2026-09-12T12:00:00Z"), now), "2 days ago");
  });

  test("days since the merge floors", () => {
    assert.equal(daysSince(new Date("2026-07-22T00:45:00Z"), new Date("2026-09-14T00:44:00Z")), 53);
    assert.equal(daysSince(new Date("2026-07-22T00:45:00Z"), new Date("2026-09-14T00:46:00Z")), 54);
  });

  test("data art rounds down: top 0.9% of 1,200 lights 10 and a partial eleventh", () => {
    assert.deepEqual(litPoints(0.009, 1200), { full: 10, partial: 0.8 });
    assert.deepEqual(litPoints(2, 10), { full: 10, partial: 0 });
  });
});

describe("motion grammar tokens match the plan", () => {
  test("durations from plan 3.5", () => {
    assert.equal(VERBS.condense.duration, 0.7);
    assert.equal(VERBS.settle.duration, 0.9);
    assert.equal(VERBS.pulse.duration, 0.24);
    assert.equal(VERBS.stamp.duration, 0.42);
    assert.equal(VERBS.stamp.drop, 12);
    assert.equal(VERBS.stamp.flash, 0.16);
    assert.equal(VERBS.print.perLine, 0.018);
    assert.equal(VERBS.print.cap, 2.4);
    assert.equal(VERBS.dock.duration, 0.62);
    assert.equal(VERBS.dock.returnDuration, 0.5);
    assert.equal(VERBS.dock.shove, 4);
    assert.equal(VERBS.dissolve.duration, 0.45);
    assert.equal(VERBS.flood.duration, 1.1);
    assert.equal(STREAM.wordsPerSecond, 28);
    assert.equal(STREAM.charsPerSecond, 90);
    assert.equal(EXIT, 0.65);
  });

  test("no stage component types its own verb duration once migrated", () => {
    // Guard grows as chapters migrate to lib/verbs.ts (plan G.2 R4).
    const verbs = readFileSync(join(process.cwd(), "lib/verbs.ts"), "utf8");
    for (const name of ["condense", "settle", "pulse", "stamp", "print", "dock", "dissolve", "flood"]) {
      assert.match(verbs, new RegExp(`export function ${name}\\(`));
    }
    for (const alias of ["retrieve", "persist", "observe", "verify", "generate", "evaluate", "evict", "act"]) {
      assert.match(verbs, new RegExp(`export const ${alias} = `));
    }
  });
});
