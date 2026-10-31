// Film media gate. The engine (app/components/film/engine.ts) reads frame counts
// from content/film-frames.json and fetches /film/frames/<tier>/<clip>/NNNN.webp,
// d4 for clips whose source width is 3840, plus /film/flow/<d|p>/<clip>.png.
// A missing frame is a blank or frozen film on a visitor's screen, so every
// expected file must exist and be a non-empty WebP/PNG.
//
// The mp4 masters in public/film/clips are only read by the authoring scripts.
// `--prune <dir>` deletes them from a deploy copy (CI clone or a build output),
// never from the authoring checkout: it refuses to run outside CI/Netlify.
import { existsSync, readFileSync, readdirSync, rmSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const frames = JSON.parse(readFileSync(join(root, "content/film-frames.json"), "utf8"));
const clips = JSON.parse(readFileSync(join(root, "content/film-clips.json"), "utf8")).clips;

const magic = (file, bytes) => {
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(12);
  readSync(fd, buf, 0, 12, 0);
  closeSync(fd);
  return bytes(buf);
};
const isWebp = (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
const isPng = (b) => b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG";

export function verify(dir = join(root, "public")) {
  const errors = [];
  const used = new Set(clips.map((c) => c.file));
  for (const file of used) {
    for (const tier of ["d", "p"]) if (!frames[tier]?.[file]) errors.push(`${file}: no ${tier} frame count`);
  }
  let checked = 0;
  for (const tier of ["d", "p", "d4"]) {
    for (const file of used) {
      if (tier === "d4" && frames.w?.[file] !== 3840) continue;
      // d4 is drawn with the d tier's frame count, so it needs at least that many.
      const n = frames[tier === "d4" ? "d" : tier]?.[file] ?? 0;
      for (let i = 1; i <= n; i++) {
        const f = join(dir, "film/frames", tier, file, `${String(i).padStart(4, "0")}.webp`);
        if (!existsSync(f)) { errors.push(`missing ${f.slice(dir.length)}`); continue; }
        if (statSync(f).size < 64 || !magic(f, isWebp)) errors.push(`not a webp ${f.slice(dir.length)}`);
        checked++;
      }
    }
  }
  for (const t of ["d", "p"]) {
    for (const file of used) {
      const f = join(dir, "film/flow", t, `${file}.png`);
      if (!existsSync(f) || !magic(f, isPng)) errors.push(`missing flow ${f.slice(dir.length)}`);
      else checked++;
    }
  }
  return { errors, checked, clips: used.size };
}

const sizeOf = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((s, e) => s + sizeOf(join(p, e)), 0) : statSync(p).size);

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf("--prune");
  const dir = at > 0 ? process.argv[at + 1] : join(root, "public");
  const { errors, checked, clips: n } = verify(dir);
  for (const e of errors.slice(0, 20)) console.error(e);
  if (errors.length) {
    console.error(`FAIL media: ${errors.length} problems over ${n} clips`);
    process.exit(1);
  }
  console.log(`PASS media: ${checked} frames and flow maps for ${n} clips`);
  // With a media origin set, the app no longer serves frames, so the origin must
  // serve these exact bytes with CORS before they leave the app's deploy.
  const origin = process.env.NEXT_PUBLIC_FILM_ORIGIN;
  if (origin) {
    const samples = [];
    for (const c of clips) {
      const file = c.file;
      const last = String(frames.d[file]).padStart(4, "0");
      samples.push(`film/frames/d/${file}/0001.webp`, `film/frames/p/${file}/${String(frames.p[file]).padStart(4, "0")}.webp`, `film/frames/d/${file}/${last}.webp`, `film/flow/d/${file}.png`);
      if (frames.w?.[file] === 3840) samples.push(`film/frames/d4/${file}/${last}.webp`);
    }
    const bad = [];
    await Promise.all([...new Set(samples)].map(async (s) => {
      try {
        const r = await fetch(`${origin}/${s}`, { headers: { Origin: "https://example.invalid" }, signal: AbortSignal.timeout(15000) });
        const body = Buffer.from(await r.arrayBuffer());
        if (!r.ok) bad.push(`${s}: HTTP ${r.status}`);
        else if (r.headers.get("access-control-allow-origin") !== "*") bad.push(`${s}: no CORS header`);
        else if (!body.equals(readFileSync(join(dir, s)))) bad.push(`${s}: bytes differ from public/`);
      } catch (e) { bad.push(`${s}: ${e.message}`); }
    }));
    for (const b of bad.slice(0, 20)) console.error(b);
    if (bad.length) {
      console.error(`FAIL media origin ${origin}: ${bad.length} of ${new Set(samples).size} samples`);
      process.exit(1);
    }
    console.log(`PASS media origin: ${new Set(samples).size} samples byte-identical with CORS`);
  }
  if (at > 0) {
    if (!process.env.CI && !process.env.NETLIFY) {
      console.error("FAIL --prune runs only in CI or Netlify, never on the authoring checkout");
      process.exit(1);
    }
    const masters = join(dir, "film/clips");
    if (existsSync(masters)) {
      const bytes = sizeOf(masters);
      rmSync(masters, { recursive: true });
      console.log(`pruned film/clips masters: ${(bytes / 2 ** 20).toFixed(0)} MiB kept out of the deploy`);
    }
    if (origin) {
      for (const d of ["film/frames", "film/flow"]) rmSync(join(dir, d), { recursive: true, force: true });
      console.log("pruned film/frames and film/flow: served by the media origin");
    }
  }
}
