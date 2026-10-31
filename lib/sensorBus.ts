/**
 * The sensor bus: one place every input is read, smoothed and handed out.
 *
 * Inputs are sampled inside a single requestAnimationFrame loop that runs only
 * while something is still moving, so a page at rest costs nothing. Values are
 * written to a mutable singleton and to CSS custom properties on the document
 * root; subscribers (the WebGL field, magnetic controls) read them on the same
 * frame. Nothing here ever touches React state, because a re-render per pointer
 * event is exactly the jank the page exists to avoid.
 *
 * Scroll position is read from `window.scrollY` inside the loop rather than from
 * a scroll listener; the loop is woken by the page's ScrollTrigger update and by
 * pointer and orientation events.
 *
 *   scroll      progress through the document, 0..1
 *   velocity    scroll speed in px/s, critically damped (omega 6)
 *   pointer     -1..1 in both axes, on a 100/20 spring
 *   tilt        -1..1 from device orientation, low pass 0.12, clamped at 18 degrees
 *   idle        true after 6s without input
 *   visible     false while the tab is hidden
 */

import { reducedMotion } from "./verbs";

export type SensorState = {
  scroll: number;
  scrollY: number;
  velocity: number;
  pointer: { x: number; y: number };
  tilt: { x: number; y: number; active: boolean };
  idle: boolean;
  visible: boolean;
  reduced: boolean;
};

type Listener = (state: SensorState) => void;

const OMEGA_VELOCITY = 6;
const SPRING_STIFFNESS = 100;
const SPRING_DAMPING = 20;
const IDLE_MS = 6000;
const TILT_LOWPASS = 0.12;
const TILT_CLAMP = 18;

export const sensors: SensorState = {
  scroll: 0,
  scrollY: 0,
  velocity: 0,
  pointer: { x: 0, y: 0 },
  tilt: { x: 0, y: 0, active: false },
  idle: false,
  visible: true,
  reduced: false,
};

const listeners = new Set<Listener>();
let started = false;
let frame = 0;
let lastTime = 0;
let lastScrollY = 0;
let rawVelocity = 0;
let lastInput = 0;
let idleTimer = 0;
const pointerGoal = { x: 0, y: 0 };
const pointerVel = { x: 0, y: 0 };
const tiltGoal = { x: 0, y: 0 };

function writeCss() {
  const root = document.documentElement.style;
  root.setProperty("--scroll-p", sensors.scroll.toFixed(4));
  if (sensors.reduced) {
    root.setProperty("--scroll-v", "0");
    root.setProperty("--pointer-x", "0.5");
    root.setProperty("--pointer-y", "0.5");
    return;
  }
  root.setProperty("--scroll-v", Math.min(Math.abs(sensors.velocity), 4000).toFixed(0));
  const px = sensors.tilt.active ? sensors.tilt.x : sensors.pointer.x;
  const py = sensors.tilt.active ? sensors.tilt.y : sensors.pointer.y;
  root.setProperty("--pointer-x", ((px + 1) / 2).toFixed(4));
  root.setProperty("--pointer-y", ((py + 1) / 2).toFixed(4));
}

