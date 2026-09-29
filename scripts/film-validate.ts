/**
 * Checks the film route against the measured page: every 0.25 viewport of
 * scroll must stay within 88% of its reading or transit budget.
 *
 *   npx tsx scripts/film-validate.ts            uses measure-1440.json
 *   npx tsx scripts/film-validate.ts 1280 1920
 *
 * Section heights come from scripts/film-measure.py. Transit windows are laid
 * out at the heights the compiler gives them, so the check sees the page the
 * build will render. Exits 1 on any breach.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET, CHANNELS, MAX_UTIL, TRANSIT_VH, costs, needVh, sample, spans } from "../app/components/film/plan";
import { ROUTE } from "../app/components/film/shots";
import { PLACES } from "../app/components/film/beats";
import { eyeOf } from "../app/components/film/camera";

/**
 * Solid volumes the eye may never enter (plan C4.3). The hero rack is open
 * above its hero server, because the descent X-rays the servers there.
 */
const RACK_TOP = PLACES.floorY + 48 * 0.04445;
const SOLID: { name: string; min: number[]; max: number[] }[] = [
  { name: "GPU row", min: [-13.2, PLACES.floorY, -0.6], max: [-0.3, RACK_TOP, 0.6] },
  { name: "hero rack below its server", min: [-0.3, PLACES.floorY, -0.6], max: [0.3, -0.06, 0.6] },
  { name: "opposite row", min: [-13.2, PLACES.floorY, PLACES.northZ - 0.6], max: [0.3, RACK_TOP, PLACES.northZ + 0.6] },
  { name: "floor", min: [-40, -10, -20], max: [40, PLACES.floorY, 20] },
];

type Measure = { width: number; height: number; sections: { id: string | null; transit: string | null; top: number; height: number }[] };

const dir = join(__dirname, "..", "..", ".playwright-mcp", "film");
const widths = process.argv.slice(2).length ? process.argv.slice(2) : ["1440"];
let failed = false;

for (const w of widths) {
  const m: Measure = JSON.parse(readFileSync(join(dir, `measure-${w}.json`), "utf8"));
  const vh = m.height;
  // Re-flow: keep measured sections, resize transit windows to the compiled heights.
  let y = m.sections[0].top;
  const boxes = m.sections.map((s) => {
    const id = (s.id ?? s.transit)!;
    const h = s.transit ? TRANSIT_VH[id] * vh : s.height;
    const box = { id, top: y, height: h };
    y += h;
    return box;
  });
  const list = spans(boxes, vh);
  const pageVh = (y + 200) / vh;

  console.log(`\n== ${w}px, viewport ${vh}px, page about ${pageVh.toFixed(1)} vh`);
  const cost = new Map(costs().map((c) => [c.id, c]));
  const a = new Float64Array(CHANNELS);
  const b = new Float64Array(CHANNELS);
  const step = vh * 0.25;
  const worst = new Map<string, { util: number; at: number; why: string }>();
  const end = list[list.length - 1].y1;
  for (let y0 = 0; y0 + step <= end; y0 += step / 4) {
    const s0 = sample(list, y0, a);
    const s1 = sample(list, y0 + step, b);
    if (s0.run !== s1.run) continue; // a cut: no travel is seen
    if (s0.beat !== s1.beat) continue; // a boundary: each side is judged on its own budget
    const mode = ROUTE.find((r) => r.id === s0.beat)!.mode;
    const bud = BUDGET[mode];
    const dS = Math.abs(b[3] - a[3]) / (0.25 * bud.scale);
    const dA = (Math.abs(b[4] - a[4]) + Math.abs(b[5] - a[5])) / (0.25 * bud.angle);
    const d = (Math.exp(a[3]) * Math.exp(a[6])) / 38.4;
    const dT = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / Math.max(d, 1e-4) / (0.25 * bud.travel);
    const util = Math.max(dS, dA, dT);
    const why = util === dS ? "scale" : util === dA ? "angle" : "travel";
    const cur = worst.get(s0.beat);
    if (!cur || util > cur.util) worst.set(s0.beat, { util, at: y0, why });
  }

  // Eye-in-geometry: sample the eye every 0.25% of the page.
  const hits = new Map<string, string>();
  const eye: [number, number, number] = [0, 0, 0];
  for (let i = 0; i <= 400; i++) {
    const yy = (end * i) / 400;
    const s0 = sample(list, yy, a);
    eyeOf(a, eye);
    for (const box of SOLID) {
      if (eye.every((v, k) => v > box.min[k] && v < box.max[k])) {
        if (!hits.has(s0.beat)) hits.set(s0.beat, `${box.name} at eye (${eye.map((v) => v.toFixed(2)).join(", ")})`);
      }
    }
  }

  console.log("beat        mode  height vh  need vh  peak util  by");
  for (const beat of ROUTE) {
    const span = list.find((s) => s.id === beat.id);
    const wv = worst.get(beat.id);
    const c = cost.get(beat.id)!;
    const h = span ? (span.y1 - span.y0) / vh : 0;
    const inside = hits.get(beat.id);
    const bad = (wv && wv.util > MAX_UTIL) || !!inside;
    if (bad) failed = true;
    console.log(
      `${beat.id.padEnd(11)} ${beat.mode}     ${h.toFixed(2).padStart(6)}   ${needVh(c).toFixed(2).padStart(6)}   ${wv ? (wv.util * 100).toFixed(0).padStart(5) + "%" : "    -"}   ${wv?.why ?? ""}${bad ? "   FAIL" : ""}${inside ? "   eye inside " + inside : ""}`,
    );
  }
  const tv = Object.values(TRANSIT_VH).reduce((s, v) => s + v, 0);
  console.log(`transit windows total ${tv.toFixed(1)} vh:`, Object.entries(TRANSIT_VH).map(([k, v]) => `${k} ${v}`).join(", "));
}

process.exit(failed ? 1 : 0);
