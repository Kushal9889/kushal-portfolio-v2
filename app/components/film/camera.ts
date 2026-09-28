import { segment } from "../stage/path";
import type { Vec3 } from "../stage/cloud-gl";
import { KEYS, type Pose } from "./beats";

/**
 * The camera state is a 7-vector: target xyz, ln(distance), azimuth, elevation,
 * field of view. Interpolating ln(d) rather than d is what makes one scroll unit
 * the same zoom factor at 16 metres and at 3 centimetres.
 */
export type State = Float64Array;

const rad = Math.PI / 180;

function toVec(pose: Pose): number[] {
  return [...pose.target, Math.log(pose.d), pose.az, pose.el, pose.fov];
}

const TARGETS: Vec3[] = KEYS.map((k) => k.pose.target);
const ORBITS: Vec3[] = KEYS.map((k) => [Math.log(k.pose.d), k.pose.az, k.pose.el]);
const PACKETS: Vec3[] = KEYS.map((k) => k.packet);

/** Pose at float key index u (0 .. KEYS.length - 1), through every key. */
export function poseAt(u: number, out: State) {
  const n = KEYS.length;
  const c = Math.min(Math.max(u, 0), n - 1);
  const i = Math.min(Math.floor(c), n - 2);
  const f = c - i;
  const t = segment(TARGETS, i, f);
  const o = segment(ORBITS, i, f);
  const fov = KEYS[i].pose.fov + (KEYS[i + 1].pose.fov - KEYS[i].pose.fov) * f;
  out[0] = t[0];
  out[1] = t[1];
  out[2] = t[2];
  out[3] = o[0];
  out[4] = o[1];
  out[5] = o[2];
  out[6] = fov;
  return out;
}

export function packetAt(u: number): Vec3 {
  const n = KEYS.length;
  const c = Math.min(Math.max(u, 0), n - 1);
  const i = Math.min(Math.floor(c), n - 2);
  return segment(PACKETS, i, c - i);
}

/** Eye position for a state. */
export function eyeOf(s: State): Vec3 {
  const d = Math.exp(s[3]);
  const az = s[4] * rad;
  const el = s[5] * rad;
  return [s[0] + d * Math.cos(el) * Math.sin(az), s[1] + d * Math.sin(el), s[2] + d * Math.cos(el) * Math.cos(az)];
}

/**
 * Critically damped spring on the whole state, the same law the stage field
 * uses: the fastest approach to the goal that never overshoots it. Returns
 * whether it is still moving.
 */
const OMEGA = 7.5;
export function step(pose: State, velocity: State, goal: State, dt: number) {
  let moving = false;
  for (let i = 0; i < 7; i++) {
    const offset = pose[i] - goal[i];
    velocity[i] += (-2 * OMEGA * velocity[i] - OMEGA * OMEGA * offset) * dt;
    pose[i] += velocity[i] * dt;
    const scale = i < 3 ? Math.exp(pose[3]) * 1e-3 : 1e-4;
    if (Math.abs(pose[i] - goal[i]) > scale || Math.abs(velocity[i]) > scale * 10) moving = true;
  }
  if (!moving) {
    pose.set(goal);
    velocity.fill(0);
  }
  return moving;
}

export { toVec };
