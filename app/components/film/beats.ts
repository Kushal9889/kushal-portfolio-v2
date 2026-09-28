/**
 * The film's single source of camera poses.
 *
 * World units are metres and the hero GPU die sits at the origin, so the
 * smallest shots have the smallest coordinates and float precision is spent
 * where the camera is closest. Each key is a pose the camera passes through;
 * the page decides when (see timeline.ts), this file decides where.
 *
 * A pose is a look-at target plus a spherical offset: distance d in metres,
 * azimuth and elevation in degrees, vertical field of view in degrees.
 * Azimuth 0 puts the eye on the +z side of the target, 90 on the +x side.
 * Distance is interpolated in log space, so one unit of scroll is the same
 * zoom factor in the hall and at the die.
 */
export type Pose = {
  target: [number, number, number];
  d: number;
  az: number;
  el: number;
  fov: number;
};

export type Key = {
  id: string;
  /** Page element the key belongs to: a section id or a transit window id. */
  anchor: string;
  pose: Pose;
  /** Where the protagonist packet is while the camera holds this key. */
  packet: [number, number, number];
};

const p = (target: Pose["target"], d: number, az: number, el: number, fov = 40): Pose => ({ target, d, az, el, fov });

/** Positions shared by the world builder and the keys, so the two cannot drift. */
export const PLACES = {
  /** The hero rack stands at the end of its row, so its +x side is open aisle. */
  heroRack: [0, 0, 0] as [number, number, number],
  floorY: -1.05,
  /** Cold aisle centre line, in front of the GPU row. */
  aisleZ: 1.2,
  /** The app rack stands in the opposite row, facing the GPU row. */
  appRack: [-3, 0, 2.4] as [number, number, number],
  appServerY: 0.3,
  /** The DIMM the vector space opens out of. */
  dimm: [-3, 0.315, 2.25] as [number, number, number],
  /** Centre of the eight-module baseboard; the hero module is one of its slots. */
  board: [-0.0475, -0.012, -0.08] as [number, number, number],
  /** Overhead fibre tray height. */
  trayY: 2.05,
};

const DIMM = PLACES.dimm;
const BOARD = PLACES.board;

export const KEYS: Key[] = [
  { id: "B0", anchor: "hero", pose: p([-6, 0.2, 1.2], 16, 90, 2), packet: [11, 1.6, 1.2] },
  { id: "B1", anchor: "T1", pose: p([-1.5, 1.9, 1.2], 4.2, 118, 8), packet: [-1.5, PLACES.trayY, 1.2] },
  { id: "B1b", anchor: "T1", pose: p([-3, 0.32, 1.75], 1.1, 180, 9), packet: [-3, PLACES.appServerY + 0.02, 1.82] },
  { id: "B2", anchor: "work", pose: p(DIMM, 0.13, 205, 22, 38), packet: DIMM },
  { id: "T2", anchor: "T2", pose: p(DIMM, 0.1, 250, 14, 38), packet: DIMM },
  { id: "B3", anchor: "opensource", pose: p([DIMM[0] + 0.02, DIMM[1] + 0.01, DIMM[2]], 0.085, 300, 18, 38), packet: [DIMM[0] + 0.02, DIMM[1] + 0.01, DIMM[2]] },
  { id: "B4a", anchor: "T3", pose: p([-3, 0.33, 2.2], 0.6, 190, 22), packet: [-3, 0.33, 2.2] },
  { id: "B4b", anchor: "T3", pose: p([-1.6, 0.4, 1.3], 3.4, 150, 14), packet: [-1.6, 0.3, 1.2] },
  { id: "B4c", anchor: "T3", pose: p([0, 0.05, 0.6], 1.7, 25, 9), packet: [0, 0.05, 0.62] },
  { id: "B4d", anchor: "T3", pose: p([0, 0.03, 0.45], 0.42, 4, 7, 38), packet: [0, 0.03, 0.46] },
  { id: "B4e", anchor: "T3", pose: p([0, 0, 0], 0.17, 18, 38, 34), packet: [0, 0.004, 0.05] },
  { id: "B5", anchor: "research", pose: p([0, 0, 0], 0.036, 30, 55, 30), packet: [0, 0.0012, 0] },
  { id: "T4", anchor: "T4", pose: p([0.014, 0, 0], 0.046, 62, 30, 32), packet: [0.018, 0.001, 0] },
  { id: "B6", anchor: "approach", pose: p([0, 0, 0], 0.052, 30, 35, 32), packet: [0, 0.0012, 0] },
  { id: "T5", anchor: "T5", pose: p([0, 0, 0], 0.12, -20, 40, 34), packet: [0, 0.0012, 0] },
  { id: "B7", anchor: "measured", pose: p([0, 0, 0], 0.15, -32, 35, 34), packet: [0, 0.0012, 0] },
  { id: "T6", anchor: "T6", pose: p([-0.02, 0, 0], 0.042, -80, 16, 32), packet: [-0.022, 0.003, 0] },
  { id: "B8", anchor: "running", pose: p([-0.022, 0, 0], 0.031, -92, 20, 30), packet: [-0.022, 0.003, 0.01] },
  { id: "T7", anchor: "T7", pose: p(BOARD, 0.3, -40, 55, 38), packet: [0, 0.004, 0] },
  { id: "B9", anchor: "proof", pose: p(BOARD, 0.55, 10, 65, 40), packet: [0, 0.004, 0] },
  { id: "T8", anchor: "T8", pose: p([0, 0.3, 0], 1.0, 70, 24, 42), packet: [0, 0.03, 0] },
  { id: "B10", anchor: "education", pose: p([0, 0.05, 0], 1.8, 90, 10, 45), packet: [0, 0.05, 0] },
  { id: "T9", anchor: "T9", pose: p([-4, 0.5, 1.2], 8, 100, 15, 48), packet: [-2, PLACES.trayY, 1.2] },
  { id: "B11", anchor: "contact", pose: p([-6, 0, 1.2], 22, 110, 18, 50), packet: [12, PLACES.trayY, 1.2] },
];

/** Transit windows in page order, with the height each one takes. */
export const TRANSITS: { id: string; after: string; tall: boolean; stage: string }[] = [
  { id: "T1", after: "hero", tall: true, stage: "fabric" },
  { id: "T2", after: "work", tall: false, stage: "retrieval" },
  { id: "T3", after: "opensource", tall: true, stage: "descent" },
  { id: "T4", after: "research", tall: false, stage: "prefill" },
  { id: "T5", after: "approach", tall: false, stage: "decode" },
  { id: "T6", after: "measured", tall: false, stage: "kv" },
  { id: "T7", after: "running", tall: false, stage: "baseboard" },
  { id: "T8", after: "proof", tall: false, stage: "rack" },
  { id: "T9", after: "education", tall: false, stage: "hall" },
];
