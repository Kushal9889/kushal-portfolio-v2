/**
 * Where things stand in the film's world.
 *
 * World units are metres and the hero GPU die sits at the origin, so the
 * smallest shots have the smallest coordinates and float precision is spent
 * where the camera is closest. Azimuth 0 puts a camera on the +z side of its
 * target, 90 on the +x side. The shots live in shots.ts.
 */
/** Positions shared by the world builder and the keys, so the two cannot drift. */
export const PLACES = {
  /** The hero rack stands at the end of its row, so its +x side is open aisle. */
  heroRack: [0, 0, 0] as [number, number, number],
  floorY: -1.05,
  /**
   * Cold aisle centre line, in front of the GPU row. The aisle is 1.8 m, three
   * tiles: the shot ledger frames the app server from 1.5 m away, which a
   * 1.2 m aisle cannot hold (docs/film-deviations.md, D1).
   */
  aisleZ: 1.5,
  /** Centre line of the opposite row, whose fronts face the GPU row. */
  northZ: 3.0,
  /** The app rack stands in the opposite row, facing the GPU row. */
  appRack: [-3, 0, 3.0] as [number, number, number],
  appServerY: 0.3,
  /** The DIMM the vector space opens out of. */
  dimm: [-3, 0.315, 2.7] as [number, number, number],
  /** Centre of the eight-module baseboard; the hero module is one of its slots. */
  board: [-0.0475, -0.012, -0.08] as [number, number, number],
  /** Overhead fibre tray height. */
  trayY: 2.05,
};
