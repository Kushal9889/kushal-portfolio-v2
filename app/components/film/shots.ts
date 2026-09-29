import { PLACES } from "./beats";

/**
 * The film's route, written the way a camera operator reads a shot list.
 *
 * A shot is a look-at target, a framing width W in metres (how much of the
 * world spans the frame), a lens focal length f in full-frame millimetres,
 * azimuth and elevation in degrees, and the screen point (sx, sy) the target
 * sits on. Distance follows from W and f: d = W * f / 38.4, where 38.4 mm is
 * the width of a 24 mm sensor at 16:10. Writing W instead of d keeps what the
 * reader sees independent of the lens; the lens then only sets perspective.
 *
 * Every page element owns one beat. A beat lists the shots it passes through,
 * each at a fraction of the element's scroll range; the first shot of a beat is
 * the last shot of the one before, so the route is continuous unless a shot
 * carries a cut.
 */
export type Vec3 = [number, number, number];

export type Shot = { target: Vec3; W: number; f: number; az: number; el: number; sx: number; sy: number };

export type Cut = { kind: "slit" | "grid" | "focus" | "lattice"; next: Shot };

export type Leg = { at: number; shot: Shot; cut?: Cut };

export type Beat = {
  id: string;
  mode: "S" | "T";
  /** Transit windows only: the authored height in viewports (plan section 7.2). */
  vh?: number;
  /** The set piece lands at the end of the window instead of the middle. */
  land?: boolean;
  /** Stage caption key in content/film.json, transit windows only. */
  stage?: string;
  legs: Leg[];
};

export const SENSOR = 38.4;

const shot = (target: Vec3, W: number, f: number, az: number, el: number, sx = 0.5, sy = 0.5): Shot => ({ target, W, f, az, el, sx, sy });

const DIMM = PLACES.dimm;
const BOARD = PLACES.board;
/** Front face of the open app server, in the row opposite the GPUs. */
const APP: Vec3 = [-3, PLACES.appServerY + 0.02, 2.5];
const DIE: Vec3 = [0, 0, 0];
/** Front edge of the cut memory stack. */
const HBM_EDGE: Vec3 = [0.014, 0, 0];
const KV_SIDE: Vec3 = [-0.022, 0, 0];

// Screen anchors (plan C4.2): reading sections put the subject in the
// right-hand lane, transit windows right of centre, the hero on the horizon
// band above the console.
const S = { sx: 0.81, sy: 0.48 };
const T = { sx: 0.62, sy: 0.46 };
const H = { sx: 0.5, sy: 0.17 };

/**
 * The hero opens from 2.5 m above the floor, over the rack tops, yawed so the
 * aisle's far end sits upper right (plan 7.3, beat 0). Eye at x 1.0, over the
 * aisle centre line.
 */
export const START: Shot = shot([-5.29, 1.45, 4.57], 7.68, 35, 116, 0, H.sx, H.sy);

/**
 * Plan section 7.2, the route ledger, row by row: lens, framing width W,
 * azimuth and elevation at each element's exit. Deviations are logged in
 * docs/film-deviations.md.
 */
