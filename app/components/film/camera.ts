import type { State } from "./plan";

/**
 * Camera state (see plan.ts): target xyz, ln W, azimuth, elevation, ln f,
 * screen anchor sx, sy. W is the framing width in metres and f the focal
 * length in full-frame millimetres; distance is W * f / 38.4.
 */
const rad = Math.PI / 180;

export function distanceOf(s: State) {
  return (Math.exp(s[3]) * Math.exp(s[6])) / 38.4;
}

/** Eye position for a state, written into `out`. */
export function eyeOf(s: State, out: [number, number, number]) {
  const d = distanceOf(s);
  const az = s[4] * rad;
  const el = s[5] * rad;
  out[0] = s[0] + d * Math.cos(el) * Math.sin(az);
  out[1] = s[1] + d * Math.sin(el);
  out[2] = s[2] + d * Math.cos(el) * Math.cos(az);
  return out;
}

/** Vertical field of view in degrees for a 24 mm tall sensor. */
export function fovOf(s: State) {
  return (2 * Math.atan(12 / Math.exp(s[6])) * 180) / Math.PI;
}

/**
 * Critically damped spring on the whole state: the fastest approach to the
 * goal that never overshoots it. A flick of the scroll wheel moves the goal
 * further than a reader can follow, so each channel's speed is capped and the
 * camera arrives late rather than fast: 1 unit of apparent scale per second,
 * 45 degrees per second, and 2 camera distances per second of travel.
 */
const OMEGA = 3.5;
const CAP = [0, 0, 0, 1.0, 45, 45, 0.6, 0.5, 0.5];

export function step(pose: State, velocity: State, goal: State, dt: number) {
  let moving = false;
  const d = distanceOf(pose);
  for (let i = 0; i < 9; i++) {
    const offset = pose[i] - goal[i];
    velocity[i] += (-2 * OMEGA * velocity[i] - OMEGA * OMEGA * offset) * dt;
    if (i >= 3) velocity[i] = Math.max(-CAP[i], Math.min(CAP[i], velocity[i]));
  }
  // Target travel is capped as one vector, in camera distances per second.
  const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
  const max = 2 * d;
  if (speed > max) for (let i = 0; i < 3; i++) velocity[i] *= max / speed;
  for (let i = 0; i < 9; i++) {
    pose[i] += velocity[i] * dt;
    const scale = i < 3 ? d * 1e-3 : 1e-4;
    if (Math.abs(pose[i] - goal[i]) > scale || Math.abs(velocity[i]) > scale * 10) moving = true;
  }
  if (!moving) {
    pose.set(goal);
    velocity.fill(0);
  }
  return moving;
}
