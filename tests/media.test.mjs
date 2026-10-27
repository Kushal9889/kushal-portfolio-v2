import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verify } from "../scripts/verify-media.mjs";

test("every frame and flow map the engine requests exists", () => {
  const r = verify();
  assert.deepEqual(r.errors, []);
  assert.ok(r.checked > 10000);
});

test("an empty deploy directory fails with one error per missing file", () => {
  const r = verify(mkdtempSync(join(tmpdir(), "media-")));
  assert.equal(r.checked, 0);
  assert.ok(r.errors.length > 10000);
});

test("prune refuses to run outside CI or Netlify", () => {
  const env = { ...process.env };
  delete env.CI;
  delete env.NETLIFY;
  delete env.NEXT_PUBLIC_FILM_ORIGIN;
  const r = spawnSync(process.execPath, ["scripts/verify-media.mjs", "--prune", mkdtempSync(join(tmpdir(), "media-"))], { env, encoding: "utf8" });
  assert.notEqual(r.status, 0);
});
