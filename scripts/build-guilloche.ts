/**
 * Guilloche, generated once at build time.
 *
 * Guilloche is the interlacing line-work engraved on banknotes, share
 * certificates and passports. It exists for one reason: a pattern produced by a
 * geometric lathe is expensive to forge and trivial to check by eye, so its
 * presence on a document is a claim that the document can be verified. That is
 * the argument this page makes about itself, which is why it is the one
 * ornament here that is not decoration.
 *
 * Written to files rather than drawn in the browser. A live SVG filter is
 * computed per pixel and gets expensive on a high-DPI phone; a file is painted
 * once and cached. The seed is a constant, so the artwork is byte-identical on
 * every build and a diff never shows noise.
 *
 * Nothing here reads the corpus and nothing here can state a fact, so it is
 * outside the truth checks by construction.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public");

/** Fixed, so two builds produce the same file. */
const SEED = 0x5bf03635;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A guilloche band, by straight-line engine turning.
 *
 * The historical machine rocks a cutter along a straight rosette while the work
 * advances, which traces a sinusoid whose amplitude is itself modulated by a
 * slower one. Stacking a few at shifted phase makes the bands cross and
 * interlace, and the crossings are the part that is hard to redraw by hand.
 */
function band(width: number, height: number, lines: number): string {
  const mid = height / 2;
  const paths: string[] = [];

  for (let i = 0; i < lines; i++) {
    const phase = (i / lines) * Math.PI * 2;
    // Two incommensurable periods, so the curve does not repeat inside the
    // width and the band reads as continuous rather than as a tile.
    const fast = 0.055 + i * 0.0032;
    const slow = 0.0091;
    const amp = mid * (0.34 + 0.5 * (i / lines));

    let d = "";
    for (let x = 0; x <= width; x += 4) {
      const envelope = Math.sin(x * slow + phase * 0.5);
      const y = mid + Math.sin(x * fast + phase) * amp * envelope;
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)} `;
    }
    paths.push(`<path d="${d.trim()}" pathLength="1" />`);
  }

  return paths.join("");
}

/**
 * A rosette, by hypotrochoid.
 *
 * The circular form of the same machine. This is the shape on a seal, and a
 * seal is the mark put on a document by whoever is standing behind it.
 */
function rosette(size: number, petals: number, rings: number): string {
  const c = size / 2;
  const paths: string[] = [];

  for (let k = 0; k < rings; k++) {
    const R = c * (0.94 - k * 0.1);
    const r = R / petals;
    const d0 = r * (1.55 + k * 0.16);
    let d = "";
    for (let t = 0; t <= Math.PI * 2 * petals; t += 0.06) {
      const x = (R - r) * Math.cos(t) + d0 * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - d0 * Math.sin(((R - r) / r) * t);
      d += `${d === "" ? "M" : "L"}${(c + x).toFixed(1)} ${(c + y).toFixed(1)} `;
    }
    paths.push(`<path d="${d.trim()}" pathLength="1" />`);
  }

  return paths.join("");
}

/**
 * `currentColor` throughout, so one file serves both themes and the opacity is
 * decided by the stylesheet that places it rather than baked into the artwork.
 */
function svg(w: number, h: number, body: string, sw = 1.4): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `fill="none" stroke="currentColor" stroke-width="${sw}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`
  );
}

/*
 * No grain tile, and that is deliberate.
 *
 * The plan this file came from called for one. A previous phase had already
 * tried a full-viewport noise overlay and removed it with a measurement written
 * into globals.css: at 0.028 alpha it changed no pixel a reader could name, and
 * at any opacity where it did, it read as a filter rather than as tooth. Adding
 * it back would re-run a settled experiment and ship a change nobody can see.
 *
 * Line-work is the opposite case. It is drawn at display scale, so it is
 * legible as an object rather than as atmosphere, which is the whole reason it
 * is the ornament this page uses.
 */

/* ------------------------------------------------------------------- main */

writeFileSync(join(OUT, "headpiece.svg"), svg(1200, 84, band(1200, 84, 9), 1.5));
writeFileSync(join(OUT, "seal.svg"), svg(120, 120, rosette(120, 7, 3), 0.9));

console.log("guilloche: headpiece.svg, seal.svg");
