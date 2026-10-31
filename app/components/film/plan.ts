import { ROUTE, START, distance, type Beat, type Shot, type Vec3 } from "./shots";

/**
 * Compiles the route against the page: which camera state belongs to which
 * scroll position, and whether the route fits the reading speed budgets.
 *
 * The state is a 9-vector: target xyz, ln W, azimuth, elevation, ln f, sx, sy.
 * Budgets are counted on apparent scale S = -ln W, which is what a viewer feels
 * as zoom whatever the lens, and on the angle swept (azimuth plus elevation).
 * The same code runs in the browser (engine.ts) and in Node (film-validate.ts),
 * so the page and the check cannot disagree.
 */
export type State = Float64Array;
export const CHANNELS = 9;

/** Budgets per viewport of scroll, by mode. Plan section 5.1. */
export const BUDGET = {
  S: { scale: 0.4, angle: 14, travel: 0.5 },
  T: { scale: 0.9, angle: 30, travel: 1.5 },
};
/** No window may use more than this share of its budget. */
export const MAX_UTIL = 0.88;

// -- Envelope ---------------------------------------------------------------
// Inside each element the camera enters and leaves at 1.21x the mean slope and
// passes a band of 30% at 0.5x: a slow stretch where the subject can be read,
// never a stop. Windows whose set piece is at their end put the band last.
const TABLE = 256;
function envelopeTable(land: boolean) {
  const slope = (p: number) => {
    const soft = (a: number, b: number, x: number) => {
      const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const w = 0.06;
    const inBand = land ? soft(0.7 - w, 0.7 + w, p) : soft(0.35 - w, 0.35 + w, p) * (1 - soft(0.65 - w, 0.65 + w, p));
    return 1.21 + (0.5 - 1.21) * inBand;
  };
  const out = new Float64Array(TABLE + 1);
  for (let i = 1; i <= TABLE; i++) out[i] = out[i - 1] + slope((i - 0.5) / TABLE) / TABLE;
  const total = out[TABLE];
  for (let i = 0; i <= TABLE; i++) out[i] /= total;
  return out;
}
const ENVELOPES = { mid: envelopeTable(false), land: envelopeTable(true) };
function envelope(p: number, land: boolean) {
  const t = ENVELOPES[land ? "land" : "mid"];
  const x = Math.min(Math.max(p, 0), 1) * TABLE;
  const i = Math.min(Math.floor(x), TABLE - 1);
  return t[i] + (t[i + 1] - t[i]) * (x - i);
}

// -- Runs -------------------------------------------------------------------
// A run is a continuous stretch of shots between cuts. Each element maps its
// eased progress onto pieces of runs.
type Piece = { a0: number; a1: number; run: number; j: number };
type Compiled = { runs: Shot[][]; pieces: Map<string, Piece[]> };

function compileRuns(route: Beat[]): Compiled {
  const runs: Shot[][] = [[START]];
  const pieces = new Map<string, Piece[]>();
  for (const beat of route) {
    const list: Piece[] = [];
    let a0 = 0;
    for (const leg of beat.legs) {
      const run = runs.length - 1;
      runs[run].push(leg.shot);
      list.push({ a0, a1: leg.at, run, j: runs[run].length - 2 });
      a0 = leg.at;
      if (leg.cut) runs.push([leg.cut.next]);
    }
    pieces.set(beat.id, list);
  }
  return { runs, pieces };
}

const COMPILED = compileRuns(ROUTE);

/**
 * Monotone cubic (Fritsch-Carlson) through values at unit spacing: C1, and it
 * never overshoots, so a channel that holds between two shots stays held and
 * the budgets measured between shots are the budgets the reader sees.
 */
function monotone(values: number[]) {
  const n = values.length;
  const delta = values.slice(1).map((v, i) => v - values[i]);
  const m = values.map((_, i) => {
    if (i === 0) return delta[0] ?? 0;
    if (i === n - 1) return delta[n - 2];
    const a = delta[i - 1];
    const b = delta[i];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return (i: number, t: number) => {
    const h00 = (1 + 2 * t) * (1 - t) * (1 - t);
    const h10 = t * (1 - t) * (1 - t);
    const h01 = t * t * (3 - 2 * t);
    const h11 = t * t * (t - 1);
    return h00 * values[i] + h10 * m[i] + h01 * values[i + 1] + h11 * m[i + 1];
  };
}

/** Azimuths unwrapped along a run, so 350 to 10 degrees is a 20 degree turn. */
function unwrap(az: number[]) {
  const out = [az[0]];
  for (let i = 1; i < az.length; i++) {
    let a = az[i];
    while (a - out[i - 1] > 180) a -= 360;
    while (a - out[i - 1] < -180) a += 360;
    out.push(a);
  }
  return out;
}

// Per run: the target follows a centripetal spline (a path through space);
// every scalar channel follows its own monotone curve.
const PACKED = COMPILED.runs.map((run) => {
  const az = unwrap(run.map((s) => s.az));
  const scalar = [
    run.map((s) => Math.log(s.W)),
    az,
    run.map((s) => s.el),
    run.map((s) => Math.log(s.f)),
    run.map((s) => s.sx),
    run.map((s) => s.sy),
  ].map(monotone);
  return { target: run.map((s) => s.target), scalar };
});

/**
 * Centripetal Catmull-Rom through the run's targets (the same curve as
 * stage/path.ts segment), written into `out` without allocating: it runs every
 * frame, and the film may add no garbage (plan C6.2).
 */
function knot(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  return Math.sqrt(Math.hypot(bx - ax, by - ay, bz - az)) || 1e-4;
}
function segmentInto(points: Vec3[], i: number, u: number, out: State) {
  const n = points.length;
  const p1 = points[i];
  const p2 = points[Math.min(i + 1, n - 1)];
  const q0 = i > 0 ? points[i - 1] : null;
  const q3 = i + 2 < n ? points[i + 2] : null;
  for (let k = 0; k < 3; k++) {
    // Phantom ends mirror the first and last segments.
    P0[k] = q0 ? q0[k] : 2 * p1[k] - p2[k];
    P3[k] = q3 ? q3[k] : 2 * p2[k] - p1[k];
  }
  const t0 = 0;
  const t1 = t0 + knot(P0[0], P0[1], P0[2], p1[0], p1[1], p1[2]);
  const t2 = t1 + knot(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  const t3 = t2 + knot(p2[0], p2[1], p2[2], P3[0], P3[1], P3[2]);
  const t = t1 + (t2 - t1) * Math.min(Math.max(u, 0), 1);
  const w01 = weight(t, t0, t1), w12 = weight(t, t1, t2), w23 = weight(t, t2, t3), w02 = weight(t, t0, t2), w13 = weight(t, t1, t3);
  for (let k = 0; k < 3; k++) {
    const a1 = P0[k] + (p1[k] - P0[k]) * w01;
    const a2 = p1[k] + (p2[k] - p1[k]) * w12;
    const a3 = p2[k] + (P3[k] - p2[k]) * w23;
    const b1 = a1 + (a2 - a1) * w02;
    const b2 = a2 + (a3 - a2) * w13;
    out[k] = b1 + (b2 - b1) * w12;
  }
}
function weight(t: number, ta: number, tb: number) {
  return tb === ta ? 0 : (t - ta) / (tb - ta);
}
const P0 = [0, 0, 0];
const P3 = [0, 0, 0];

/** State at float point index x along run r. */
function runState(r: number, x: number, out: State) {
  const p = PACKED[r];
  const n = p.target.length;
  if (n === 1) {
    writeShot(COMPILED.runs[r][0], out);
    return out;
  }
  const c = Math.min(Math.max(x, 0), n - 1);
  const i = Math.min(Math.floor(c), n - 2);
  const f = c - i;
  segmentInto(p.target, i, f, out);
  for (let k = 0; k < 6; k++) out[3 + k] = p.scalar[k](i, f);
  return out;
}

export function writeShot(s: Shot, out: State) {
  out[0] = s.target[0]; out[1] = s.target[1]; out[2] = s.target[2];
  out[3] = Math.log(s.W); out[4] = s.az; out[5] = s.el;
  out[6] = Math.log(s.f); out[7] = s.sx; out[8] = s.sy;
  return out;
}

// -- Page geometry ----------------------------------------------------------
export type Span = { id: string; y0: number; y1: number };

/**
 * Scroll ranges per element. An element owns the scroll positions during which
 * its middle line crosses the viewport middle; the hero owns the start.
 */
export function spans(boxes: { id: string; top: number; height: number }[], vh: number): Span[] {
  const half = vh * 0.5;
  const out: Span[] = [];
  for (const beat of ROUTE) {
    if (beat.id === "hero") continue;
    const b = boxes.find((x) => x.id === beat.id);
    if (!b) continue;
    out.push({ id: beat.id, y0: b.top - half, y1: b.top + b.height - half });
  }
  const first = out[0];
  out.unshift({ id: "hero", y0: 0, y1: first ? Math.max(1, first.y0) : vh });
  // Neighbours share their boundary so there is no dead scroll between them.
  for (let i = 1; i < out.length; i++) out[i].y0 = out[i - 1].y1;
  return out;
}

export type Sample = { beat: string; run: number; progress: number };

/**
 * Perceived effort of a step between two states, in viewports of scroll at the
 * mode's budget: whichever of zoom, turn or travel is the most demanding.
 */
function effort(a: State, b: State, mode: "S" | "T") {
  const bud = BUDGET[mode];
  const d = (Math.exp(a[3]) * Math.exp(a[6])) / 38.4;
  return Math.max(
    Math.abs(b[3] - a[3]) / bud.scale,
    (Math.abs(b[4] - a[4]) + Math.abs(b[5] - a[5])) / bud.angle,
    Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / Math.max(d, 1e-4) / bud.travel,
  );
}

/**
 * Each element is reparametrised by accumulated effort, so equal scroll buys
 * equal perceived motion whatever the spacing of its shots. A cut contributes
 * no effort; it happens where the effort before it runs out.
 */
type Table = { piece: Int16Array; t: Float32Array; c: Float64Array; total: number };
const STEPS = 64;
const TABLES = new Map<string, Table>();
{
  const a = new Float64Array(CHANNELS);
  const b = new Float64Array(CHANNELS);
  for (const beat of ROUTE) {
    const pieces = COMPILED.pieces.get(beat.id)!;
    const n = pieces.length * STEPS + 1;
    const table: Table = { piece: new Int16Array(n), t: new Float32Array(n), c: new Float64Array(n), total: 0 };
    let k = 0;
    let acc = 0;
    pieces.forEach((q, pi) => {
      runState(q.run, q.j, a);
      for (let i = pi === 0 ? 0 : 1; i <= STEPS; i++) {
        runState(q.run, q.j + i / STEPS, b);
        if (i > 0) acc += effort(a, b, beat.mode);
        table.piece[k] = pi;
        table.t[k] = i / STEPS;
        table.c[k] = acc;
        k++;
        a.set(b);
      }
    });
    table.total = acc;
    TABLES.set(beat.id, table);
  }
}

const BEAT = new Map(ROUTE.map((b) => [b.id, b]));

/**
 * Camera goal for a scroll position, and which beat and run it is in. Pass
 * `into` to reuse a result object, as the per-frame caller does.
 */
export function sample(list: Span[], y: number, out: State, into?: Sample): Sample {
  let k = list.length - 1;
  for (let i = 0; i < list.length; i++) {
    if (y < list[i].y1) {
      k = i;
      break;
    }
  }
  const span = list[k];
  const beat = BEAT.get(span.id)!;
  const p = Math.min(Math.max((y - span.y0) / Math.max(1, span.y1 - span.y0), 0), 1);
  const e = envelope(p, !!beat.land);
  const pieces = COMPILED.pieces.get(beat.id)!;
  const table = TABLES.get(beat.id)!;
  const n = table.c.length;
  let pi: number;
  let t: number;
  if (table.total <= 1e-9) {
    pi = Math.min(pieces.length - 1, Math.floor(e * pieces.length));
    t = e * pieces.length - pi;
  } else {
    const want = e * table.total;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table.c[mid] < want) lo = mid;
      else hi = mid;
    }
    const span2 = table.c[hi] - table.c[lo];
    const w = span2 > 0 ? (want - table.c[lo]) / span2 : 0;
    // Stay on the earlier piece until the effort before a cut is spent.
    pi = w < 1 || table.piece[hi] === table.piece[lo] ? table.piece[lo] : table.piece[hi];
    const t0 = table.piece[lo] === pi ? table.t[lo] : 0;
    const t1 = table.piece[hi] === pi ? table.t[hi] : 1;
    t = t0 + (t1 - t0) * w;
  }
  const piece = pieces[pi];
  runState(piece.run, piece.j + t, out);
  const r = into ?? { beat: "", run: 0, progress: 0 };
  r.beat = beat.id;
  r.run = piece.run;
  r.progress = e;
  return r;
}

/** Distance, field of view and eye for a state. */
export function lensOf(s: State) {
  const W = Math.exp(s[3]);
  const f = Math.exp(s[6]);
  return { W, f, d: (W * f) / 38.4, fov: (2 * Math.atan(12 / f) * 180) / Math.PI };
}

// -- Budgets ----------------------------------------------------------------
export type Cost = { id: string; mode: "S" | "T"; effort: number };

/** Effort each element asks for, in viewports at its mode's budget (cuts carry none). */
export function costs(): Cost[] {
  return ROUTE.map((b) => ({ id: b.id, mode: b.mode, effort: TABLES.get(b.id)!.total }));
}

/** Peak slope of either envelope, relative to the element's mean, as built. */
export const EDGE = Math.max(
  ...[ENVELOPES.mid, ENVELOPES.land].map((t) => {
    let m = 0;
    for (let i = 1; i <= TABLE; i++) m = Math.max(m, (t[i] - t[i - 1]) * TABLE);
    return m;
  }),
);

/**
 * Smallest height, in viewports, at which an element stays within MAX_UTIL of
 * its budget everywhere, including its faster entrance and exit.
 */
export function needVh(c: Cost) {
  return (c.effort * EDGE) / MAX_UTIL;
}

/**
 * Transit window heights in viewports: the authored height, or more when the
 * route needs it. Pure, so the server renders the windows at their final size.
 */
export const TRANSIT_VH: Record<string, number> = Object.fromEntries(
  costs()
    .filter((c) => c.mode === "T")
    .map((c) => {
      const beat = ROUTE.find((b) => b.id === c.id)!;
      return [c.id, Math.ceil(Math.max(beat.vh ?? 0.5, needVh(c) * 1.02) * 10) / 10];
    }),
);

export const shotDistance = distance;

/**
 * Where piece k of a beat begins, as a share of the beat's progress (the
 * envelope value `sample` returns). Part animations key off it: T3's third
 * piece is Act 3, which starts at the grid cut.
 */
export function pieceStart(beatId: string, k: number) {
  const table = TABLES.get(beatId);
  if (!table || table.total <= 0) return 0;
  for (let i = 0; i < table.piece.length; i++) if (table.piece[i] === k) return table.c[i] / table.total;
  return 1;
}
