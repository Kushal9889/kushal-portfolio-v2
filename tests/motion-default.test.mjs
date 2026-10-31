import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("full motion is the default; only the reader's dock choice turns it off", () => {
  const boot = read("app/components/film/FilmBoot.tsx");
  assert.match(boot, /if\(p!=="reduced"\)p="allowed";/);
  const verbs = read("lib/verbs.ts");
  const body = verbs.slice(verbs.indexOf("export function reducedMotion"), verbs.indexOf("export const VERB_EVENT"));
  assert.doesNotMatch(body, /prefers-reduced-motion/);
});

test("the film is not downgraded by device guesses", () => {
  const film = read("app/components/film/Film.tsx");
  const boot = read("app/components/film/FilmBoot.tsx");
  for (const src of [film, boot]) assert.doesNotMatch(src, /saveData|deviceMemory|hardwareConcurrency|failIfMajorPerformanceCaveat|effectiveType/);
  assert.doesNotMatch(read("app/components/film/engine.ts"), /downgrade/);
});