function tick(now: number) {
  frame = 0;
  const dt = Math.min(Math.max((now - lastTime) / 1000, 1 / 240), 1 / 20);
  lastTime = now;
  sensors.reduced = reducedMotion();

  // Scroll: position and a critically damped velocity.
  const y = window.scrollY;
  const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  sensors.scrollY = y;
  sensors.scroll = Math.min(Math.max(y / max, 0), 1);
  const instant = (y - lastScrollY) / dt;
  lastScrollY = y;
  rawVelocity += (instant - rawVelocity) * Math.min(1, OMEGA_VELOCITY * dt);
  sensors.velocity += (rawVelocity - sensors.velocity) * Math.min(1, OMEGA_VELOCITY * dt);

  // Pointer: a spring toward the last reading.
  for (const k of ["x", "y"] as const) {
    const offset = sensors.pointer[k] - pointerGoal[k];
    pointerVel[k] += (-SPRING_STIFFNESS * offset - SPRING_DAMPING * pointerVel[k]) * dt;
    sensors.pointer[k] += pointerVel[k] * dt;
  }

  // Tilt: low pass.
  sensors.tilt.x += (tiltGoal.x - sensors.tilt.x) * TILT_LOWPASS;
  sensors.tilt.y += (tiltGoal.y - sensors.tilt.y) * TILT_LOWPASS;

  if (Math.abs(instant) > 0.5) markInput(now);
  sensors.idle = now - lastInput > IDLE_MS;

  const moving =
    Math.abs(sensors.velocity) > 1 ||
    Math.abs(instant) > 0.5 ||
    Math.abs(sensors.pointer.x - pointerGoal.x) > 1e-3 ||
    Math.abs(sensors.pointer.y - pointerGoal.y) > 1e-3 ||
    Math.abs(pointerVel.x) > 1e-3 ||
    Math.abs(pointerVel.y) > 1e-3 ||
    Math.abs(sensors.tilt.x - tiltGoal.x) > 1e-3 ||
    Math.abs(sensors.tilt.y - tiltGoal.y) > 1e-3;

  // The last sample before the loop sleeps reports rest, so a consumer never
  // holds the final nonzero velocity (a frozen streak) while nothing moves.
  if (!moving) {
    sensors.velocity = 0;
    rawVelocity = 0;
  }

  writeCss();
  listeners.forEach((fn) => fn(sensors));

  if (moving && sensors.visible) wake();
}

/*
 * The loop sleeps at rest, so idleness cannot be noticed by sampling. Every input
 * arms one timer that wakes the loop just after the idle threshold passes.
 */
function markInput(now: number) {
  lastInput = now;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(wake, IDLE_MS + 50);
}

/** Schedules one sample; the loop keeps itself alive only while values are still moving. */
export function wake() {
  if (!started || frame || !sensors.visible) return;
  frame = requestAnimationFrame(tick);
}

/** Subscribe to every sample. Returns an unsubscribe. Called on the rAF frame, never during render. */
export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const onPointer = (e: PointerEvent) => {
  if (e.pointerType === "touch") return;
  pointerGoal.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerGoal.y = (e.clientY / window.innerHeight) * 2 - 1;
  markInput(performance.now());
  wake();
};

const onOrientation = (e: DeviceOrientationEvent) => {
  if (e.gamma == null || e.beta == null) return;
  const clamp = (v: number) => Math.max(-TILT_CLAMP, Math.min(TILT_CLAMP, v)) / TILT_CLAMP;
  tiltGoal.x = clamp(e.gamma);
  tiltGoal.y = clamp(e.beta - 45);
  sensors.tilt.active = true;
  markInput(performance.now());
  wake();
};

const onVisibility = () => {
  sensors.visible = document.visibilityState !== "hidden";
  if (sensors.visible) {
    lastTime = performance.now();
    wake();
  } else if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  listeners.forEach((fn) => fn(sensors));
};

/** Idempotent. Attaches the input listeners once for the page's lifetime. */
export function startSensors() {
  if (started || typeof window === "undefined") return;
  started = true;
  lastTime = performance.now();
  markInput(lastTime);
  lastScrollY = window.scrollY;
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  wake();
}

/**
 * Device tilt needs an explicit permission on iOS. Called from the "Use device
 * tilt" button only (plan 3.4); resolves false when denied or unsupported, and
 * the page keeps its pointer-free idle behaviour.
 */
export async function enableTilt(): Promise<boolean> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return false;
  const ctor = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (typeof ctor.requestPermission === "function") {
      const answer = await ctor.requestPermission();
      if (answer !== "granted") return false;
    }
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    return true;
  } catch {
    return false;
  }
}

/** Whether this device offers orientation at all, for showing the tilt button once. */
export function tiltAvailable() {
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window && window.matchMedia("(pointer: coarse)").matches;
}
