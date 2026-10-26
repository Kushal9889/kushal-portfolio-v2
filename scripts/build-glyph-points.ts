import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decompress } from "wawoff2";
import opentype from "opentype.js";
import { loadContent, section } from "../lib/content";
import evals from "../content/evals.json";

/**
 * Samples the outlines of the page's monument figures into fixed-count point
 * sets (plan G.1 #13), written to lib/glyph-points.json. The field's particles
 * condense into these shapes and dissolve out of them. Points are in em units,
 * centred on the string's box, y up. The strings are read from the corpus, so a
 * changed figure changes its shape at the next build.
 */

const COUNT = 600;
const WIDTH = 90;
const WEIGHT = 820;

type Point = [number, number];

function sample(path: opentype.Path, count: number): Point[] {
  // Flatten every contour into segments, then walk them at an even arc step.
  const segments: [Point, Point][] = [];
  let start: Point = [0, 0];
  let at: Point = [0, 0];
  const push = (to: Point) => {
    segments.push([at, to]);
    at = to;
  };
  for (const c of path.commands) {
    if (c.type === "M") {
      start = [c.x, c.y];
      at = start;
    } else if (c.type === "L") {
      push([c.x, c.y]);
    } else if (c.type === "Q" || c.type === "C") {
      const from = at;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        const p: Point =
          c.type === "Q"
            ? [u * u * from[0] + 2 * u * t * c.x1 + t * t * c.x, u * u * from[1] + 2 * u * t * c.y1 + t * t * c.y]
            : [
                u * u * u * from[0] + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
                u * u * u * from[1] + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
              ];
        push(p);
      }
    } else if (c.type === "Z") {
      push(start);
    }
  }
  const lengths = segments.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lengths.reduce((s, l) => s + l, 0);
  const points: Point[] = [];
  let seg = 0;
  let walked = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    while (seg < segments.length - 1 && walked + lengths[seg] < target) walked += lengths[seg++];
    const [a, b] = segments[seg];
    const t = lengths[seg] ? (target - walked) / lengths[seg] : 0;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return points;
}

async function main() {
  const woff2 = readFileSync(join(process.cwd(), "app/fonts/HubotSans-latin-var.woff2"));
  const ttf = await decompress(woff2);
  const font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
  const variation = { wght: WEIGHT, wdth: WIDTH };

  const hours = section("Open source, LangChain deepagents").metrics.find((m) => /hour/i.test(m.value));
  const combined = section("Publications").metrics.find((m) => /combined/i.test(m.label));
  const strings = [
    hours?.value.replace(/\s*hours?$/i, ""),
    `${evals.totalPasses}/${evals.totalRuns}`,
    combined?.value,
  ].filter(Boolean) as string[];

  const out: Record<string, number[]> = {};
  for (const text of strings) {
    // Glyph by glyph with advance widths: the font's contextual substitutions are
    // a lookup format opentype.js does not parse, and these strings need none.
    const path = new opentype.Path();
    let x = 0;
    for (const ch of text) {
      const glyph = font.charToGlyph(ch);
      const options = { variation } as unknown as opentype.RenderOptions;
      path.extend(glyph.getPath(x, 0, 1, options, font));
      x += (glyph.advanceWidth ?? 0) / font.unitsPerEm;
    }
    const box = path.getBoundingBox();
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;
    // opentype paths are y down; the field is y up.
    out[text] = sample(path, COUNT).flatMap(([x, y]) => [Math.round((x - cx) * 1000) / 1000, Math.round((cy - y) * 1000) / 1000]);
  }
  writeFileSync(join(process.cwd(), "lib/glyph-points.json"), `${JSON.stringify({ count: COUNT, variation, strings: out })}\n`);
  console.log(`glyph-points: ${Object.keys(out).join(", ")} at ${COUNT} points (profile ${loadContent().profile.name})`);
}

main();