export const ROUTE: Beat[] = [
  // 0. Hero: slow dolly-in of 1 m with a 10 degree drift.
  { id: "hero", mode: "S", legs: [{ at: 1, shot: shot([-5.07, 1.4, 4.8], 7.1, 35, 121, 1, H.sx, H.sy) }] },
  // 1. T1: forward under the tray, pan onto the app server.
  { id: "T1", mode: "T", vh: 1.8, stage: "fabric", legs: [{ at: 1, shot: shot(APP, 1.65, 35, 168, 5, T.sx, T.sy) }] },
  {
    id: "work", mode: "S",
    legs: [
      // 2. Push to d 1.35, then P1: the lid's bright slit cuts to the gap of
      // the memory stick's cover, 35 mm to 60 mm.
      { at: 0.1, shot: shot(APP, 1.48, 35, 170, 5, S.sx, S.sy), cut: { kind: "slit", next: shot(DIMM, 0.576, 60, 190, 24, S.sx, S.sy) } },
      { at: 1, shot: shot(DIMM, 0.352, 60, 205, 21, S.sx, S.sy) },
    ],
  },
  // 3. T2: orbit and a slight rise onto the query point.
  { id: "T2", mode: "T", vh: 1.0, stage: "retrieval", legs: [{ at: 1, shot: shot(DIMM, 0.32, 60, 224, 16, T.sx, T.sy) }] },
  // 4. Opensource: slow dolly-out, orbiting.
  { id: "opensource", mode: "S", legs: [{ at: 1, shot: shot(DIMM, 0.48, 60, 244, 14, S.sx, S.sy) }] },
  {
    id: "T3", mode: "T", vh: 4.5, land: true, stage: "descent",
    legs: [
      // Act 1, the follow: up and out, then tracking along the tray.
      { at: 0.36, shot: shot([-1.5, 1.5, 1.5], 1.536, 50, 272, 0, T.sx, T.sy) },
      // Act 2, the drop: down to the GPU rack's front. P2: the 2 x 4 drive
      // bays cut to the 2 x 4 modules at the same place in frame, 50 to 85 mm.
      { at: 0.69, shot: shot([0, 0.05, 0.62], 1.075, 50, 300, 8, T.sx, T.sy), cut: { kind: "grid", next: shot([0, 0, 0.05], 0.497, 85, 4, 22, T.sx, T.sy) } },
      // Act 3, the descent: onto the package, landing on the sp3 frame.
      { at: 1, shot: shot(DIE, 0.2995, 100, 18, 42, T.sx, T.sy) },
    ],
  },
  // 6. Research: slow push-in.
  { id: "research", mode: "S", legs: [{ at: 1, shot: shot(DIE, 0.22, 100, 22, 46, S.sx, S.sy) }] },
  // 7. T4: push and lens tighten to the cut memory tower (sp4).
  { id: "T4", mode: "T", vh: 1.5, land: true, stage: "prefill", legs: [{ at: 1, shot: shot(HBM_EDGE, 0.055, 135, 40, 34, T.sx, T.sy) }] },
  // 8. Approach: low-angle settle.
  { id: "approach", mode: "S", legs: [{ at: 1, shot: shot(HBM_EDGE, 0.038, 135, 50, 26, S.sx, S.sy) }] },
  // 9. T5: lateral slide from the die to the tower top.
  { id: "T5", mode: "T", vh: 1.0, stage: "decode", legs: [{ at: 1, shot: shot(HBM_EDGE, 0.03, 135, 30, 28, T.sx, T.sy) }] },
  // 10. Measured: slow orbit and pull.
  { id: "measured", mode: "S", legs: [{ at: 1, shot: shot(HBM_EDGE, 0.036, 135, 8, 32, S.sx, S.sy) }] },
  // 11. T6: push to the cut face.
  { id: "T6", mode: "T", vh: 1.2, stage: "kv", legs: [{ at: 1, shot: shot(KV_SIDE, 0.028, 135, -10, 24, T.sx, T.sy) }] },
  // 12. Running: low lateral track along the bump row.
  { id: "running", mode: "S", legs: [{ at: 1, shot: shot(KV_SIDE, 0.034, 135, -18, 22, S.sx, S.sy) }] },
  {
    id: "T7", mode: "T", vh: 1.2, stage: "baseboard",
    legs: [
      // 13. Pull back at 135 mm, then FP1: the tower blurs out and the board
      // focuses in at 60 mm.
      { at: 0.58, shot: shot(KV_SIDE, 0.067, 135, -30, 26, T.sx, T.sy), cut: { kind: "focus", next: shot(BOARD, 0.397, 60, -40, 55, T.sx, T.sy) } },
      { at: 1, shot: shot(BOARD, 0.435, 60, -40, 57, T.sx, T.sy) },
    ],
  },
  // 14. Proof: slow crane-up to a top view.
  { id: "proof", mode: "S", legs: [{ at: 1, shot: shot(BOARD, 0.6, 60, -34, 62, S.sx, S.sy) }] },
  // 15. T8: crane out and orbit, lid and tray shell X-rayed.
  { id: "T8", mode: "T", vh: 1.6, stage: "rack", legs: [{ at: 1, shot: shot([0, 0.05, 0], 1.05, 60, 4, 52, T.sx, T.sy) }] },
  // 16. Education: pull-back while the lid returns and the door closes.
  { id: "education", mode: "S", legs: [{ at: 1, shot: shot([0, 0.05, 0], 1.3, 60, 7, 47, S.sx, S.sy) }] },
  {
    id: "T9", mode: "T", vh: 1.5, stage: "hall",
    legs: [
      // 17. Pull-back at 60 mm, then P2r: the closing door's hex holes cut to
      // the hall's wall of doors at the same pixel density, 60 to 35 mm.
      { at: 0.33, shot: shot([0, 0.05, 0], 1.9, 60, 14, 39, T.sx, T.sy), cut: { kind: "lattice", next: shot([-4, 0.5, 1.2], 5.5, 35, 80, 6, T.sx, T.sy) } },
      { at: 1, shot: shot([-9, 0.5, 1.5], 11.5, 35, 92, 3, T.sx, T.sy) },
    ],
  },
  // 18. Contact: slow dolly-out, the bookend.
  { id: "contact", mode: "S", legs: [{ at: 1, shot: shot([-12, 0.6, 1.9], 15.4, 35, 100, 2, S.sx, S.sy) }] },
];

/** Camera distance for a shot. */
export const distance = (s: Shot) => (s.W * s.f) / SENSOR;
