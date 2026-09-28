import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import field from "@/lib/agent/field.json";
import { KEYS } from "./beats";
import { eyeOf, packetAt, poseAt, step } from "./camera";
import { measure, uAt } from "./timeline";
import { buildWorld } from "./world/greybox";

type Triggers = typeof import("gsap/ScrollTrigger").ScrollTrigger;

/** Reads a CSS colour (any syntax the browser knows) as an sRGB THREE.Color. */
function cssColour(value: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d");
  if (!g) return new THREE.Color(0x121416);
  g.fillStyle = value;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace);
}

const PARK_AFTER = 45_000;

/**
 * The film renderer. One scene, one camera, one packet. The camera goal is read
 * from the scroll position every frame; the spring carries the camera to it.
 * While the reader holds still the camera makes a slow orbit around the goal,
 * and after PARK_AFTER of stillness the loop stops until the next scroll.
 */
export function start(host: HTMLElement, ScrollTrigger: Triggers) {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const ground = cssColour(getComputedStyle(document.body).getPropertyValue("--paper").trim() || getComputedStyle(document.body).backgroundColor);
  renderer.setClearColor(ground, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(ground, 0.02);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new RoomEnvironment();
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x101214, 0.2));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(4, 8, 6);
  scene.add(key);

  const world = buildWorld(field.particles);
  scene.add(world.root);

  const packetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 0.31, 0, THREE.SRGBColorSpace) });
  const packet = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), packetMat);
  scene.add(packet);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  const pose = new Float64Array(7);
  const vel = new Float64Array(7);
  const goal = new Float64Array(7);
  let points = measure();
  const debug = new URLSearchParams(location.search).get("film") === "debug";
  const framed = new URLSearchParams(location.search).get("frame")?.match(/^film:([\d.]+)$/);
  let u = framed ? Number(framed[1]) : uAt(points, window.scrollY);
  poseAt(u, pose);

  let last = performance.now();
  let lastInput = last;
  let raf = 0;
  let stopped = false;
  const eye = new THREE.Vector3();
  const frames: number[] = [];
  const stats = { u, beat: KEYS[0].id, p95: 0, draws: 0, tris: 0 };

  function resize() {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now: number) {
    raf = 0;
    if (stopped) return;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30);
    frames.push(now - last);
    last = now;
    if (frames.length >= 45) {
      const sorted = [...frames].sort((a, b) => a - b);
      stats.p95 = sorted[Math.floor(sorted.length * 0.95)];
      frames.length = 0;
    }

    if (!framed) u = uAt(points, window.scrollY);
    poseAt(u, goal);
    // Ambient orbit while the reader holds still.
    const orbit = Math.sin(now / 3183) * 1.5;
    goal[4] += orbit;
    if (framed) pose.set(goal);
    else step(pose, vel, goal, dt);

    const d = Math.exp(pose[3]);
    const [ex, ey, ez] = eyeOf(pose);
    eye.set(ex, ey, ez);
    camera.position.copy(eye);
    camera.fov = pose[6];
    camera.near = Math.max(0.0004, d * 0.02);
    camera.far = Math.max(60, d * 600);
    camera.lookAt(pose[0], pose[1], pose[2]);
    camera.updateProjectionMatrix();
    (scene.fog as THREE.FogExp2).density = 0.4 / d;

    const [px, py, pz] = packetAt(u);
    packet.position.set(px, py, pz);
    packet.scale.setScalar(d * 0.006);

    // The cold plate lifts as the camera arrives at the module.
    const lift = Math.min(1, Math.max(0, u - KEYS.findIndex((k) => k.id === "B4d")));
    world.setLift(lift);
    world.cull(eye);

    renderer.render(scene, camera);
    stats.u = u;
    stats.beat = KEYS[Math.round(Math.min(Math.max(u, 0), KEYS.length - 1))].id;
    stats.draws = renderer.info.render.calls;
    stats.tris = renderer.info.render.triangles;

    if (framed && !document.documentElement.dataset.frameReady) {
      requestAnimationFrame(() => (document.documentElement.dataset.frameReady = "true"));
    }
    if (framed) return;
    if (now - lastInput < PARK_AFTER) raf = requestAnimationFrame(frame);
  }

  function wake() {
    lastInput = performance.now();
    if (!raf && !stopped) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  resize();
  window.addEventListener("resize", resize);
  const trigger = ScrollTrigger.create({ start: 0, end: "max", onUpdate: wake });
  const remeasure = () => {
    points = measure();
    wake();
  };
  ScrollTrigger.addEventListener("refresh", remeasure);

  if (debug) (window as unknown as { __film: typeof stats }).__film = stats;
  document.documentElement.dataset.film = "live";
  wake();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    trigger.kill();
    ScrollTrigger.removeEventListener("refresh", remeasure);
    window.removeEventListener("resize", resize);
    delete document.documentElement.dataset.film;
    world.dispose();
    packet.geometry.dispose();
    packetMat.dispose();
    pmrem.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
