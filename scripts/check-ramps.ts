/**
 * Checks every colour ramp the stage draws between two tokens: the flood from
 * `--void` to `--signal`, and every `color-mix(in oklch, var(--a) N%, var(--b))`
 * in the stage stylesheets. Each ramp is sampled at 5% steps with culori; a step
 * whose chroma falls below the lower of its two ends minus 0.02 fails, because
 * that dip is where a mix turns muddy.
 *
 * Tokens are read from the first `[data-stage]` block of `app/stage.css`, falling
 * back to `:root` in `app/globals.css`, with `var()` aliases followed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { interpolate, oklch, parse } from "culori";

const root = process.cwd();

function block(css: string, selector: string) {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return "";
  return css.slice(at, css.indexOf("\n}", at));
}

function declarations(css: string) {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!out.has(m[1])) out.set(m[1], m[2].trim());
  return out;
}

const stage = declarations(block(readFileSync(join(root, "app/stage.css"), "utf8"), "[data-stage]"));
const legacy = declarations(block(readFileSync(join(root, "app/globals.css"), "utf8"), ":root"));

function resolve(name: string, depth = 0): string | null {
  if (depth > 8) return null;
  const raw = stage.get(name) ?? legacy.get(name);
  if (!raw) return null;
  const alias = raw.match(/^var\((--[\w-]+)\)$/);
  return alias ? resolve(alias[1], depth + 1) : raw;
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith(".css") ? [p] : [];
  });
}

const pairs = new Set<string>(["--void|--signal"]);
for (const file of [join(root, "app/stage.css"), ...cssFiles(join(root, "app/components/stage"))]) {
  for (const m of readFileSync(file, "utf8").matchAll(/color-mix\(in oklch, var\((--[\w-]+)\)[^,]*, var\((--[\w-]+)\)/g)) {
    pairs.add(`${m[1]}|${m[2]}`);
  }
}

let failed = 0;
let checked = 0;
for (const pair of pairs) {
  const [a, b] = pair.split("|");
  const ca = resolve(a);
  const cb = resolve(b);
  const pa = ca ? parse(ca) : undefined;
  const pb = cb ? parse(cb) : undefined;
  if (!pa || !pb) {
    console.log(`skip  ${a} to ${b}: not a literal colour after aliases`);
    continue;
  }
  const mix = interpolate([pa, pb], "oklch");
  const floor = Math.min(oklch(pa)?.c ?? 0, oklch(pb)?.c ?? 0) - 0.02;
  const low = Array.from({ length: 21 }, (_, i) => ({ t: i / 20, c: oklch(mix(i / 20))?.c ?? 0 })).find((s) => s.c < floor);
  checked++;
  if (low) {
    failed++;
    console.log(`FAIL  ${a} to ${b}: chroma ${low.c.toFixed(3)} at ${Math.round(low.t * 100)}%, floor ${floor.toFixed(3)}`);
  } else {
    console.log(`ok    ${a} to ${b}`);
  }
}

console.log(`\ncheck-ramps: ${checked - failed}/${checked} ramps hold their chroma`);
if (failed) process.exit(1);
