export type Point = { x: number; y: number };
export const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/** Analytic two-bone IK; unreachable targets are projected onto the reach circle. */
export function solveArm(shoulder: Point, target: Point, bend: 1 | -1, upper = 13, lower = 12) {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y;
  const distance = clamp(Math.hypot(dx, dy), Math.abs(upper - lower) + .001, upper + lower - .001);
  const direction = Math.atan2(dy, dx);
  const offset = Math.acos(clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1));
  const angle = direction + bend * offset;
  const elbow = { x: shoulder.x + Math.cos(angle) * upper, y: shoulder.y + Math.sin(angle) * upper };
  const hand = { x: shoulder.x + Math.cos(direction) * distance, y: shoulder.y + Math.sin(direction) * distance };
  return { elbow, hand, upper: angle - Math.PI / 2, lower: Math.atan2(hand.y - elbow.y, hand.x - elbow.x) - angle };
}

export function springStep(position: number, velocity: number, target: number, seconds: number) {
  const dt = clamp(seconds, 0, .032);
  const nextVelocity = velocity + ((target - position) * 100 - velocity * 16) * dt;
  return { position: position + nextVelocity * dt, velocity: nextVelocity };
}

export type ScrollBurst = { start: number; last: number; reset: boolean };
/** A pause breaks the burst; a single wheel event cannot trigger a reset. */
export function scrollBurst(previous: ScrollBurst | null, now: number): ScrollBurst {
  const start = !previous || now - previous.last > 160 ? now : previous.start;
  return { start, last: now, reset: now - start >= 1000 };
}
