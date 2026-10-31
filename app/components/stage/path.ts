import type { Vec3 } from "./cloud-gl";

/**
 * Centripetal Catmull-Rom through a list of points, sampled at `t` in 0..1 across
 * the whole list. Centripetal rather than uniform because the stations sit at
 * very different distances apart, and the uniform form overshoots and loops on
 * short segments next to long ones.
 *
 * The curve passes through every point, so a station is exactly where the camera
 * is when a chapter is read, and the path between stations bends instead of
 * cornering.
 */
export function catmull(points: Vec3[], t: number): Vec3 {
  const n = points.length;
  if (n === 0) return [0, 0, 0];
  if (n === 1) return points[0];
  const scaled = Math.min(Math.max(t, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(scaled), n - 2);
  return segment(points, i, scaled - i);
}

/** Point `u` (0..1) along the segment from `points[i]` to `points[i + 1]`. */
export function segment(points: Vec3[], i: number, u: number): Vec3 {
  const n = points.length;
  const p1 = points[i];
  const p2 = points[Math.min(i + 1, n - 1)];
  // Phantom ends mirror the first and last segments, so the curve starts and
  // ends heading along them.
  const p0 = i > 0 ? points[i - 1] : reflect(p2, p1);
  const p3 = i + 2 < n ? points[i + 2] : reflect(p1, p2);

  const knot = (a: Vec3, b: Vec3) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) || 1e-4;
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * Math.min(Math.max(u, 0), 1);

  const lerp = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const w = tb === ta ? 0 : (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

function reflect(from: Vec3, about: Vec3): Vec3 {
  return [2 * about[0] - from[0], 2 * about[1] - from[1], 2 * about[2] - from[2]];
}

/** Smoothstep on 0..1: dwell at both ends, move through the middle. */
export const dwell = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
