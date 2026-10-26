// Stages the film's frames and flow maps as a static site for a separate media
// origin (Cloudflare Pages: unmetered bandwidth on the free plan, 20,000 files
// and 25 MiB per file per deploy). Bytes are copied as they are; nothing is
// re-encoded. Deploy with:
//   node scripts/stage-media.mjs .media && npx wrangler pages deploy .media --project-name <name>
// then set NEXT_PUBLIC_FILM_ORIGIN on the app host and rebuild it.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verify } from "./verify-media.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: stage-media.mjs <out-dir>");
const { errors } = verify();
if (errors.length) {
  console.error(`FAIL media: ${errors.length} problems; run verify-media.mjs`);
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
for (const d of ["film/frames", "film/flow"]) {
  mkdirSync(join(out, d), { recursive: true });
  cpSync(join("public", d), join(out, d), { recursive: true });
}
// Frames are fetched with fetch() and drawn into WebGL, so they need CORS. One
// day fresh, a week served stale while revalidating: a return visit scrolls
// from cache without asking the network for each of ~4,000 frames.
writeFileSync(
  join(out, "_headers"),
  "/film/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=86400, stale-while-revalidate=604800\n  X-Content-Type-Options: nosniff\n",
);
let files = 0;
let biggest = 0;
const walk = (p) => {
  for (const e of readdirSync(p)) {
    const f = join(p, e);
    const s = statSync(f);
    if (s.isDirectory()) walk(f);
    else { files++; biggest = Math.max(biggest, s.size); }
  }
};
walk(out);
if (files > 20000 || biggest > 25 * 2 ** 20) {
  console.error(`FAIL staged ${files} files, largest ${biggest} bytes: over the Pages limits`);
  process.exit(1);
}
console.log(`PASS staged ${files} files, largest ${(biggest / 2 ** 20).toFixed(1)} MiB, into ${out}`);
