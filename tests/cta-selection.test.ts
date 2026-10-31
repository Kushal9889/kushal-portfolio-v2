import test from "node:test";
import assert from "node:assert/strict";
import { chooseCtas } from "../lib/cta-selection";

const seeded = (seed: number) => () => ((seed = (seed * 48271) % 2147483647) - 1) / 2147483646;

test("returns no feature or glow for an empty eligible set", () => {
  assert.deepEqual(chooseCtas([]), { featured: [], lit: null });
});

test("one eligible item is featured and lit", () => {
  assert.deepEqual(chooseCtas([7], 7, seeded(1)), { featured: [7], lit: 7 });
});

test("two eligible items are both featured and only one glows", () => {
  const result = chooseCtas([0, 1], 0, seeded(2));
  assert.equal(result.featured.length, 2);
  assert.equal(result.featured.includes(result.lit!), true);
  assert.notEqual(result.lit, 0);
});

test("three and many eligible items feature exactly three unique valid indexes", () => {
  for (const eligible of [[0, 1, 2], Array.from({ length: 20 }, (_, i) => i)]) {
    const result = chooseCtas(eligible, null, seeded(3));
    assert.equal(result.featured.length, 3);
    assert.equal(new Set(result.featured).size, 3);
    assert.equal(result.featured.every((value) => eligible.includes(value)), true);
    assert.equal(result.featured.includes(result.lit!), true);
  }
});

test("avoids immediately relighting the previous item when alternatives exist", () => {
  const result = chooseCtas([2, 4, 6, 8], 2, seeded(4));
  assert.notEqual(result.lit, 2);
});

test("deduplicates and ignores invalid eligible values without mutating input", () => {
  const eligible = [3, 3, -1, 1.5, NaN, Infinity, 8, 8];
  const before = [...eligible];
  const result = chooseCtas(eligible, null, seeded(5));
  assert.deepEqual(eligible, before);
  assert.equal(result.featured.length, 2);
  assert.deepEqual(new Set(result.featured), new Set([3, 8]));
  assert.deepEqual(chooseCtas(null as unknown as number[]), { featured: [], lit: null });
});

test("seeded RNG is reproducible and selection remains bounded for out-of-range draws", () => {
  assert.deepEqual(chooseCtas([1, 2, 3, 4], null, seeded(42)), chooseCtas([1, 2, 3, 4], null, seeded(42)));
  const result = chooseCtas([1, 2, 3, 4], null, () => 1);
  assert.equal(result.featured.length, 3);
  assert.equal(result.featured.includes(result.lit!), true);
});
